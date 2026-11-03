@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.12+ is required. Please install from the official source.
  pause
  exit /b 1
)
if not exist node_modules\electron\package.json (
  echo Run npm ci in this directory first.
  pause
  exit /b 1
)
call npm start
