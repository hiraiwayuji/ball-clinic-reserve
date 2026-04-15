@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ===========================================
echo お渡し用パッケージの作成を開始します...
echo しばらくお待ちください。
echo ===========================================
powershell -ExecutionPolicy Bypass -File "%~dp0Build_Distribution.ps1"
echo.
pause
