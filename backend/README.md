# Side Work backend MVP

A working single-restaurant backend for a daily operations briefing. CSV imports
feed a persistent SQLite database; calculations and alerts point back to imported
records. The included restaurant and employee data are synthetic.

## Hosted deployment

The repository includes `render.yaml` and `backend/Dockerfile` for a free MVP
FastAPI deployment. It uses `SIDEWORK_DB=/tmp/sidework.db`, so imported data may
reset during restarts or redeploys. Before production use, move the database to
managed persistent storage or attach a paid disk and set `SIDEWORK_DB` to its
mount path. Provider secrets belong in the host's secret settings and must never
be exposed through frontend environment variables.

After deployment, configure the Vercel project with `SIDEWORK_BACKEND_URL`, the
same `SIDEWORK_API_KEY`, and optionally `VITE_SIDEWORK_DEFAULT_MODE=live`, then
redeploy the frontend.

## Run locally

From this directory:

```sh
./run.sh
```

The script uses the included virtual environment, or installs requirements into
one on first run (Python 3.13 recommended). In a second terminal, from this directory:

```sh
.venv/bin/python demo.py
```

Open http://127.0.0.1:8000/docs for the interactive API. Running the demo repeatedly
is safe: file hashes and stable record IDs prevent duplicate imports. Stop the
server with Ctrl+C. Data survives restart in `data/sidework.db`.

For a clean demonstration without changing existing data, start the server with
a new database path, for example:

```sh
SIDEWORK_DB=data/judge-demo.db ./run.sh
```

Use `PORT=8001 ./run.sh` and `demo.py --url http://127.0.0.1:8001` if port 8000 is busy.

## Five-minute judge demo

All sample records use **November 8–9, 2026**, regardless of the computer's current date.
The story: sales are flat, base wages rose, milk became more expensive, and
perishable inventory needs attention.

1. In `/docs`, expand `GET /api/integrations`. Both vendor connections honestly
   say `not_connected`; the current ingestion method is CSV.
2. For a live upload demonstration, use a fresh database. Open
   `POST /api/imports/preview`, select `sales`, and upload `sample_data/sales.csv`.
   Show the validated preview. Copy its `id` to
   `POST /api/imports/{import_id}/commit` and execute it.
3. Run `demo.py` to safely load the remaining fixtures (and reuse the sales import).
4. Execute `GET /api/briefing` with `on=2026-11-09`.
   - Net sales: **$1,020.00** (flat versus previous day).
   - Estimated base wages: **$320.00**, up $40.00.
   - Estimated wage-to-sales ratio: **31.37%**.
   - Recorded purchases: **$96.00**. This is not cost of goods sold or profit.
5. Show the four alerts: milk low stock, two approaching recorded expiration
   dates, and a **20% milk purchase-unit-price increase**.
6. Execute `POST /api/ask` with:

```json
{"question":"What needs attention today?","on":"2026-11-09"}
```

7. Copy an alert's `record_id` into `GET /api/records/{record_id}` to show its
   filename, source row, and normalized values. This demonstrates traceability.

The question endpoint is a limited, rule-based interface, not generative AI.
It supports the example questions it returns and rejects unsupported questions.
It cannot forecast demand, determine causation, or answer arbitrary questions.

## API contract

The generated `openapi.json` and interactive `/docs` describe every request and
response parameter. Most responses are JSON objects; `/api/imports` returns a list.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | API and database readiness |
| `GET /api/imports/templates` | Exact headers and supported-format rules |
| `POST /api/imports/preview?kind=sales` | Multipart `file`; validate and stage CSV |
| `POST /api/imports/{id}/commit` | Atomic commit; reject all rows if any conflict |
| `GET /api/imports` | Import history, errors, first ten normalized rows |
| `GET /api/imports/{id}` | One import and its validation status |
| `GET /api/records?kind=sales&on=2026-11-09` | Paginated normalized rows and sources |
| `GET /api/records/{id}` | Source record detail |
| `GET /api/briefing?on=2026-11-09` | Daily metrics, previous-day comparison, alerts |
| `GET /api/inventory?on=2026-11-09` | Latest available inventory snapshots |
| `GET /api/alerts?on=2026-11-09` | Source-backed inventory and price alerts |
| `POST /api/ask` | Supported daily-total and alert questions |
| `GET /api/integrations` | Honest provider connection status |

Uploads are UTF-8 CSV, at most 2 MB / 10,000 records, using the exact headers in
`sample_data/`. Preview does not affect analytics. Invalid previews cannot be
committed. Reupload corrected files to obtain a new preview. A conflicting
`external_id` rejects the entire commit; importing is append-only in this MVP.
A repeated commit is idempotent. Record IDs are unique within each data kind.

Money is represented as integer USD cents in API responses. Dates are restaurant
business dates, not inferred from timestamps. Missing daily data is `null`, not
zero. No currency conversion, refunds-as-negative-rows, or tax calculation is included.
`row_number` counts CSV records with the header as row 1 (not physical lines in a
multiline quoted file). Normalized records are retained; original file bytes are
not archived for download.

Inventory imports are **complete absolute snapshots per ingredient/unit/date**.
Each batch snapshot row needs a unique external ID; include all remaining batches
for an ingredient on a newer snapshot date, even if their expiry dates differ.
Rows on the latest date sum; older snapshots are excluded. Use a zero-quantity row
to record stock depletion. Low-stock threshold is the maximum threshold recorded
for that ingredient/unit on the snapshot date. Units are lowercased but not
converted: `kg` and `g` remain separate. Ingredient and supplier matching is
case-insensitive, not fuzzy. Price comparisons use weighted unit costs on the
selected day versus the most recent earlier purchase day for the same supplier,
ingredient, and unit. They do not infer price changes between different suppliers.

## Connect a website later

The website calls this backend's JSON API. No Toast credentials belong in browser
code. For a local, synthetic-data-only prototype:

```javascript
const response = await fetch(
  'http://127.0.0.1:8000/api/briefing?on=2026-11-09'
);
if (!response.ok) throw new Error(`Side Work: ${response.status}`);
const report = await response.json();
const sales = report.metrics.net_sales.amount_cents;
const displaySales = sales === null ? 'No sales data' : `$${(sales / 100).toFixed(2)}`;
```

The frontend flow for an upload is multipart preview → show errors/normalized
preview → commit the returned ID → refresh briefing. Don't set `Content-Type`
manually for `FormData`; let the browser add the multipart boundary.

For a published website, host this API behind HTTPS and persistent storage.
Configure `SIDEWORK_CORS_ORIGINS` as exact comma-separated frontend origins.
A public Webflow page will not work as a production connection to this localhost
server. Put an authenticated server-side proxy between the website and this API;
keep `SIDEWORK_API_KEY` in that proxy, never in public Webflow scripts. The included
API key gate is a single-restaurant demo access control, not a multi-user account
system. CORS alone is not authentication.

Environment variables:

- `SIDEWORK_DB`: SQLite path; defaults to `data/sidework.db` beside the application.
- `SIDEWORK_API_KEY`: optional local-demo key; when set, every data endpoint and
  health request requires `X-API-Key`. Use `/docs`' Authorize button to test it.
- `SIDEWORK_CORS_ORIGINS`: defaults to `http://localhost:3000,http://localhost:8080`.
- `PORT`: local launcher port; defaults to 8000.

The server binds only to `127.0.0.1` by default. This is a local demo, not a
production deployment. Live integrations, tenant isolation, accounts/roles,
background sync, backups, and payroll execution remain future work.

## Validation

```sh
.venv/bin/python -m pytest -q
```

Tests cover the end-to-end fixture scenario, numerical results, traceable sources,
repeat imports, atomic rejection of invalid/conflicting files, historical cutoffs,
missing data, inventory snapshots, API key protection, and concurrent commits.

## Backend workspace expansion (v0.2)

These additions are backend-only. They do not add frontend tabs or change the
hosted Vercel demo. All data endpoints inherit the existing API-key gate.
The same SQLite database now stores workspace resources and document file bytes;
back up the database to preserve both. Existing CSV tables remain compatible.

### Service dashboard

`GET /api/service-summary?on=2026-11-09` returns net sales in cents, total imported
hours as a decimal string, estimated base wages, distinct exact employee names,
record counts, source references, and missing-data indicators. If `on` is omitted,
it uses the previous calendar business date in `SIDEWORK_TIMEZONE` (default
`America/New_York`). A business date uses the uploaded records' dates; this is not
an automatic overnight-shift allocation or proof that service coverage is complete.

### Provider workspaces

`GET /api/providers` lists Toast, 7shifts, MarketMan, and Restaurant365, with the
requested descriptions and supported record kinds. The existing
`GET /api/integrations` response is unchanged for frontend compatibility.

- Toast: sales and labor.
- 7shifts: labor.
- MarketMan: inventory and purchases.
- Restaurant365: sales, labor, purchases, inventory.

`GET /api/providers/{provider}?on=2026-11-09` returns only the selected provider's
explicitly attributed, committed records for that date.

To attribute a file, upload a CSV **already mapped into Side Work's exact template**
to `POST /api/providers/{provider}/imports/preview?kind=labor`, multipart field
`file`, then use the returned `next` commit endpoint. Native vendor export formats
are not automatically detected. Existing duplicate-file and record-ID protection
still applies. The same exact file cannot be attributed to two different providers.

`POST /api/providers/{provider}/sync` explicitly returns 409: no live vendor
adapter, OAuth flow, or vendor credentials have been configured. These workspaces
are an ingestion/provenance interface, not completed commercial API integrations.

### One consolidated payroll preparation document

Preview: `GET /api/payroll/preview?start=2026-11-08&end=2026-11-09`.

Create an immutable, source-backed draft snapshot:

```http
POST /api/payroll/runs
Content-Type: application/json

{
  "start": "2026-11-08",
  "end": "2026-11-09",
  "idempotency_key": "november-first-period",
  "adjustments": [
    {"employee": "Employee A", "tips_cents": 1000,
     "bonus_cents": 500, "reimbursement_cents": 200}
  ]
}
```

The report automatically combines the imported labor rows by exact employee name,
rounding base wages per original row before summing. Tips, bonuses and
reimbursements must be entered explicitly. Employee aliases and shifts duplicated
across vendors under different external IDs must be reconciled before use.
Missing labor blocks snapshot creation. Conflicting idempotency inputs return 409.
A retry with identical input returns the original snapshot even after later imports.

- `GET /api/payroll/runs`: snapshot history.
- `GET /api/payroll/runs/{id}`: saved draft.
- `GET /api/payroll/runs/{id}/export?format=csv`: one consolidated CSV, money in cents.
- `GET /api/payroll/runs/{id}/export?format=html`: one printable HTML document.

CSV formula injection is escaped; HTML content is escaped. These are preparation
exports, **not payroll submission, tax calculations, net pay, or overtime-policy
calculations**. No funds move and no payroll provider is contacted.

### Legal file cabinet and deadlines

1. `POST /api/documents` with title, category, optional deadline, and notes.
2. `POST /api/documents/{id}/versions` with multipart field `file` (1 byte–10 MB).
3. `GET /api/documents/{id}` to inspect metadata and immutable version history.
4. `GET /api/documents/{id}/versions/{version_id}/download` to retrieve exact bytes.
5. `PUT /api/documents/{id}` to replace metadata or set `status` to `archived`.

Example metadata:

```json
{"title":"Operating permit","category":"permit","deadline":"2026-11-12",
 "notes":"Owner to confirm renewal requirements with the issuer","status":"active"}
```

Categories: license, permit, insurance, lease, employment, contract, other.
`GET /api/documents?status=active|archived|all` lists the cabinet.
`GET /api/documents/deadlines?on=2026-11-09&within_days=30` includes active overdue
and upcoming documents through the window, sorted earliest first. Metadata updates
do not overwrite stored file versions. Downloads are attachments and never render
uploaded HTML inline. The organizational review prompts help collect questions;
no legal interpretation, deadline inference, or jurisdiction-specific advice is
produced. No reminder emails or notifications are sent.

### Calendar, holidays and events

`POST /api/calendar/events` creates owner-entered holidays, events or deadlines:

```json
{"title":"Weekly service meeting","date":"2026-11-09","kind":"event",
 "repeat":"weekly","repeat_until":"2026-12-31","notes":"Review upcoming orders"}
```

Kinds: holiday, event, deadline. Repeat: none, weekly, monthly, yearly.
Monthly recurrence on the 31st skips months without that day; a yearly February 29
skips non-leap years. `GET /api/calendar/events` and `GET /api/calendar/events/{id}`
read the originals; `PUT /api/calendar/events/{id}` replaces the definition.
Set `active:false` when replacing to archive a recurring event.

`GET /api/calendar?start=2026-11-01&end=2026-11-30` combines event occurrences,
active document deadlines, delivery dates, and ungenerated recurring-order dates.
Ranges are inclusive and capped at 367 days. Holidays are entered by the owner;
no holiday feed, external calendar, or background job is connected.

### Orders and repeat orders

`POST /api/orders` creates a draft with supplier, due_on, notes and lines:

```json
{"supplier":"Local Dairy","due_on":"2026-11-12","lines":[
 {"ingredient":"Milk","quantity":"20.5","unit":"l","unit_cost_cents":360}
]}
```

`GET /api/orders` lists drafts and tracked orders; `GET /api/orders/{id}` returns one.
`POST /api/orders/{id}/status` updates manual status:

- draft → placed or cancelled.
- placed → confirmed, received or cancelled.
- confirmed → received or cancelled.
- received/cancelled are terminal; repeating the same status is safe.

These statuses are owner-reported. Marking placed **does not submit a purchase**.
Receiving an order does not automatically replenish inventory or book an expense.

`POST /api/order-schedules` takes supplier, first_due_on, every_days, until, lines,
and notes. Schedules may span at most one year. `GET /api/order-schedules` lists them.
`POST /api/order-schedules/{id}/active` with `{"active":false}` pauses a schedule.
`POST /api/order-schedules/{id}/generate` with `{"through":"2026-11-30"}`
materializes all due occurrences as drafts. Repeated or concurrent calls cannot
create duplicate occurrences. Calendar projections work before materializing;
materialized orders replace those projections without duplicate calendar items.
No supplier is contacted. A future scheduler can call this generation endpoint;
there is no background scheduler in this release.
