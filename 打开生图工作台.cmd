@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0启动主图工作台.ps1"
if errorlevel 1 pause
