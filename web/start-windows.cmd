@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 22 or newer, then run this file again.
  start "" "https://nodejs.org/"
  pause
  exit /b 1
)

if not exist node_modules\next\package.json (
  echo Installing dependencies for the first run...
  call npm.cmd ci
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

if not defined PORT set PORT=3000
echo.
echo Starting RYM Visualizer at http://127.0.0.1:%PORT%/
echo Keep this window open. Press Ctrl+C to stop.
echo.

start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://127.0.0.1:%PORT%/'"
call npm.cmd run dev -- --hostname 0.0.0.0 --port %PORT%

