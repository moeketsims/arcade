@echo off
rem Double-click to play: starts the Arcade's small web server (if it is not already running) and opens it in your browser.
title Arcade server - keep this window open while you play, close it to stop
cd /d "%~dp0"
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:5173/ | Out-Null; exit 0 } catch { exit 1 }"
if %errorlevel%==0 (
  start "" http://127.0.0.1:5173/
  exit /b
)
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:5173/"
python serve.py 5173
if errorlevel 1 (
  echo.
  echo The Arcade server could not start. Python 3 must be installed: https://www.python.org/downloads/
  pause
)
