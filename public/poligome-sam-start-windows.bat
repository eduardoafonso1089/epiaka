@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Poligome SAM local - iniciar servidor

set "APP_DIR=%LOCALAPPDATA%\PoligomeSAM"
set "PYTHON=%APP_DIR%\venv\Scripts\python.exe"
set "CONNECTOR=%APP_DIR%\poligome-sam-local.py"
set "CHECKPOINT=%APP_DIR%\sam_vit_b_01ec64.pth"
set "SITE_URL=https://www.poligome.com"

echo.
echo ==========================================
echo   Poligome SAM - iniciar novamente
echo ==========================================
echo.

if not exist "%PYTHON%" goto :not_installed
if not exist "%CONNECTOR%" goto :not_installed
if not exist "%CHECKPOINT%" goto :not_installed

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $response=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:7860/health' -TimeoutSec 2; if($response.StatusCode -eq 200){exit 0} } catch {}; exit 1"
if not errorlevel 1 (
  echo O servidor SAM ja esta em execucao.
  start "" "%SITE_URL%"
  timeout /t 2 >nul
  exit /b 0
)

echo Loading the installed model. Keep this window open.
start "" "%SITE_URL%"
"%PYTHON%" "%CONNECTOR%" --checkpoint "%CHECKPOINT%" --model-type vit_b --device auto
echo.
echo The server has stopped. Run this launcher again to reopen it.
pause
exit /b 0

:not_installed
echo The full SAM installation was not found on this computer.
echo Open Poligome and use the "Install on Windows" button first.
start "" "%SITE_URL%"
pause
exit /b 1
