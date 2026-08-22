@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title VTuber Studio Launcher

echo ========================================
echo        VTuber Studio Launcher
echo ========================================
echo.

REM ------------------------------------------------------------
REM Check server.mjs
REM ------------------------------------------------------------

if not exist "%~dp0server.mjs" (
    echo ERROR: server.mjs was not found.
    echo.
    echo Please keep start.bat and server.mjs
    echo in the same folder.
    echo.
    pause
    exit /b 1
)

REM ------------------------------------------------------------
REM Check Node.js
REM ------------------------------------------------------------

where node >nul 2>nul

if errorlevel 1 (
    echo Node.js was not found.
    echo.
    echo Node.js LTS will be installed automatically.
    echo.

    REM Check winget
    where winget >nul 2>nul

    if errorlevel 1 (
        echo ERROR: winget was not found.
        echo.
        echo Opening the Node.js download page...
        start "" "https://nodejs.org/"
        echo.
        echo Please install the LTS version of Node.js.
        echo Then run start.bat again.
        echo.
        pause
        exit /b 1
    )

    echo Installing Node.js LTS...
    echo.
    echo If Windows asks for permission, click Yes.
    echo.

    winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements

    if errorlevel 1 (
        echo.
        echo ERROR: Node.js installation failed.
        echo.
        echo Opening the Node.js website...
        start "" "https://nodejs.org/"
        echo.
        pause
        exit /b 1
    )

    echo.
    echo Node.js installation completed.
    echo.
    echo Restarting launcher...
    echo.

    timeout /t 2 /nobreak >nul

    start "" cmd /c ""%~f0""
    exit /b
)

REM ------------------------------------------------------------
REM Check Node.js
REM ------------------------------------------------------------

node --version >nul 2>nul

if errorlevel 1 (
    echo ERROR: Node.js could not start.
    echo.
    echo Please restart Windows and run start.bat again.
    echo.
    pause
    exit /b 1
)

echo Node.js detected:
node --version
echo.

REM Check for an update before starting. User settings in config are preserved.
node update.mjs
echo.

echo Preparing the background tracking app...
call npm install --no-audit --no-fund --prefer-offline
if errorlevel 1 (
    echo ERROR: Could not install the desktop runtime.
    pause
    exit /b 1
)

call npm run desktop
exit /b %errorlevel%
