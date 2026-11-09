from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from app.main import app, KINDS

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('SIDEWORK_DB', str(tmp_path / 'test.db'))
    monkeypatch.delenv('SIDEWORK_API_KEY', raising=False)
    with TestClient(app) as c:
        yield c

def upload(client, kind, text):
    return client.post('/api/imports/preview', params={'kind': kind}, files={'file': ('data.csv', text, 'text/csv')})

def seed(client):
    for kind in KINDS:
        raw = (Path(__file__).parent.parent / 'sample_data' / f'{kind}.csv').read_bytes()
        response = upload(client, kind, raw)
        assert response.status_code == 201, response.text
        item = response.json()
        assert not item['errors']
        assert client.post(f'/api/imports/{item["id"]}/commit').status_code == 200

def test_full_demo_traceability_and_idempotency(client):
    seed(client)
    seed(client)
    report = client.get('/api/briefing?on=2026-11-09').json()
    assert report['metrics']['net_sales']['amount_cents'] == 102000
    assert report['metrics']['estimated_wages']['amount_cents'] == 32000
    assert report['metrics']['recorded_purchases']['amount_cents'] == 9600
    assert report['metrics']['estimated_wage_to_sales_percent'] == 31.37
    assert report['changes_vs_previous_day']['estimated_wages']['amount_cents'] == 4000
    assert not report['missing_data']
    assert len(report['alerts']) == 4
    increase = next(a for a in report['alerts'] if a['type'] == 'supplier_price_increase')
    assert increase['change_percent'] == 20
    for alert in report['alerts']:
        for source in alert['sources']:
            assert client.get(source['url']).json()['source'] == source
    assert client.get('/api/records').json()['total'] == 14
    answer = client.post('/api/ask', json={'on': '2026-11-09', 'question': 'What needs attention today?'}).json()
    assert answer['supported'] and answer['sources']
    assert client.post('/api/ask', json={'on': '2026-11-09', 'question': 'Predict demand next month'}).json()['supported'] is False

def test_invalid_file_never_partially_imports(client):
    text = 'external_id,date,item,quantity,net_sales\na,2026-11-09,Latte,1,6.00\nb,2026-11-09,Latte,1,NaN\n'
    preview = upload(client, 'sales', text).json()
    assert preview['status'] == 'invalid'
    assert preview['errors'][0]['row_number'] == 3
    assert client.post(f'/api/imports/{preview["id"]}/commit').status_code == 422
    assert client.get('/api/records').json()['total'] == 0

def test_conflicting_external_id_is_atomic(client):
    base = 'external_id,date,item,quantity,net_sales\n'
    first = upload(client, 'sales', base + 'a,2026-11-09,Latte,1,6.00\n').json()
    client.post(f'/api/imports/{first["id"]}/commit')
    second = upload(client, 'sales', base + 'b,2026-11-09,Tea,1,3.00\na,2026-11-09,Latte,1,7.00\n').json()
    assert client.post(f'/api/imports/{second["id"]}/commit').status_code == 409
    assert client.get('/api/records').json()['total'] == 1

def test_missing_data_and_historical_cutoff(client):
    seed(client)
    empty = client.get('/api/briefing?on=2026-11-07').json()
    assert empty['metrics']['net_sales']['amount_cents'] is None
    assert empty['metrics']['estimated_wage_to_sales_percent'] is None
    assert len(empty['missing_data']) == 3
    assert not empty['alerts'] and not empty['inventory_as_of']
    old = client.get('/api/briefing?on=2026-11-08').json()
    assert old['metrics']['net_sales']['amount_cents'] == 102000
    assert not old['alerts']

@pytest.mark.parametrize('row', [
    'a,2026-02-30,Tea,1,3.00', 'a,2026-11-09,Tea,-1,3.00',
    'a,2026-11-09,Tea,1,3.001', 'a,2026-11-09,Tea,Infinity,3.00',
    'a,2026-11-09,Tea,1', 'a,2026-11-09,Tea,1,3.00,extra',
])
def test_bad_rows(client, row):
    p = upload(client, 'sales', 'external_id,date,item,quantity,net_sales\n' + row).json()
    assert p['errors'] and p['status'] == 'invalid'

def test_headers_size_and_auth(client, monkeypatch):
    assert upload(client, 'sales', 'wrong,headers\na,b\n').status_code == 422
    assert upload(client, 'sales', b'x' * 2_000_001).status_code == 413
    monkeypatch.setenv('SIDEWORK_API_KEY', 'test-secret')
    assert client.get('/api/records').status_code == 401
    assert client.get('/health', headers={'X-API-Key': 'test-secret'}).status_code == 200

def test_latest_inventory_snapshot_and_aggregation(client):
    text = 'external_id,date,ingredient,quantity,unit,expires_on,low_stock_threshold\na,2026-11-08,Milk,20,l,2026-11-09,5\nb,2026-11-09,Milk,2,l,2026-11-11,5\nc,2026-11-09,Milk,4,l,2026-11-12,5\n'
    p = upload(client, 'inventory', text).json()
    client.post(f'/api/imports/{p["id"]}/commit')
    latest = client.get('/api/inventory?on=2026-11-09').json()['items'][0]
    assert latest['quantity'] == '6' and len(latest['batches']) == 2
    alerts = client.get('/api/alerts?on=2026-11-09').json()['alerts']
    assert all(a['type'] not in ['low_stock', 'past_recorded_expiration'] for a in alerts)

def test_concurrent_commit_is_idempotent(client):
    raw = (Path(__file__).parent.parent / 'sample_data' / 'sales.csv').read_bytes()
    p = upload(client, 'sales', raw).json()
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(lambda _: client.post(f'/api/imports/{p["id"]}/commit'), range(2)))
    assert all(r.status_code == 200 for r in responses)
    assert client.get('/api/records').json()['total'] == 4
