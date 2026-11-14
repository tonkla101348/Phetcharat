@echo off
title Phetcharat Gold Shop Management System
cd /d "%~dp0"
echo Starting Phetcharat Gold Shop System on http://localhost:3456 ...
start "" http://localhost:3456
node server.js
pause
