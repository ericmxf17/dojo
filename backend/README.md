# Side Work backend MVP

A working single-restaurant backend for a daily operations briefing. CSV imports
feed a persistent SQLite database; calculations and alerts point back to imported
records. The included restaurant and employee data are synthetic.

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
