"""Load synthetic fixtures through real HTTP endpoints. Safe to run repeatedly."""
import argparse
import os
from pathlib import Path
import httpx

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:8000')
args = parser.parse_args()
headers = {'X-API-Key': os.environ['SIDEWORK_API_KEY']} if os.getenv('SIDEWORK_API_KEY') else {}
with httpx.Client(base_url=args.url, headers=headers, timeout=20) as client:
    for kind in ['sales', 'purchases', 'labor', 'inventory']:
        path = Path(__file__).parent / 'sample_data' / f'{kind}.csv'
        with path.open('rb') as f:
            response = client.post('/api/imports/preview', params={'kind': kind}, files={'file': (path.name, f, 'text/csv')})
        response.raise_for_status()
        preview = response.json()
        if preview['errors']:
            raise RuntimeError(preview['errors'])
        response = client.post(f'/api/imports/{preview["id"]}/commit')
        response.raise_for_status()
        print(f'{kind}: {response.json()["row_count"]} records ready')
    response = client.get('/api/briefing', params={'on': '2026-11-09'})
    response.raise_for_status()
    report = response.json()
    assert report['metrics']['net_sales']['amount_cents'] == 102000
    assert report['metrics']['estimated_wages']['amount_cents'] == 32000
    assert report['metrics']['recorded_purchases']['amount_cents'] == 9600
    print('\nSide Work demo: synthetic restaurant, November 9, 2026')
    print('Net sales: $1,020.00 | Estimated base wages: $320.00 | Purchases: $96.00')
    print(f'Estimated wage-to-sales ratio: {report["metrics"]["estimated_wage_to_sales_percent"]}%')
    for alert in report['alerts']:
        print(f'- {alert["message"]}')
    print(f'\nInteractive API demo: {args.url}/docs')
