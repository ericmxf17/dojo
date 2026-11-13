"""Backend-only service summaries, payroll drafts, documents, calendar and orders."""
import csv
import hashlib
import html
import io
import json
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal
from urllib.parse import quote
from zoneinfo import ZoneInfo
import os

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, model_validator
from .integrations import normalize_7shifts_punch, seven_shifts_time_punches

SCHEMA = '''
CREATE TABLE IF NOT EXISTS workspace_resources (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS workspace_kind ON workspace_resources(kind);
CREATE TABLE IF NOT EXISTS document_versions (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES workspace_resources(id),
 version INTEGER NOT NULL, filename TEXT NOT NULL, content_type TEXT NOT NULL,
 digest TEXT NOT NULL, content BLOB NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(document_id, version)
);
CREATE TABLE IF NOT EXISTS workspace_keys (
 key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, resource_id TEXT NOT NULL REFERENCES workspace_resources(id)
);
CREATE TABLE IF NOT EXISTS order_occurrences (
 schedule_id TEXT NOT NULL REFERENCES workspace_resources(id), due_on TEXT NOT NULL,
 order_id TEXT NOT NULL REFERENCES workspace_resources(id), PRIMARY KEY(schedule_id,due_on)
);
CREATE TABLE IF NOT EXISTS provider_imports (
 import_id TEXT PRIMARY KEY REFERENCES imports(id), provider TEXT NOT NULL
);
'''

PROVIDERS = {
 'toast': {'name': 'Toast', 'description': 'Restaurant POS & operations', 'kinds': ['sales', 'labor']},
 '7shifts': {'name': '7shifts', 'description': 'Scheduling & labor management', 'kinds': ['labor']},
 'marketman': {'name': 'MarketMan', 'description': 'Inventory & purchasing', 'kinds': ['inventory', 'purchases']},
 'restaurant365': {'name': 'Restaurant365', 'description': 'Accounting & operational data', 'kinds': ['sales', 'labor', 'purchases', 'inventory']},
}

PROVIDER_ENV = {
 'toast': ('TOAST_CLIENT_ID', 'TOAST_CLIENT_SECRET', 'TOAST_RESTAURANT_GUID'),
 '7shifts': ('SEVENSHIFTS_ACCESS_TOKEN', 'SEVENSHIFTS_COMPANY_ID'),
 'marketman': ('MARKETMAN_API_KEY', 'MARKETMAN_API_PASSWORD'),
 'restaurant365': ('RESTAURANT365_API_TOKEN',),
}

def provider_connection(provider: str):
    required = PROVIDER_ENV.get(provider, ())
    configured = bool(required) and all(os.getenv(key) for key in required)
    return {
        'status': 'connected' if configured else 'not_connected',
        'connection_status': 'configured' if configured else 'not_configured',
        'live_sync': False,
        'missing_environment': [] if configured else [key for key in required if not os.getenv(key)],
        'credential_storage': 'server_environment_only',
    }

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

class Adjustment(StrictModel):
    employee: str = Field(min_length=1, max_length=250)
    tips_cents: int = Field(default=0, ge=0, le=100_000_000, strict=True)
    bonus_cents: int = Field(default=0, ge=0, le=100_000_000, strict=True)
    reimbursement_cents: int = Field(default=0, ge=0, le=100_000_000, strict=True)

class PayrollRequest(StrictModel):
    start: date
    end: date
    adjustments: list[Adjustment] = Field(default_factory=list, max_length=1000)
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode='after')
    def validate_period(self):
        check_period(self.start, self.end)
        names = [a.employee for a in self.adjustments]
        if len(names) != len(set(names)):
            raise ValueError('Only one adjustment per exact employee identifier is allowed')
        return self

class DocumentMetadata(StrictModel):
    title: str = Field(min_length=1, max_length=250)
    category: Literal['license', 'permit', 'insurance', 'lease', 'employment', 'contract', 'other'] = 'other'
    deadline: date | None = None
    notes: str = Field(default='', max_length=5000)
    status: Literal['active', 'archived'] = 'active'

class EventInput(StrictModel):
    title: str = Field(min_length=1, max_length=250)
    date: date
    kind: Literal['holiday', 'event', 'deadline'] = 'event'
    notes: str = Field(default='', max_length=5000)
    repeat: Literal['none', 'weekly', 'monthly', 'yearly'] = 'none'
    repeat_until: date | None = None
    active: bool = True

    @model_validator(mode='after')
    def validate_repeat(self):
        if self.repeat_until and self.repeat_until < self.date:
            raise ValueError('repeat_until must be on or after the first event')
        return self

class OrderLine(StrictModel):
    ingredient: str = Field(min_length=1, max_length=250)
    quantity: Decimal = Field(gt=0, le=1_000_000)
    unit: str = Field(min_length=1, max_length=40)
    unit_cost_cents: int | None = Field(default=None, ge=0, le=100_000_000, strict=True)

class OrderInput(StrictModel):
    supplier: str = Field(min_length=1, max_length=250)
    due_on: date
    lines: list[OrderLine] = Field(min_length=1, max_length=200)
    notes: str = Field(default='', max_length=5000)

class OrderStatus(StrictModel):
    status: Literal['placed', 'confirmed', 'received', 'cancelled']

class OrderSchedule(StrictModel):
    supplier: str = Field(min_length=1, max_length=250)
    first_due_on: date
    every_days: int = Field(ge=1, le=366, strict=True)
    until: date
    lines: list[OrderLine] = Field(min_length=1, max_length=200)
    notes: str = Field(default='', max_length=5000)
    active: bool = True

    @model_validator(mode='after')
    def validate_schedule(self):
        if self.until < self.first_due_on or (self.until - self.first_due_on).days > 366:
            raise ValueError('Schedule must end within one year after its first due date')
        return self

class Materialize(StrictModel):
    through: date

class ScheduleActive(StrictModel):
    active: bool


def check_period(start, end):
    if end < start or (end - start).days > 366:
        raise ValueError('Date range must be ordered and no longer than 367 inclusive days')


def period(start, end):
    try:
        check_period(start, end)
    except ValueError as exc:
        raise HTTPException(422, str(exc))


def resource(conn, resource_id, kind):
    r = conn.execute('SELECT * FROM workspace_resources WHERE id=? AND kind=?', (resource_id, kind)).fetchone()
    if not r:
        raise HTTPException(404, f'{kind} not found')
    return json.loads(r['payload']) | {'id': r['id'], 'created_at': r['created_at'], 'updated_at': r['updated_at']}


def resources(conn, kind):
    return [json.loads(r['payload']) | {'id': r['id'], 'created_at': r['created_at'], 'updated_at': r['updated_at']} for r in conn.execute('SELECT * FROM workspace_resources WHERE kind=? ORDER BY created_at,id', (kind,))]


def save(conn, kind, payload, resource_id=None):
    if resource_id:
        resource(conn, resource_id, kind)
        conn.execute('UPDATE workspace_resources SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', (json.dumps(payload), resource_id))
    else:
        resource_id = str(uuid.uuid4())
        conn.execute('INSERT INTO workspace_resources(id,kind,payload) VALUES(?,?,?)', (resource_id, kind, json.dumps(payload)))
    return resource(conn, resource_id, kind)


def safe_cell(value):
    text = str(value)
    return "'" + text if text.lstrip().startswith(('=', '+', '-', '@')) else text


def occurrences(event, start, end):
    first = date.fromisoformat(event['date'])
    finish = min(end, date.fromisoformat(event['repeat_until'])) if event['repeat_until'] else end
    current = max(first, start)
    while current <= finish:
        frequency = event['repeat']
        match = (current == first if frequency == 'none' else
                 (current - first).days % 7 == 0 if frequency == 'weekly' else
                 current.day == first.day if frequency == 'monthly' else
                 (current.month, current.day) == (first.month, first.day))
        if match:
            yield current
        if current == date.max:
            break
        current += timedelta(days=1)


def register_workspace(app, db, records, source, preview):
    router = APIRouter(prefix='/api')

    def payroll_report(conn, body):
        rows = [r for r in records(conn, 'labor', body.end) if r['business_date'] >= str(body.start)]
        staff = {}
        for r in rows:
            p = r['data']
            entry = staff.setdefault(p['employee'], {'employee': p['employee'], 'hours': Decimal(0), 'base_wages_cents': 0, 'hourly_rates_cents': set(), 'sources': []})
            entry['hours'] += Decimal(p['hours'])
            entry['base_wages_cents'] += p['wage_cost_cents']
            entry['hourly_rates_cents'].add(p['hourly_rate_cents'])
            entry['sources'].append(source(r))
        adjustment_map = {a.employee: a for a in body.adjustments}
        unknown = set(adjustment_map) - set(staff)
        if unknown:
            raise HTTPException(422, {'message': 'Adjustment employee has no labor records in this period', 'employees': sorted(unknown)})
        entries = []
        for name in sorted(staff):
            entry = staff[name]
            adjustment = adjustment_map.get(name, Adjustment(employee=name))
            entry |= adjustment.model_dump(exclude={'employee'})
            entry['hours'] = str(entry['hours'])
            entry['hourly_rates_cents'] = sorted(entry['hourly_rates_cents'])
            entry['estimated_earnings_cents'] = entry['base_wages_cents'] + entry['tips_cents'] + entry['bonus_cents']
            entry['estimated_total_cents'] = entry['estimated_earnings_cents'] + entry['reimbursement_cents']
            entries.append(entry)
        return {'start': str(body.start), 'end': str(body.end), 'currency': 'USD', 'status': 'draft', 'employees': entries,
                'total_hours': str(sum((Decimal(e['hours']) for e in entries), Decimal(0))),
                'totals': {key: sum(e[key] for e in entries) for key in ['base_wages_cents', 'tips_cents', 'bonus_cents', 'reimbursement_cents', 'estimated_earnings_cents', 'estimated_total_cents']},
                'missing_data': not bool(entries),
                'limitations': ['Payroll preparation draft only; no payroll is submitted and no money is moved.', 'Base wages use imported per-row hours and rates. Overtime premiums, taxes, deductions, benefits and net pay are not calculated.', 'Tips, bonuses and reimbursements are supplied explicitly by the reviewer, not inferred from sales.', 'Employee names are exact identifiers in this MVP. Resolve duplicate people or aliases before using the report.', 'Do not import the same shift from multiple vendors under different external IDs; cross-vendor duplicates are not automatically reconciled.', 'A date range with records is not proof that every shift has been imported.']}

    @router.get('/service-summary', tags=['Service summary'])
    def service_summary(on: date | None = None):
        timezone = os.getenv('SIDEWORK_TIMEZONE', 'America/New_York')
        if on is None:
            on = datetime.now(ZoneInfo(timezone)).date() - timedelta(days=1)
        with db() as conn:
            sales = [r for r in records(conn, 'sales', on) if r['business_date'] == str(on)]
            labor = [r for r in records(conn, 'labor', on) if r['business_date'] == str(on)]
            return {'date': str(on), 'timezone': timezone, 'currency': 'USD', 'net_sales_cents': sum(r['data']['net_sales_cents'] for r in sales) if sales else None,
                    'total_hours': str(sum((Decimal(r['data']['hours']) for r in labor), Decimal(0))) if labor else None,
                    'estimated_base_wages_cents': sum(r['data']['wage_cost_cents'] for r in labor) if labor else None,
                    'employee_count': len({r['data']['employee'] for r in labor}) if labor else None,
                    'labor_record_count': len(labor), 'sales_record_count': len(sales),
                    'sales_sources': [source(r) for r in sales], 'labor_sources': [source(r) for r in labor],
                    'missing_data': [kind for kind, rows in [('sales', sales), ('labor', labor)] if not rows],
                    'coverage_note': 'Imported business-date records only; this does not establish complete service coverage.'}

    @router.get('/providers', tags=['Provider workspaces'])
    def providers():
        return {'providers': [dict(id=key, **v, **provider_connection(key), ingestion='mapped_csv') for key, v in PROVIDERS.items()]}

    @router.get('/integrations/onboarding', tags=['Provider workspaces'])
    def integrations_onboarding():
        steps = {
            'toast': ['Restaurant admin enables Standard API access in Toast Web', 'Grant read scopes for orders, labor, employees, and stock', 'Store client ID, client secret, and restaurant GUID on the Sidework backend'],
            '7shifts': ['Company admin opens Settings > Developer Tools', 'Create a company access token and copy the company ID', 'Store both values on the Sidework backend'],
            'marketman': ['Ask the MarketMan account manager for API Partner credentials', 'Confirm buyer/vendor GUIDs and permitted scopes', 'Store the partner key and password on the Sidework backend'],
            'restaurant365': ['Request approved API or Secure Data Share access from Restaurant365', 'Receive the tenant credential through the vendor’s secure process', 'Store the token or warehouse credentials on the Sidework backend'],
            'resy': ['Contact Resy/Amex for an approved commercial integration path', 'Do not automate against private booking endpoints', 'Use manual exports until approved access exists'],
        }
        return {'providers': [dict(id=key, name=(PROVIDERS[key]['name'] if key in PROVIDERS else 'Resy'), **provider_connection(key) if key in PROVIDERS else {'status': 'not_connected', 'connection_status': 'approval_required', 'live_sync': False, 'missing_environment': []}, steps=steps[key]) for key in steps]}

    @router.get('/providers/{provider}', tags=['Provider workspaces'])
    def provider_workspace(provider: str, on: date):
        if provider not in PROVIDERS:
            raise HTTPException(404, 'Unknown provider')
        with db() as conn:
            ids = {r['import_id'] for r in conn.execute('SELECT import_id FROM provider_imports WHERE provider=?', (provider,))}
            rows = [r for r in records(conn, through=on) if r['import_id'] in ids and r['business_date'] == str(on)]
            return {'provider': provider, **PROVIDERS[provider], **provider_connection(provider), 'date': str(on),
                    'import_count': len(ids), 'records': [{'kind': r['kind'], 'data': r['data'], 'source': source(r)} for r in rows],
                    'note': 'These are explicitly uploaded, mapped CSV records, not data fetched from the vendor API.'}

    @router.post('/providers/{provider}/imports/preview', tags=['Provider workspaces'], status_code=201)
    async def provider_preview(provider: str, kind: Literal['sales', 'purchases', 'labor', 'inventory'], file: UploadFile = File(...)):
        if provider not in PROVIDERS:
            raise HTTPException(404, 'Unknown provider')
        if kind not in PROVIDERS[provider]['kinds']:
            raise HTTPException(422, 'Record kind is not supported for this provider workspace')
        result = await preview(kind, file)
        with db() as conn:
            existing = conn.execute('SELECT provider FROM provider_imports WHERE import_id=?', (result['id'],)).fetchone()
            if existing and existing['provider'] != provider:
                raise HTTPException(409, 'This exact file is already attributed to a different provider')
            conn.execute('INSERT OR IGNORE INTO provider_imports VALUES(?,?)', (result['id'], provider))
        return result | {'provider': provider, 'next': f'/api/imports/{result["id"]}/commit'}

    @router.post('/providers/{provider}/sync', tags=['Provider workspaces'])
    def sync(provider: str):
        if provider not in PROVIDERS:
            raise HTTPException(404, 'Unknown provider')
        raise HTTPException(409, 'Live connector is not configured. Authorized vendor API access and an implemented adapter are required; use mapped CSV imports for now.')

    @router.get('/providers/7shifts/live', tags=['Provider workspaces'])
    def seven_shifts_live(start: date, end: date):
        if end < start or (end - start).days > 31:
            raise HTTPException(422, 'Date range must be 0-31 days and end must be on or after start')
        rows = seven_shifts_time_punches(start, end)
        return {'provider': '7shifts', 'start': str(start), 'end': str(end), 'count': len(rows),
                'records': rows, 'normalized_preview': [normalize_7shifts_punch(row) for row in rows],
                'note': 'Read-only records with a review mapping. They are not committed to Sidework until rate and identity mapping is reviewed.'}

    @router.get('/payroll/preview', tags=['Payroll preparation'])
    def payroll_preview(start: date, end: date):
        period(start, end)
        with db() as conn:
            return payroll_report(conn, PayrollRequest(start=start, end=end))

    @router.post('/payroll/runs', tags=['Payroll preparation'], status_code=201)
    def create_run(body: PayrollRequest):
        fingerprint = hashlib.sha256(body.model_dump_json(exclude={'idempotency_key'}).encode()).hexdigest()
        with db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            if body.idempotency_key:
                previous = conn.execute('SELECT * FROM workspace_keys WHERE key=?', ('payroll:' + body.idempotency_key,)).fetchone()
                if previous:
                    if previous['fingerprint'] != fingerprint:
                        raise HTTPException(409, 'Idempotency key already used for different input')
                    return resource(conn, previous['resource_id'], 'payroll')
            report = payroll_report(conn, body)
            if report['missing_data']:
                raise HTTPException(422, 'No labor records in this period; a payroll draft cannot be created')
            result = save(conn, 'payroll', report)
            if body.idempotency_key:
                conn.execute('INSERT INTO workspace_keys VALUES(?,?,?)', ('payroll:' + body.idempotency_key, fingerprint, result['id']))
            return result

    @router.get('/payroll/runs', tags=['Payroll preparation'])
    def runs():
        with db() as conn:
            return resources(conn, 'payroll')

    @router.get('/payroll/runs/{run_id}', tags=['Payroll preparation'])
    def run(run_id: str):
        with db() as conn:
            return resource(conn, run_id, 'payroll')

    @router.get('/payroll/runs/{run_id}/export', tags=['Payroll preparation'])
    def export_payroll(run_id: str, format: Literal['csv', 'html'] = 'csv'):
        with db() as conn:
            report = resource(conn, run_id, 'payroll')
        columns = ['employee', 'hours', 'base_wages_cents', 'tips_cents', 'bonus_cents', 'reimbursement_cents', 'estimated_earnings_cents', 'estimated_total_cents']
        if format == 'csv':
            out = io.StringIO()
            writer = csv.writer(out)
            writer.writerow(columns)
            writer.writerows([[safe_cell(e[k]) for k in columns] for e in report['employees']])
            content, media = out.getvalue(), 'text/csv'
        else:
            headings = ''.join(f'<th>{html.escape(k.replace("_", " "))}</th>' for k in columns)
            rows = ''.join('<tr>' + ''.join(f'<td>{html.escape(str(e[k]))}</td>' for k in columns) + '</tr>' for e in report['employees'])
            notes = ''.join(f'<li>{html.escape(n)}</li>' for n in report['limitations'])
            content = f'<!doctype html><html lang="en"><meta charset="utf-8"><title>Side Work payroll draft</title><style>body{{font:16px system-ui;margin:40px}}table{{border-collapse:collapse}}th,td{{border:1px solid #ccc;padding:8px}}@media print{{body{{margin:0}}}}</style><h1>Side Work payroll preparation draft</h1><p>{report["start"]} to {report["end"]} | USD | Money columns are integer cents</p><table><tr>{headings}</tr>{rows}</table><p>Total hours: {report["total_hours"]}. Estimated total: {report["totals"]["estimated_total_cents"]} cents.</p><ul>{notes}</ul></html>'
            media = 'text/html'
        return Response(content, media_type=media, headers={'Content-Disposition': f'attachment; filename="sidework-payroll-{run_id}.{format}"', 'Cache-Control': 'no-store'})

    @router.post('/documents', tags=['Legal file cabinet'], status_code=201)
    def create_document(body: DocumentMetadata):
        with db() as conn:
            return save(conn, 'document', body.model_dump(mode='json'))

    @router.get('/documents', tags=['Legal file cabinet'])
    def documents(status: Literal['active', 'archived', 'all'] = 'active'):
        with db() as conn:
            return [d for d in resources(conn, 'document') if status == 'all' or d['status'] == status]

    @router.get('/documents/deadlines', tags=['Legal file cabinet'])
    def deadlines(on: date, within_days: int = Query(30, ge=0, le=366)):
        limit = min(date.max, on + timedelta(days=min(within_days, (date.max - on).days)))
        with db() as conn:
            return sorted([d | {'days_remaining': (date.fromisoformat(d['deadline']) - on).days} for d in resources(conn, 'document') if d['status'] == 'active' and d['deadline'] and date.fromisoformat(d['deadline']) <= limit], key=lambda d: (d['deadline'], d['id']))

    @router.get('/documents/{document_id}', tags=['Legal file cabinet'])
    def document(document_id: str):
        with db() as conn:
            d = resource(conn, document_id, 'document')
            versions = [dict(r) for r in conn.execute('SELECT id,version,filename,content_type,digest,length(content) AS size_bytes,created_at FROM document_versions WHERE document_id=? ORDER BY version DESC', (document_id,))]
            return d | {'versions': versions, 'review_prompts': ['Confirm the recorded deadline against the source document and issuing authority.', 'Record the responsible person and any questions for your qualified adviser in notes.'], 'advice_mode': 'organizational_checklist_only', 'note': 'No legal interpretation or jurisdiction-specific advice is generated.'}

    @router.put('/documents/{document_id}', tags=['Legal file cabinet'])
    def update_document(document_id: str, body: DocumentMetadata):
        with db() as conn:
            return save(conn, 'document', body.model_dump(mode='json'), document_id)

    @router.post('/documents/{document_id}/versions', tags=['Legal file cabinet'], status_code=201)
    async def upload_version(document_id: str, file: UploadFile = File(...)):
        content = await file.read(10_000_001)
        if not content or len(content) > 10_000_000:
            raise HTTPException(413 if content else 422, 'File must contain between 1 byte and 10 MB')
        filename = (file.filename or 'document').replace('\\', '/').split('/')[-1]
        filename = ''.join(c for c in filename if c.isprintable() and c not in '";')[:200] or 'document'
        with db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            resource(conn, document_id, 'document')
            number = conn.execute('SELECT COALESCE(MAX(version),0)+1 FROM document_versions WHERE document_id=?', (document_id,)).fetchone()[0]
            version_id = str(uuid.uuid4())
            conn.execute('INSERT INTO document_versions(id,document_id,version,filename,content_type,digest,content) VALUES(?,?,?,?,?,?,?)', (version_id, document_id, number, filename, 'application/octet-stream', hashlib.sha256(content).hexdigest(), content))
            return {'id': version_id, 'document_id': document_id, 'version': number, 'filename': filename, 'size_bytes': len(content)}

    @router.get('/documents/{document_id}/versions/{version_id}/download', tags=['Legal file cabinet'])
    def download_version(document_id: str, version_id: str):
        with db() as conn:
            resource(conn, document_id, 'document')
            r = conn.execute('SELECT * FROM document_versions WHERE id=? AND document_id=?', (version_id, document_id)).fetchone()
            if not r:
                raise HTTPException(404, 'Document version not found')
            return Response(bytes(r['content']), media_type='application/octet-stream', headers={'Content-Disposition': "attachment; filename*=UTF-8''" + quote(r['filename'], safe=''), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store'})

    @router.post('/calendar/events', tags=['Calendar'], status_code=201)
    def create_event(body: EventInput):
        with db() as conn:
            return save(conn, 'event', body.model_dump(mode='json'))

    @router.get('/calendar/events', tags=['Calendar'])
    def list_events():
        with db() as conn:
            return resources(conn, 'event')

    @router.get('/calendar/events/{event_id}', tags=['Calendar'])
    def get_event(event_id: str):
        with db() as conn:
            return resource(conn, event_id, 'event')

    @router.put('/calendar/events/{event_id}', tags=['Calendar'])
    def update_event(event_id: str, body: EventInput):
        with db() as conn:
            return save(conn, 'event', body.model_dump(mode='json'), event_id)

    @router.get('/calendar', tags=['Calendar'])
    def calendar(start: date, end: date):
        period(start, end)
        items = []
        with db() as conn:
            for event in resources(conn, 'event'):
                if not event.get('active', True):
                    continue
                for day in occurrences(event, start, end):
                    items.append({'id': f'event:{event["id"]}:{day}', 'date': str(day), 'kind': event['kind'], 'title': event['title'], 'resource_id': event['id'], 'notes': event['notes']})
            for d in resources(conn, 'document'):
                if d['status'] == 'active' and d['deadline'] and str(start) <= d['deadline'] <= str(end):
                    items.append({'id': 'document:' + d['id'], 'date': d['deadline'], 'kind': 'document_deadline', 'title': d['title'], 'resource_id': d['id']})
            for o in resources(conn, 'order'):
                if str(start) <= o['due_on'] <= str(end):
                    items.append({'id': 'order:' + o['id'], 'date': o['due_on'], 'kind': 'order', 'title': f'Delivery: {o["supplier"]}', 'status': o['status'], 'resource_id': o['id']})
            for schedule in resources(conn, 'schedule'):
                if not schedule['active']:
                    continue
                due = date.fromisoformat(schedule['first_due_on'])
                finish = min(end, date.fromisoformat(schedule['until']))
                while due <= finish:
                    if due >= start and not conn.execute('SELECT 1 FROM order_occurrences WHERE schedule_id=? AND due_on=?', (schedule['id'], str(due))).fetchone():
                        items.append({'id': f'schedule:{schedule["id"]}:{due}', 'date': str(due), 'kind': 'scheduled_order', 'title': f'Planned order: {schedule["supplier"]}', 'status': 'not_generated', 'resource_id': schedule['id']})
                    if (date.max - due).days < schedule['every_days']:
                        break
                    due += timedelta(days=schedule['every_days'])
        return {'start': str(start), 'end': str(end), 'items': sorted(items, key=lambda i: (i['date'], i['id'])), 'note': 'Business dates only. Holidays and events are owner-entered; no external calendar or holiday feed is connected.'}

    @router.post('/orders', tags=['Orders'], status_code=201)
    def create_order(body: OrderInput):
        with db() as conn:
            return save(conn, 'order', body.model_dump(mode='json') | {'status': 'draft', 'schedule_id': None, 'tracking_mode': 'manual', 'supplier_submission': 'not_sent'})

    @router.get('/orders', tags=['Orders'])
    def orders():
        with db() as conn:
            return resources(conn, 'order')

    @router.get('/orders/{order_id}', tags=['Orders'])
    def order(order_id: str):
        with db() as conn:
            return resource(conn, order_id, 'order')

    @router.post('/orders/{order_id}/status', tags=['Orders'])
    def order_status(order_id: str, body: OrderStatus):
        allowed = {'draft': {'placed', 'cancelled'}, 'placed': {'confirmed', 'received', 'cancelled'}, 'confirmed': {'received', 'cancelled'}, 'received': set(), 'cancelled': set()}
        with db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            o = resource(conn, order_id, 'order')
            if body.status != o['status'] and body.status not in allowed[o['status']]:
                raise HTTPException(409, f'Cannot change {o["status"]} to {body.status}')
            return save(conn, 'order', {k: v for k, v in o.items() if k not in ['id', 'created_at', 'updated_at']} | {'status': body.status}, order_id)

    @router.post('/order-schedules', tags=['Orders'], status_code=201)
    def create_schedule(body: OrderSchedule):
        with db() as conn:
            return save(conn, 'schedule', body.model_dump(mode='json'))

    @router.get('/order-schedules', tags=['Orders'])
    def schedules():
        with db() as conn:
            return resources(conn, 'schedule')

    @router.post('/order-schedules/{schedule_id}/active', tags=['Orders'])
    def schedule_active(schedule_id: str, body: ScheduleActive):
        with db() as conn:
            s = resource(conn, schedule_id, 'schedule')
            return save(conn, 'schedule', {k: v for k, v in s.items() if k not in ['id', 'created_at', 'updated_at']} | {'active': body.active}, schedule_id)

    @router.post('/order-schedules/{schedule_id}/generate', tags=['Orders'])
    def generate(schedule_id: str, body: Materialize):
        with db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            s = resource(conn, schedule_id, 'schedule')
            if not s['active']:
                raise HTTPException(409, 'Schedule is paused')
            due, finish = date.fromisoformat(s['first_due_on']), min(body.through, date.fromisoformat(s['until']))
            created, existing = [], []
            while due <= finish:
                old = conn.execute('SELECT order_id FROM order_occurrences WHERE schedule_id=? AND due_on=?', (schedule_id, str(due))).fetchone()
                if old:
                    existing.append(old['order_id'])
                else:
                    o = save(conn, 'order', {'supplier': s['supplier'], 'due_on': str(due), 'lines': s['lines'], 'notes': s['notes'], 'status': 'draft', 'schedule_id': schedule_id, 'tracking_mode': 'manual', 'supplier_submission': 'not_sent'})
                    conn.execute('INSERT INTO order_occurrences VALUES(?,?,?)', (schedule_id, str(due), o['id']))
                    created.append(o['id'])
                if (date.max - due).days < s['every_days']:
                    break
                due += timedelta(days=s['every_days'])
            return {'created_order_ids': created, 'existing_order_ids': existing, 'note': 'Drafts only. No supplier is contacted and no purchase is placed.'}

    app.include_router(router)
