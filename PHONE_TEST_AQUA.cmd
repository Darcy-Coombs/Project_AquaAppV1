@echo off
setlocal
cd /d "%~dp0"

title Project Aqua Phone Test
echo.
echo Project Aqua Phone Test
echo =======================
echo.

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

echo Starting LAN phone test server...
echo Keep this window open while testing on your phone.
echo.
call npm.cmd run phone:test

echo.
echo Phone test stopped.
pause
