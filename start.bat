@echo off
setlocal enabledelayedexpansion
title Phetcharat Gold Shop Management System
cd /d "%~dp0"

if not exist "%~dp0server.js" (
  echo.
  echo [ERROR] server.js was not found in this folder.
  echo If you downloaded a .zip from GitHub, please right-click the .zip file
  echo and choose "Extract All..." before running start.bat.
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js is not installed on this PC.
  echo Please install Node.js v22 LTS or newer from https://nodejs.org/
  echo then run start.bat again.
  echo.
  choice /c YN /m "Open https://nodejs.org/ in your browser now"
  if errorlevel 1 if not errorlevel 2 start "" "https://nodejs.org/"
  pause
  exit /b 1
)

node -e "require('node:sqlite')" >nul 2>nul
if errorlevel 1 (
  echo.
  for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
  echo [ERROR] Installed Node.js is !NODE_VER!, which does not include node:sqlite.
  echo Please update to Node.js v22.5+ ^(v22 LTS or v24^) from https://nodejs.org/
  echo then run start.bat again.
  echo.
  choice /c YN /m "Open https://nodejs.org/ in your browser now"
  if errorlevel 1 if not errorlevel 2 start "" "https://nodejs.org/"
  pause
  exit /b 1
)

echo Starting Phetcharat Gold Shop System...
node server.js --open
echo.
echo Server stopped.
pause
