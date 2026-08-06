@echo off
setlocal
cd /d "%~dp0"

title Project Aqua Launcher
echo.
echo Project Aqua Web App v1.0
echo =========================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH.
  echo Install Node.js 22+ or 24+, then double-click this file again.
  echo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found on PATH.
  echo Reinstall Node.js with npm enabled, then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies. This can take a minute the first time...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo Dependency install failed.
    pause
    exit /b 1
  )
)

echo.
echo Starting Aqua node relay and web app...
echo Web app: http://127.0.0.1:5173
echo Node health: http://127.0.0.1:8787/health
echo.
echo Leave this window open while using the app.
echo Press Ctrl+C in this window to stop the stack.
echo.

start "Aqua Browser Opener" /MIN cmd /c "timeout /t 12 >nul & start http://127.0.0.1:5173"
call npm.cmd run dev

echo.
echo Project Aqua stopped.
pause
