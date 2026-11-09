import csv
import io
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('SIDEWORK_DB', str(tmp_path / 'workspace.db'))
    monkeypatch.delenv('SIDEWORK_API_KEY', raising=False)
    with TestClient(app) as c:
        yield c

def import_labor(c, raw=None):
    raw = raw or (Path(__file__).parent.parent/'sample_data/labor.csv').read_bytes()
    p = c.post('/api/imports/preview?kind=labor', files={'file': ('hours.csv', raw)}).json()
    assert c.post(f'/api/imports/{p["id"]}/commit').status_code == 200

def doc(c, **kw):
    r=c.post('/api/documents',json={'title':'Operating permit','category':'permit','deadline':'2026-11-12',**kw})
    assert r.status_code==201,r.text
    return r.json()

def order_body():
    return {'supplier':'Local Dairy','due_on':'2026-11-12','lines':[{'ingredient':'Milk','quantity':'20.5','unit':'l','unit_cost_cents':360}]}

def schedule_body():
    b=order_body(); del b['due_on']
    return b|{'first_due_on':'2026-11-10','every_days':7,'until':'2026-12-01'}

def test_service_summary(client):
    empty=client.get('/api/service-summary?on=2026-11-09').json()
    assert empty['net_sales_cents'] is None and empty['total_hours'] is None
    import_labor(client)
    b=client.get('/api/service-summary?on=2026-11-09').json()
    assert b['total_hours']=='16' and b['employee_count']==2
    assert b['estimated_base_wages_cents']==32000 and b['missing_data']==['sales']
    assert len(b['labor_sources'])==2

@pytest.mark.parametrize('provider,kind',[('toast','sales'),('7shifts','labor'),('marketman','inventory'),('restaurant365','purchases')])
def test_provider_uploads(client,provider,kind):
    raw=(Path(__file__).parent.parent/f'sample_data/{kind}.csv').read_bytes()
    p=client.post(f'/api/providers/{provider}/imports/preview?kind={kind}',files={'file':('vendor.csv',raw)})
    assert p.status_code==201,p.text
    assert client.get(f'/api/providers/{provider}?on=2026-11-09').json()['records']==[]
    assert client.post(p.json()['next']).status_code==200
    view=client.get(f'/api/providers/{provider}?on=2026-11-09').json()
    assert view['records'] and view['status']=='not_connected' and not view['live_sync']
    assert client.post(f'/api/providers/{provider}/sync').status_code==409

def test_provider_attribution_conflicts(client):
    assert len(client.get('/api/providers').json()['providers'])==4
    raw=(Path(__file__).parent.parent/'sample_data/labor.csv').read_bytes()
    assert client.post('/api/providers/toast/imports/preview?kind=labor',files={'file':('x.csv',raw)}).status_code==201
    assert client.post('/api/providers/7shifts/imports/preview?kind=labor',files={'file':('x.csv',raw)}).status_code==409
    assert client.post('/api/providers/7shifts/imports/preview?kind=sales',files={'file':('x.csv',raw)}).status_code==422
    assert client.get('/api/providers/missing?on=2026-11-09').status_code==404

def test_payroll_snapshot_exports_and_idempotency(client):
    import_labor(client)
    b={'start':'2026-11-08','end':'2026-11-09','idempotency_key':'nov-1','adjustments':[{'employee':'Employee A','tips_cents':1000,'bonus_cents':500,'reimbursement_cents':200}]}
    r=client.post('/api/payroll/runs',json=b)
    assert r.status_code==201,r.text
    run=r.json()
    assert run['total_hours']=='30' and run['totals']['base_wages_cents']==60000
    assert run['totals']['estimated_total_cents']==61700 and run['status']=='draft'
    assert run['employees'][0]['estimated_earnings_cents']==31500
    assert client.post('/api/payroll/runs',json=b).json()['id']==run['id']
    assert len(client.get('/api/payroll/runs').json())==1
    assert client.post('/api/payroll/runs',json=b|{'end':'2026-11-10'}).status_code==409
    rows=list(csv.DictReader(io.StringIO(client.get(f'/api/payroll/runs/{run["id"]}/export').text)))
    assert rows[0]['employee']=='Employee A' and rows[0]['estimated_total_cents']=='31700'
    assert 'payroll preparation draft' in client.get(f'/api/payroll/runs/{run["id"]}/export?format=html').text
    import_labor(client,'external_id,date,employee,hours,hourly_rate\nlate,2026-11-09,Employee A,1,20.00\n')
    assert client.get(f'/api/payroll/runs/{run["id"]}').json()['totals']==run['totals']
    assert client.get('/api/payroll/preview?start=2026-11-08&end=2026-11-09').json()['totals']['base_wages_cents']==62000

def test_payroll_validation_and_empty(client):
    assert client.get('/api/payroll/preview?start=2026-11-10&end=2026-11-09').status_code==422
    b={'start':'2026-11-08','end':'2026-11-09'}
    assert client.post('/api/payroll/runs',json=b).status_code==422
    import_labor(client)
    for adjustments in [[{'employee':'Unknown','tips_cents':1}],[{'employee':'Employee A','tips_cents':-1}],[{'employee':'Employee A'},{'employee':'Employee A'}]]:
        assert client.post('/api/payroll/runs',json=b|{'adjustments':adjustments}).status_code==422

def test_export_formula_injection_and_html_escape(client):
    import_labor(client,'external_id,date,employee,hours,hourly_rate\nx,2026-11-09,=SUM(A1),1,20.00\ny,2026-11-09,<script>alert(1)</script>,1,20.00\n')
    run=client.post('/api/payroll/runs',json={'start':'2026-11-09','end':'2026-11-09'}).json()
    assert "'=SUM(A1)" in client.get(f'/api/payroll/runs/{run["id"]}/export').text
    page=client.get(f'/api/payroll/runs/{run["id"]}/export?format=html').text
    assert '<script>' not in page and '&lt;script&gt;' in page

def test_file_versions_download_deadlines_and_archive(client):
    d=doc(client)
    v1=client.post(f'/api/documents/{d["id"]}/versions',files={'file':('../../permit.pdf',b'%PDF-original','application/pdf')}).json()
    v2=client.post(f'/api/documents/{d["id"]}/versions',files={'file':('permit.pdf',b'%PDF-updated')}).json()
    assert v1['filename']=='permit.pdf' and v2['version']==2
    detail=client.get(f'/api/documents/{d["id"]}').json()
    assert len(detail['versions'])==2 and detail['advice_mode']=='organizational_checklist_only'
    original=client.get(f'/api/documents/{d["id"]}/versions/{v1["id"]}/download')
    assert original.content==b'%PDF-original' and original.headers['x-content-type-options']=='nosniff'
    assert client.get('/api/documents/deadlines?on=2026-11-09&within_days=4').json()[0]['days_remaining']==3
    doc(client,title='Overdue',deadline='2026-11-01')
    assert client.get('/api/documents/deadlines?on=2026-11-09&within_days=0').json()[0]['days_remaining']==-8
    body={k:detail[k] for k in ['title','category','deadline','notes','status']}
    assert client.put(f'/api/documents/{d["id"]}',json=body|{'status':'archived'}).status_code==200
    assert len(client.get('/api/documents?status=archived').json())==1
    assert all(x['id']!=d['id'] for x in client.get('/api/documents/deadlines?on=2026-11-09').json())

def test_file_isolation_empty_and_size_limit(client):
    d=doc(client); other=doc(client,title='Other')
    v=client.post(f'/api/documents/{d["id"]}/versions',files={'file':('x.txt',b'x')}).json()
    assert client.get(f'/api/documents/{other["id"]}/versions/{v["id"]}/download').status_code==404
    assert client.post('/api/documents/missing/versions',files={'file':('x',b'x')}).status_code==404
    assert client.post(f'/api/documents/{d["id"]}/versions',files={'file':('x',b'')}).status_code==422
    assert client.post(f'/api/documents/{d["id"]}/versions',files={'file':('x',b'x'*10_000_001)}).status_code==413

def test_recurring_events_and_combined_calendar(client):
    e=client.post('/api/calendar/events',json={'title':'Meeting','date':'2026-11-09','repeat':'weekly','repeat_until':'2026-11-23'}).json()
    client.post('/api/calendar/events',json={'title':'Holiday service','date':'2026-11-26','kind':'holiday'})
    doc(client)
    items=client.get('/api/calendar?start=2026-11-01&end=2026-11-30').json()['items']
    assert [x['date'] for x in items if x['resource_id']==e['id']]==['2026-11-09','2026-11-16','2026-11-23']
    assert {x['kind'] for x in items}=={'holiday','event','document_deadline'}
    assert client.get('/api/calendar?start=2027-11-01&end=2026-11-30').status_code==422
    assert client.post('/api/calendar/events',json={'title':'x','date':'2026-11-09','repeat_until':'2026-11-01'}).status_code==422

def test_recurrence_skips_impossible_months_and_leap_days(client):
    client.post('/api/calendar/events',json={'title':'Month end','date':'2026-01-31','repeat':'monthly'})
    client.post('/api/calendar/events',json={'title':'Leap','date':'2024-02-29','repeat':'yearly'})
    items=client.get('/api/calendar?start=2026-01-01&end=2026-03-31').json()['items']
    assert [x['date'] for x in items if x['title']=='Month end']==['2026-01-31','2026-03-31']
    assert all(x['title']!='Leap' for x in items)

def test_order_lifecycle_and_calendar(client):
    r=client.post('/api/orders',json=order_body()); assert r.status_code==201
    o=r.json(); assert o['status']=='draft'
    assert client.post(f'/api/orders/{o["id"]}/status',json={'status':'received'}).status_code==409
    for status in ['placed','confirmed','received']:
        assert client.post(f'/api/orders/{o["id"]}/status',json={'status':status}).json()['status']==status
    assert client.post(f'/api/orders/{o["id"]}/status',json={'status':'placed'}).status_code==409
    assert client.post(f'/api/orders/{o["id"]}/status',json={'status':'received'}).status_code==200
    assert client.get('/api/calendar?start=2026-11-01&end=2026-11-30').json()['items'][0]['resource_id']==o['id']

def test_order_schedule_concurrency_and_pause(client):
    s=client.post('/api/order-schedules',json=schedule_body()).json()
    def generate(_): return client.post(f'/api/order-schedules/{s["id"]}/generate',json={'through':'2026-11-30'})
    with ThreadPoolExecutor(2) as pool: results=list(pool.map(generate,range(2)))
    assert all(r.status_code==200 for r in results)
    assert sum(len(r.json()['created_order_ids']) for r in results)==3
    assert len(client.get('/api/orders').json())==3
    assert len(generate(0).json()['existing_order_ids'])==3
    assert client.post(f'/api/order-schedules/{s["id"]}/active',json={'active':False}).status_code==200
    assert generate(0).status_code==409
    assert client.post('/api/order-schedules',json=schedule_body()|{'every_days':0}).status_code==422
    assert client.post('/api/order-schedules',json=schedule_body()|{'until':'2028-12-01'}).status_code==422

def test_persistence_and_auth(client,monkeypatch):
    d=doc(client)
    with TestClient(app) as other: assert other.get(f'/api/documents/{d["id"]}').json()['title']=='Operating permit'
    monkeypatch.setenv('SIDEWORK_API_KEY','workspace-secret')
    for path in ['/api/documents','/api/providers','/api/payroll/runs','/api/orders','/api/calendar?start=2026-11-01&end=2026-11-02']:
        assert client.get(path).status_code==401
        assert client.get(path,headers={'X-API-Key':'workspace-secret'}).status_code==200

def test_calendar_projects_recurring_orders_without_placing_them(client):
    s=client.post('/api/order-schedules',json=schedule_body()).json()
    cal=client.get('/api/calendar?start=2026-11-01&end=2026-11-30').json()['items']
    assert len(cal)==3 and all(i['kind']=='scheduled_order' for i in cal)
    assert client.get('/api/orders').json()==[]
    client.post(f'/api/order-schedules/{s["id"]}/generate',json={'through':'2026-11-17'})
    cal=client.get('/api/calendar?start=2026-11-01&end=2026-11-30').json()['items']
    assert len(cal)==3
    assert [i['kind'] for i in cal]==['order','order','scheduled_order']
    assert all(o['supplier_submission']=='not_sent' for o in client.get('/api/orders').json())

def test_event_update_and_archive(client):
    event={'title':'Meeting','date':'2026-11-09','repeat':'weekly'}
    e=client.post('/api/calendar/events',json=event).json()
    assert len(client.get('/api/calendar/events').json())==1
    assert client.get(f'/api/calendar/events/{e["id"]}').json()['title']=='Meeting'
    assert client.put(f'/api/calendar/events/{e["id"]}',json=event|{'active':False}).status_code==200
    assert client.get('/api/calendar?start=2026-11-01&end=2026-11-30').json()['items']==[]

def test_concurrent_document_versions_and_payroll_creation(client):
    d=doc(client)
    def version(i): return client.post(f'/api/documents/{d["id"]}/versions',files={'file':('version.txt',f'content-{i}'.encode())})
    with ThreadPoolExecutor(2) as pool: results=list(pool.map(version,range(2)))
    assert sorted(r.json()['version'] for r in results)==[1,2]
    import_labor(client)
    body={'start':'2026-11-09','end':'2026-11-09','idempotency_key':'concurrent'}
    with ThreadPoolExecutor(2) as pool: results=list(pool.map(lambda _:client.post('/api/payroll/runs',json=body),range(2)))
    assert len({r.json()['id'] for r in results})==1
    assert len(client.get('/api/payroll/runs').json())==1
