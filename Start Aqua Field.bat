@echo off
setlocal

cd /d "%~dp0"

echo Starting Aqua trusted field node on http://localhost:7001 ...
start "Aqua Node 7001" cmd /k "npm.cmd run dev:node -- --port 7001"

timeout /t 2 /nobreak >nul

echo Starting Aqua Field browser app on http://localhost:5180 ...
start "Aqua Field 5180" cmd /k "node packages\field-web\dev-server.ts --port 5180"

timeout /t 2 /nobreak >nul

echo Opening Aqua Field ...
start "" "http://localhost:5180"

echo.
echo For phones, use your computer LAN IP or an HTTPS tunnel so the phone can reach this app and node.
echo The app must sync to a node URL that the phone can reach, not localhost on the phone.
pause
