# Side Work

A restaurant operations MVP: the Lovable/TanStack React frontend connected to a
FastAPI + SQLite backend. Imports, daily briefings, inventory flags, supplier price
comparisons, record drilldowns, and supported questions work against real persisted
records. Toast and Resy are explicitly **not connected**.

## Start the full demo

Prerequisites: [Bun](https://bun.sh) and Python 3.13 (or `uv` to provision it).

```sh
./dev.sh
```

This installs missing dependencies, starts the backend, idempotently loads synthetic
Juniper Kitchen data, and starts the website:

- Website: http://127.0.0.1:3100
- API documentation: http://127.0.0.1:8001/docs

Open the website and use business date **November 9, 2026**. New browsers default
to **Connected API** using `/sidework-api`. Existing browser settings are preserved;
click the mode control in the sidebar to switch explicitly.

Expected briefing: $1,020 net sales, $320 estimated base wages, $96 purchases,
31.37% wage-to-sales ratio, and four alerts including a 20% milk price increase.

Ctrl+C stops both processes. SQLite data persists under `backend/data/`. Seeding
is safe to repeat. To use a separate clean database, pass a new **absolute** path:

```sh
SIDEWORK_DB=/tmp/sidework-judge-demo.db ./dev.sh
```

Configuration:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SIDEWORK_API_PORT` | `8001` | Local backend port |
| `SIDEWORK_WEB_PORT` | `3100` | Local website port |
| `SIDEWORK_SEED_DEMO` | `1` | Set `0` to start without seeding |
| `SIDEWORK_DB` | `backend/data/sidework.db` | Backend database path |
| `SIDEWORK_API_KEY` | unset | Optional local API gate; dev proxy supplies it server-side |
| `SIDEWORK_BACKEND_URL` | `http://127.0.0.1:8001` | Proxy target when running Vite directly |
| `VITE_SIDEWORK_API_URL` | `/sidework-api` | Browser API base; never put a secret here |

For a standalone frontend process use `bun run dev --port 3100`. For the backend
alone use `PORT=8001 backend/run.sh`.

## How the integration works

Browser → `/sidework-api/*` → Vite development proxy → FastAPI → SQLite.
The browser does not receive backend secrets. `src/lib/sidework/api.ts` implements
sample and live APIs. `live-contract.ts` translates the backend wire formats into
the existing frontend view models: dollar inputs to normalized cents, import
statuses and previews, row errors, record IDs, alert metadata, pantry batches,
coverage dates, provider connection status, and question/date context.

Both modes download and accept the **same backend CSV templates**. Formats and
normalization rules are documented in [backend/README.md](backend/README.md).
Downloads contain headers; fill in rows before uploading. Purchases are not COGS
or profit, wages exclude payroll overhead, and stock reflects recorded snapshots.

Sample mode stores synthetic/local records in this browser only. The app never
falls back to sample data on a live failure. Uploaded previews do not affect totals
until confirmed; invalid or conflicting imports are rejected atomically.

## Judge walkthrough

1. Overview: explain the four totals and changes versus November 8.
2. Open the milk-price alert sources and expand the $60 / $72 purchases.
3. Digital Pantry: filter to low stock; show milk and its recorded expiration.
4. Imports: choose Sales, download the template, upload a filled CSV, review,
   then confirm. Open Records or Overview for the CSV's business date.
5. Ask Side Work: click “What needs attention today?” and inspect its sources.
6. Connections: show that CSV works and Toast/Resy still require future connectors.

The limited question interface is rule-based, not generative AI.

## Checks

After `./dev.sh` has installed dependencies:

```sh
./scripts/check.sh
```

This runs TypeScript checks, frontend/sample tests, real HTTP integration tests
against a temporary isolated backend database, Python backend tests, and a full
production build. Integration tests start/stop their own API process, so they do
not mutate the demo database. See [TESTING.md](TESTING.md) for browser checks.

## Deployment boundary

This repository is integrated and runnable **locally**, not publicly deployed.
The production frontend builds successfully with the original Lovable Cloudflare
configuration. Vite's development proxy is not included in that production build.
For a hosted version, either route `/sidework-api/*` to a separately hosted FastAPI
service with persistent disk, or configure a reachable HTTPS API base and allow
the frontend origin through `SIDEWORK_CORS_ORIGINS`. If API-key access is enabled,
a trusted server-side proxy must inject that key; never ship it in browser code.
Production accounts, tenant isolation, provider integrations, and backups remain
future work. This is a single-restaurant demonstration.
