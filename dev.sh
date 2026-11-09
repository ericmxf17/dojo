#!/bin/sh
set -eu
cd "$(dirname "$0")"
command -v bun >/dev/null 2>&1 || { echo 'Install Bun from https://bun.sh first.'; exit 1; }
if [ ! -x backend/.venv/bin/python ]; then
  if command -v uv >/dev/null 2>&1; then
    uv venv backend/.venv --python 3.13
    uv pip install --python backend/.venv/bin/python -r backend/requirements.txt
  else
    python3 -m venv backend/.venv
    backend/.venv/bin/python -m pip install -r backend/requirements.txt
  fi
fi
if [ ! -d node_modules ]; then bun install --frozen-lockfile; fi
exec backend/.venv/bin/python scripts/dev.py
