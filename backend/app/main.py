"""Side Work: single-restaurant, source-backed operations API."""
import csv
import hashlib
import hmac
import io
import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
KINDS = {
    'sales': ['external_id', 'date', 'item', 'quantity', 'net_sales'],
    'purchases': ['external_id', 'date', 'supplier', 'ingredient', 'quantity', 'unit', 'total_cost'],
    'labor': ['external_id', 'date', 'employee', 'hours', 'hourly_rate'],
    'inventory': ['external_id', 'date', 'ingredient', 'quantity', 'unit', 'expires_on', 'low_stock_threshold'],
}
Kind = Literal['sales', 'purchases', 'labor', 'inventory']
header = APIKeyHeader(name='X-API-Key', auto_error=False)


def authenticate(key: str | None = Depends(header)):
    expected = os.getenv('SIDEWORK_API_KEY')
    if expected and (not key or not hmac.compare_digest(key, expected)):
        raise HTTPException(401, 'A valid X-API-Key header is required.')


app = FastAPI(title='Side Work', version='0.1.0', description='Single-restaurant demo backend. Import CSV records, review daily operations, and trace every finding to its source. No live vendor connections or generative AI are enabled.', dependencies=[Depends(authenticate)])
app.add_middleware(CORSMiddleware, allow_origins=[s.strip() for s in os.getenv('SIDEWORK_CORS_ORIGINS', 'http://localhost:3000,http://localhost:8080').split(',') if s.strip()], allow_methods=['GET', 'POST'], allow_headers=['Content-Type', 'X-API-Key'])


@contextmanager
def db():
    path = Path(os.getenv('SIDEWORK_DB', str(ROOT / 'data' / 'sidework.db')))
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS imports (
          id TEXT PRIMARY KEY, kind TEXT NOT NULL, filename TEXT NOT NULL,
          digest TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          committed_at TEXT, errors TEXT NOT NULL, UNIQUE(kind, digest)
        );
        CREATE TABLE IF NOT EXISTS records (
          id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES imports(id),
          kind TEXT NOT NULL, external_id TEXT NOT NULL, row_number INTEGER NOT NULL,
          business_date TEXT NOT NULL, payload TEXT NOT NULL,
          UNIQUE(kind, external_id)
        );
        CREATE INDEX IF NOT EXISTS records_date ON records(kind, business_date);
        CREATE TABLE IF NOT EXISTS staged (
          import_id TEXT PRIMARY KEY REFERENCES imports(id), rows TEXT NOT NULL
        );
    ''')
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def fail(status, message):
    raise HTTPException(status, message)


def number(raw, name, positive=False):
    try:
        value = Decimal(raw)
    except (InvalidOperation, ValueError):
        raise ValueError(f'{name} must be a decimal number')
    if not value.is_finite() or value < 0 or value > Decimal('1000000000') or (positive and value == 0):
        raise ValueError(f'{name} must be finite, {"positive" if positive else "nonnegative"}, and at most 1 billion')
    return value


def money(raw, name):
    value = number(raw, name)
    if value != value.quantize(Decimal('.01')):
        raise ValueError(f'{name} supports at most two decimal places')
    return int(value * 100)


def normalize(kind, row):
    p = {k: v.strip() for k, v in row.items()}
    for key in KINDS[kind]:
        if not p[key] and key != 'expires_on':
            raise ValueError(f'{key} is required')
        if len(p[key]) > 250:
            raise ValueError(f'{key} exceeds 250 characters')
    p['date'] = date.fromisoformat(p['date']).isoformat()
    if kind == 'sales':
        p['quantity'] = str(number(p['quantity'], 'quantity', True))
        p['net_sales_cents'] = money(p.pop('net_sales'), 'net_sales')
    elif kind == 'purchases':
        p['quantity'] = str(number(p['quantity'], 'quantity', True))
        p['unit'] = p['unit'].lower()
        p['total_cost_cents'] = money(p.pop('total_cost'), 'total_cost')
    elif kind == 'labor':
        hours = number(p['hours'], 'hours')
        if hours > 24:
            raise ValueError('hours cannot exceed 24 per record')
        p['hours'] = str(hours)
        p['hourly_rate_cents'] = money(p.pop('hourly_rate'), 'hourly_rate')
        p['wage_cost_cents'] = int((hours * p['hourly_rate_cents']).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    else:
        p['quantity'] = str(number(p['quantity'], 'quantity'))
        p['low_stock_threshold'] = str(number(p['low_stock_threshold'], 'low_stock_threshold'))
        p['unit'] = p['unit'].lower()
        if p['expires_on']:
            p['expires_on'] = date.fromisoformat(p['expires_on']).isoformat()
    return p


def source(row):
    return {'record_id': row['id'], 'import_id': row['import_id'], 'filename': row['filename'], 'row_number': row['row_number'], 'external_id': row['external_id'], 'url': f'/api/records/{row["id"]}'}


def records(conn, kind=None, through=None):
    sql = 'SELECT r.*, i.filename FROM records r JOIN imports i ON i.id=r.import_id WHERE 1=1'
    args = []
    if kind:
        sql += ' AND r.kind=?'
        args.append(kind)
    if through:
        sql += ' AND r.business_date<=?'
        args.append(str(through))
    return [dict(r) | {'data': json.loads(r['payload'])} for r in conn.execute(sql + ' ORDER BY r.business_date, r.row_number, r.id', args)]


def import_detail(conn, import_id):
    row = conn.execute('SELECT * FROM imports WHERE id=?', (import_id,)).fetchone()
    if not row:
        fail(404, 'Import not found')
    stage = conn.execute('SELECT rows FROM staged WHERE import_id=?', (import_id,)).fetchone()
    rows = json.loads(stage['rows']) if stage else []
    return dict(row) | {'errors': json.loads(row['errors']), 'row_count': len(rows), 'preview': rows[:10]}


@app.get('/health', tags=['Setup'])
def health():
    with db() as conn:
        conn.execute('SELECT 1')
    return {'status': 'ok', 'product': 'Side Work', 'mode': 'single-restaurant', 'currency': 'USD', 'live_integrations': False}


@app.get('/api/imports/templates', tags=['Imports'])
def templates():
    return {'formats': KINDS, 'rules': ['UTF-8 CSV, header row required; maximum 2 MB and 10,000 records.', 'Use stable external_id values unique within each data kind.', 'Dates use YYYY-MM-DD; amounts are USD with up to two decimal places; no currency symbols.', 'Sales are net of discounts and refunds, excluding tax and tips. Negative rows are unsupported in this MVP.', 'Inventory rows are absolute snapshots per ingredient/unit/batch (external_id), not stock movements.', 'Purchases do not automatically change inventory; employee hours are wage estimates, not payroll.']}


@app.post('/api/imports/preview', tags=['Imports'], status_code=201)
async def preview(kind: Kind, file: UploadFile = File(...)):
    raw = await file.read(2_000_001)
    if len(raw) > 2_000_000:
        fail(413, 'CSV exceeds 2 MB')
    digest = hashlib.sha256(raw).hexdigest()
    with db() as conn:
        existing = conn.execute('SELECT id FROM imports WHERE kind=? AND digest=?', (kind, digest)).fetchone()
        if existing:
            return import_detail(conn, existing['id']) | {'duplicate_file': True}
    try:
        text = raw.decode('utf-8-sig')
        reader = csv.DictReader(io.StringIO(text), strict=True)
        fields = reader.fieldnames or []
        if len(fields) != len(set(fields)) or set(fields) != set(KINDS[kind]):
            fail(422, {'message': 'CSV headers must exactly match the template (order may differ).', 'expected': KINDS[kind]})
        clean, errors, seen = [], [], set()
        for line, row in enumerate(reader, 2):
            if line > 10001:
                fail(413, 'CSV exceeds 10,000 records')
            try:
                if None in row or any(v is None for v in row.values()):
                    raise ValueError('row has an incorrect number of columns')
                p = normalize(kind, row)
                if p['external_id'] in seen:
                    raise ValueError('duplicate external_id within file')
                seen.add(p['external_id'])
                clean.append({'row_number': line, 'data': p})
            except (ValueError, InvalidOperation) as exc:
                errors.append({'row_number': line, 'message': str(exc)})
    except (UnicodeDecodeError, csv.Error) as exc:
        fail(422, f'Invalid UTF-8 CSV: {exc}')
    if not clean and not errors:
        errors.append({'row_number': 1, 'message': 'File has no data rows'})
    import_id = str(uuid.uuid4())
    with db() as conn:
        try:
            conn.execute('INSERT INTO imports(id,kind,filename,digest,status,errors) VALUES(?,?,?,?,?,?)', (import_id, kind, Path(file.filename or 'upload.csv').name, digest, 'invalid' if errors else 'preview', json.dumps(errors)))
            conn.execute('INSERT INTO staged VALUES(?,?)', (import_id, json.dumps(clean)))
        except sqlite3.IntegrityError:
            return import_detail(conn, conn.execute('SELECT id FROM imports WHERE kind=? AND digest=?', (kind, digest)).fetchone()['id']) | {'duplicate_file': True}
        return import_detail(conn, import_id)


@app.get('/api/imports', tags=['Imports'])
def list_imports():
    with db() as conn:
        return [import_detail(conn, r['id']) for r in conn.execute('SELECT id FROM imports ORDER BY created_at DESC, id')]


@app.get('/api/imports/{import_id}', tags=['Imports'])
def get_import(import_id: str):
    with db() as conn:
        return import_detail(conn, import_id)


@app.post('/api/imports/{import_id}/commit', tags=['Imports'])
def commit_import(import_id: str):
    with db() as conn:
        conn.execute('BEGIN IMMEDIATE')
        detail = import_detail(conn, import_id)
        if detail['status'] == 'committed':
            return detail | {'already_committed': True}
        if detail['errors']:
            fail(422, 'Fix validation errors and upload the corrected file; nothing was imported.')
        rows = json.loads(conn.execute('SELECT rows FROM staged WHERE import_id=?', (import_id,)).fetchone()['rows'])
        conflicts = [r['data']['external_id'] for r in rows if conn.execute('SELECT 1 FROM records WHERE kind=? AND external_id=?', (detail['kind'], r['data']['external_id'])).fetchone()]
        if conflicts:
            fail(409, {'message': 'Existing external IDs; entire import rejected.', 'external_ids': conflicts})
        for r in rows:
            p = r['data']
            conn.execute('INSERT INTO records VALUES(?,?,?,?,?,?,?)', (str(uuid.uuid4()), import_id, detail['kind'], p['external_id'], r['row_number'], p['date'], json.dumps(p)))
        conn.execute("UPDATE imports SET status='committed', committed_at=CURRENT_TIMESTAMP WHERE id=?", (import_id,))
        return import_detail(conn, import_id)


@app.get('/api/records', tags=['Records'])
def list_records(kind: Kind | None = None, on: date | None = None, limit: int = Query(100, ge=1, le=1000), offset: int = Query(0, ge=0)):
    with db() as conn:
        rows = records(conn, kind)
        if on:
            rows = [r for r in rows if r['business_date'] == str(on)]
        return {'total': len(rows), 'records': [{'kind': r['kind'], 'data': r['data'], 'source': source(r)} for r in rows[offset:offset+limit]]}


@app.get('/api/records/{record_id}', tags=['Records'])
def get_record(record_id: str):
    with db() as conn:
        row = conn.execute('SELECT r.*, i.filename FROM records r JOIN imports i ON i.id=r.import_id WHERE r.id=?', (record_id,)).fetchone()
        if not row:
            fail(404, 'Record not found')
        return {'kind': row['kind'], 'data': json.loads(row['payload']), 'source': source(row)}


def inventory_state(rows):
    # Each row has a unique snapshot-record ID. A newer date replaces all
    # older batches for an ingredient/unit; latest-date batches sum together.
    latest = {}
    for r in rows:
        p = r['data']
        key = (p['ingredient'].casefold(), p['unit'])
        if key not in latest or r['business_date'] > latest[key][0]['business_date']:
            latest[key] = [r]
        elif r['business_date'] == latest[key][0]['business_date']:
            latest[key].append(r)
    return latest


def alert_list(conn, on):
    result = []
    stock = inventory_state(records(conn, 'inventory', on))
    for (_, unit), batches in stock.items():
        qty = sum(Decimal(r['data']['quantity']) for r in batches)
        threshold = max(Decimal(r['data']['low_stock_threshold']) for r in batches)
        name = batches[0]['data']['ingredient']
        if qty <= threshold:
            result.append({'type': 'low_stock', 'severity': 'warning', 'message': f'{name}: {qty} {unit} recorded, at or below threshold {threshold}. Check stock before ordering.', 'sources': [source(r) for r in batches]})
        for r in batches:
            p = r['data']
            if p['expires_on'] and Decimal(p['quantity']) > 0:
                days = (date.fromisoformat(p['expires_on']) - on).days
                if days <= 3:
                    result.append({'type': 'past_recorded_expiration' if days < 0 else 'expiring_soon', 'severity': 'warning', 'message': f'{name}: {p["quantity"]} {unit}, recorded expiration {p["expires_on"]}. Check the batch and handling policy; this date is not a food-safety assessment.', 'sources': [source(r)]})
    groups = {}
    for r in records(conn, 'purchases', on):
        p = r['data']
        groups.setdefault((p['supplier'].casefold(), p['ingredient'].casefold(), p['unit']), {}).setdefault(p['date'], []).append(r)
    for (_, _, unit), daily in groups.items():
        dates = sorted(daily)
        if len(dates) < 2 or dates[-1] != str(on):
            continue
        old, new = daily[dates[-2]], daily[dates[-1]]
        def unit_cost(items):
            return Decimal(sum(r['data']['total_cost_cents'] for r in items)) / sum(Decimal(r['data']['quantity']) for r in items)
        before, after = unit_cost(old), unit_cost(new)
        if before > 0 and after > before:
            pct = float(((after / before - 1) * 100).quantize(Decimal('.1')))
            p = new[0]['data']
            result.append({'type': 'supplier_price_increase', 'severity': 'info', 'message': f'{p["ingredient"]} from {p["supplier"]}: weighted purchase price per {unit} increased {pct}% versus {dates[-2]}. Check invoice details and pack sizes.', 'change_percent': pct, 'sources': [source(r) for r in old + new]})
    return result


def briefing_data(conn, on):
    all_rows = records(conn, through=on)
    def metrics(day):
        day_rows = [r for r in all_rows if r['business_date'] == str(day)]
        out = {}
        for kind, field, label in [('sales', 'net_sales_cents', 'net_sales'), ('purchases', 'total_cost_cents', 'recorded_purchases'), ('labor', 'wage_cost_cents', 'estimated_wages')]:
            subset = [r for r in day_rows if r['kind'] == kind]
            out[label] = {'amount_cents': sum(r['data'][field] for r in subset) if subset else None, 'record_count': len(subset), 'sources': [source(r) for r in subset]}
        sales, wages = out['net_sales']['amount_cents'], out['estimated_wages']['amount_cents']
        out['estimated_wage_to_sales_percent'] = round(wages / sales * 100, 2) if sales and wages is not None else None
        return out
    current, previous = metrics(on), metrics(on - timedelta(days=1))
    changes = {}
    for key in ['net_sales', 'recorded_purchases', 'estimated_wages']:
        now, before = current[key]['amount_cents'], previous[key]['amount_cents']
        changes[key] = {'amount_cents': now - before if now is not None and before is not None else None, 'percent': round((now-before)/before*100, 2) if now is not None and before else None}
    return {'date': str(on), 'currency': 'USD', 'metrics': current, 'previous_day': {'date': str(on-timedelta(days=1)), 'metrics': previous}, 'changes_vs_previous_day': changes, 'alerts': alert_list(conn, on), 'missing_data': [kind for kind, key in [('sales', 'net_sales'), ('purchases', 'recorded_purchases'), ('labor', 'estimated_wages')] if current[key]['amount_cents'] is None], 'inventory_as_of': [{'ingredient': group[0]['data']['ingredient'], 'unit': group[0]['data']['unit'], 'snapshot_date': group[0]['business_date'], 'sources': [source(r) for r in group]} for group in inventory_state([r for r in all_rows if r['kind']=='inventory']).values()], 'limitations': ['Only imported records are included; an import does not establish completeness.', 'Purchases are cash purchase records, not cost of goods sold. Profit is not calculated.', 'Wages are hours × base rate, rounded per row; exclude overtime premiums, taxes, benefits, and tips.', 'Inventory is the latest recorded snapshot per ingredient/unit on or before this date; sales and purchases do not automatically deplete or replenish it.', 'No live Toast, Resy, payroll, or supplier connection is active.']}


@app.get('/api/briefing', tags=['Operations'])
def briefing(on: date):
    with db() as conn:
        return briefing_data(conn, on)


@app.get('/api/alerts', tags=['Operations'])
def alerts(on: date):
    with db() as conn:
        return {'date': str(on), 'alerts': alert_list(conn, on)}


@app.get('/api/inventory', tags=['Operations'])
def inventory(on: date):
    with db() as conn:
        return {'as_of': str(on), 'items': [{'ingredient': group[0]['data']['ingredient'], 'unit': group[0]['data']['unit'], 'quantity': str(sum(Decimal(r['data']['quantity']) for r in group)), 'snapshot_date': group[0]['business_date'], 'batches': [{'data': r['data'], 'source': source(r)} for r in group]} for group in inventory_state(records(conn, 'inventory', on)).values()]}


class Question(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    on: date


@app.post('/api/ask', tags=['Operations'])
def ask(body: Question):
    q = body.question.lower().strip()
    with db() as conn:
        report = briefing_data(conn, body.on)
    def dollars(n):
        return f'${Decimal(n)/100:,.2f}'
    q = q.rstrip('?.!')
    if q in {'what needs attention today', 'what needs attention', 'show alerts', 'what should i investigate', 'show inventory alerts', 'show price increases'}:
        found = report['alerts']
        return {'supported': True, 'mode': 'rule-based', 'answer': '\n'.join(a['message'] for a in found) or 'No configured alerts were triggered by the available records. Check missing data and snapshot dates before relying on this.', 'sources': [s for a in found for s in a['sources']], 'missing_data': report['missing_data'], 'limitations': report['limitations']}
    for terms, key, label in [({'what were sales', 'what were sales today', 'show sales', 'sales', 'what was revenue'}, 'net_sales', 'Recorded net sales'), ({'what were labor costs', 'what were labour costs', 'show wages', 'labor costs', 'what were wages'}, 'estimated_wages', 'Estimated base wages'), ({'what were purchases', 'show purchases', 'purchases', 'what was supplier spend'}, 'recorded_purchases', 'Recorded purchases')]:
        if q in terms:
            metric = report['metrics'][key]
            amount = metric['amount_cents']
            return {'supported': True, 'mode': 'rule-based', 'answer': f'{label} for {body.on}: {dollars(amount)}.' if amount is not None else f'No {key} records imported for {body.on}.', 'sources': metric['sources'], 'limitations': report['limitations']}
    return {'supported': False, 'mode': 'rule-based', 'answer': 'This MVP supports daily totals and configured alerts, not arbitrary analysis. Try one of the example questions.', 'examples': ['What were sales?', 'What were labor costs?', 'What were purchases?', 'What needs attention today?'], 'sources': []}


@app.get('/api/integrations', tags=['Setup'])
def integrations():
    return {'connections': [{'provider': name, 'status': 'not_connected', 'live_sync': False} for name in ['Toast', 'Resy']], 'available_now': 'Validated CSV imports', 'note': 'Provider-authorized API access is required before live connectors can be enabled. No provider credentials are collected by this demo.'}
