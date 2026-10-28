@echo off
echo ============================================
echo   WOW Player - Starting...
echo ============================================
echo.
echo The app will open in your browser automatically.
echo Press Ctrl+C in this window to stop the server.
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Download it from https://nodejs.org
    echo Install it, then run this script again.
    pause
    exit /b 1
)

:: Install dependencies if needed
if not exist node_modules (
    echo Installing dependencies for the first time...
    call npm install
    echo.
)

:: Open browser after a short delay
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:5173"

:: Start the dev server
call npm run dev
