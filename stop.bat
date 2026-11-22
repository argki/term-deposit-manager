@echo off
setlocal
cd /d "%~dp0"

echo [Term Deposit Manager] Stopping container on WSL...
wsl docker compose down
if errorlevel 1 (
  echo [ERROR] Failed to stop container.
  pause
  exit /b 1
)

echo [Term Deposit Manager] Stopped.
timeout /t 2 /nobreak >nul
exit /b 0
