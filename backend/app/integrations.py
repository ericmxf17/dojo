"""Small, server-only vendor clients. Credentials are never returned to callers."""
import json
import os
from datetime import datetime
from datetime import date
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import HTTPException


def seven_shifts_configured() -> bool:
    return bool(os.getenv('SEVENSHIFTS_ACCESS_TOKEN') and os.getenv('SEVENSHIFTS_COMPANY_ID'))


def seven_shifts_get(path: str, params: dict[str, str] | None = None):
    if not seven_shifts_configured():
        raise HTTPException(503, '7shifts is not configured. Set SEVENSHIFTS_ACCESS_TOKEN and SEVENSHIFTS_COMPANY_ID on the backend.')
    base = os.getenv('SEVENSHIFTS_API_BASE', 'https://api.7shifts.com/v2').rstrip('/')
    url = f'{base}/{path.lstrip("/")}'
    if params:
        url += '?' + urlencode(params)
    req = Request(url, headers={
        'Authorization': f'Bearer {os.environ["SEVENSHIFTS_ACCESS_TOKEN"]}',
        'x-api-version': os.getenv('SEVENSHIFTS_API_VERSION', '2026-01-01'),
        'Accept': 'application/json',
    })
    try:
        with urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode('utf-8'))
    except HTTPError as exc:
        raise HTTPException(502, f'7shifts API returned HTTP {exc.code}') from exc
    except (URLError, TimeoutError, ValueError) as exc:
        raise HTTPException(502, '7shifts API could not be reached or returned invalid JSON') from exc


def seven_shifts_time_punches(start: date, end: date):
    company = os.environ['SEVENSHIFTS_COMPANY_ID']
    cursor = None
    rows = []
    while True:
        params = {'limit': '100', 'start_date': str(start), 'end_date': str(end)}
        if cursor:
            params['cursor'] = cursor
        payload = seven_shifts_get(f'company/{company}/time_punches', params)
        rows.extend(payload.get('data', []))
        cursor = (payload.get('meta') or {}).get('cursor', {}).get('next')
        if not cursor:
            break
        if len(rows) > 10000:
            raise HTTPException(502, '7shifts response exceeded the safe 10,000-row limit')
    return rows


def normalize_7shifts_punch(row: dict):
    """Map common 7shifts time-punch shapes into a reviewable Sidework labor candidate."""
    employee = row.get('employee_name') or row.get('employee') or row.get('user_name') or str(row.get('employee_id', ''))
    punch_id = row.get('id') or row.get('time_punch_id')
    start = row.get('clock_in') or row.get('start') or row.get('start_time')
    end = row.get('clock_out') or row.get('end') or row.get('end_time')
    hours = row.get('hours') or row.get('regular_hours')
    warnings = []
    if not punch_id:
        warnings.append('missing punch id')
    if not employee:
        warnings.append('missing employee identifier')
    if hours is None and start and end:
        try:
            parse = lambda value: datetime.fromisoformat(str(value).replace('Z', '+00:00'))
            hours = round((parse(end) - parse(start)).total_seconds() / 3600, 4)
        except (TypeError, ValueError):
            warnings.append('could not calculate hours from clock-in/clock-out')
    if hours is None:
        warnings.append('missing hours')
    business_date = str(row.get('date') or (start or '')[:10])
    return {
        'external_id': f'7shifts:{punch_id}' if punch_id else None,
        'date': business_date,
        'employee': employee or None,
        'hours': str(hours) if hours is not None else None,
        'hourly_rate': None,
        'warnings': warnings + (['hourly rate is not supplied by this preview'] if row.get('hourly_rate') is None else []),
        'source': '7shifts',
    }
