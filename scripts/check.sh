#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
bunx tsc --noEmit
bun run test
(cd backend && .venv/bin/python -m pytest -q)
bun run build
