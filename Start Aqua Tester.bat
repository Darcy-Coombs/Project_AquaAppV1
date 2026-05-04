@echo off
setlocal

cd /d "%~dp0"

echo Starting Aqua node on http://localhost:7001 ...
start "Aqua Node 7001" cmd /k "npm.cmd run dev:node -- --port 7001"

timeout /t 2 /nobreak >nul

echo Starting Aqua web tester on http://localhost:5174 ...
start "Aqua Web Tester 5174" cmd /k "node packages\web\dev-server.ts --port 5174"

timeout /t 2 /nobreak >nul

echo Opening Aqua tester in your browser ...
start "" "http://localhost:5174"

echo.
echo Aqua tester is starting.
echo Keep the two server windows open while you use the app.
pause
