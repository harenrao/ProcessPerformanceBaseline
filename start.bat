@echo off
setlocal
title PPB helper
cd /d "%~dp0"

REM ---- find Python (the py launcher first; the "python" command can be a Microsoft Store stub)
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY goto nopython

REM ---- first run: create a private Python environment and install packages
if not exist ".venv\installed.ok" (
  echo.
  echo First run: setting up. This takes 2-5 minutes and needs internet.
  echo.
  if exist ".venv" rmdir /s /q ".venv"
  %PY% -m venv .venv
  if errorlevel 1 goto failed
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
  if errorlevel 1 goto failed
  echo ok> ".venv\installed.ok"
)

echo.
echo   ============================================================
echo    PPB helper is running at  http://localhost:8000
echo    Your browser will open in a few seconds.
echo    Keep this window open while you work. Close it to stop.
echo   ============================================================
echo.
start "" /b cmd /c "ping -n 7 127.0.0.1 >nul & start http://localhost:8000"
cd backend
"..\.venv\Scripts\python.exe" -m uvicorn app.main:app --port 8000
echo.
echo The app has stopped. If there is an error above, send a screenshot of this window.
pause
exit /b 0

:nopython
echo.
echo Python was not found.
echo Install Python 3.12 from https://www.python.org/downloads/
echo and tick "Add python.exe to PATH" on the first install screen.
echo Then double-click start.bat again.
echo.
pause
exit /b 1

:failed
echo.
echo Setup did not finish. Common causes:
echo   - no internet, or a company proxy blocking downloads
echo   - a very new Python version; install Python 3.12 instead
echo Send a screenshot of this window if you need help. Double-click start.bat to retry.
echo.
pause
exit /b 1
