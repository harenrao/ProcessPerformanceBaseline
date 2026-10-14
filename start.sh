#!/usr/bin/env bash
# One-step start for macOS / Linux. Needs Python 3.9+ only (the web UI is prebuilt).
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  echo "First run: creating Python environment and installing packages (2-3 minutes)..."
  python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r backend/requirements.txt
fi
echo ""
echo "  GT Process Performance Baseline is starting."
echo "  Open http://localhost:8000 in your browser. First time: create your account."
echo "  Press Ctrl+C to stop."
echo ""
cd backend && ../.venv/bin/python -m uvicorn app.main:app --port 8000
