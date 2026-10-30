@echo off
cd /d "%~dp0"
node ai-usage.mjs %*
if errorlevel 1 pause
