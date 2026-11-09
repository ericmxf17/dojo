# Verification record

## Automated suites

Run `./scripts/check.sh` after installing with `./dev.sh`.

- Frontend: seeded metrics, changes, alerts, missing data, CSV dollar normalization,
  repeated/unknown headers, malformed quoting, invalid dates/quantities/money,
  stock threshold equality, unsupported questions, and routing.
- Live integration: frontend service through real HTTP to a temporary FastAPI +
  SQLite process. Covers all four templates and imports, briefing, pantry mapping,
  date filtering and pagination, source record resolution, supported/unsupported
  answers, missing data, connection status, preview/confirm behavior, idempotency,
  validation errors, conflict messages, atomic rejection, HTTP/network failure.
- Backend: full sample flow, calculations and source integrity, duplicate uploads,
  invalid rows, atomic conflicts, historical cutoffs, API-key protection,
  inventory snapshot aggregation, and concurrent commits.
- TypeScript no-emit check and production client/server build.

## Browser checks performed against Connected API

- Dashboard displayed $1,020 sales, $320 base wages, $96 purchases, 31.37% ratio,
  and all four alerts for November 9, 2026.
- Milk supplier-price source drawer fetched actual November 8/9 purchase records;
  expanded record showed $72, vendor, quantity, file, and row.
- Records page displayed normalized date, money, external IDs, and source rows.
- Supported wage question returned $320 with date and source links.
- Forecast question returned an unsupported-question explanation.
- Pantry listed all three ingredients; Low stock filter isolated milk.
- Invalid CSV showed a row-2 validation error and disabled Confirm import.
- Valid CSV preview showed $8.50 without changing analytics. Browser confirmation
  committed it; November 10's dashboard then showed $8.50, with missing wages and
  purchases left missing rather than zero.
- Toast setup dialog explicitly explained unavailable vendor access/connector.
- Unreachable API showed connection errors and kept Connected API mode; restoring
  the proxy URL recovered live data.
- Mobile viewport 390 × 844: dashboard stacked correctly, navigation drawer opened
  and closed on navigation, pantry table scrolled inside its container, and no
  document-wide horizontal overflow was present.

Browser checks are manual validation, not a committed Playwright test suite.
The development server required a page reload after context-module hot updates;
verification continued after reloading. No external vendor API was exercised.

## Vercel gateway checks

Eight additional tests verify path scoping, explicit missing-backend errors,
server-only credential injection, multipart byte preservation, backend validation
status preservation, unreachable-backend handling, invalid target configuration,
and allowed methods. TypeScript and a Vercel-targeted production build also pass.
