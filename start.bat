@echo off
REM One-step start for Windows. Needs Python 3.9+ only (the web UI is prebuilt).
cd /d "%~dp0"
if not exist .venv (
  echo First run: creating Python environment and installing packages, 2-3 minutes...
  py -3 -m venv .venv || python -m venv .venv
  .venv\Scripts\python -m pip install -q --upgrade pip
  .venv\Scripts\python -m pip install -q -r backend\requirements.txt
)
echo.
echo   GT Process Performance Baseline is starting.
echo   Open http://localhost:8000 in your browser. First time: create your account.
echo   Press Ctrl+C to stop.
echo.
cd backend
..\.venv\Scripts\python -m uvicorn app.main:app --port 8000
