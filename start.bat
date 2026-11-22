@echo off
setlocal
cd /d "%~dp0"

set "UPDATE_NEEDED=0"
set "PENDING_FILE=%~dp0data\.update-pending"
if exist "%PENDING_FILE%" (
  set "UPDATE_NEEDED=1"
)

set "STARTING_FILE=%~dp0public\starting.html"
set "TARGET_URL=http://127.0.0.1:3457"
if exist "%STARTING_FILE%" (
  for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command "[System.Uri]::new('%STARTING_FILE%').AbsoluteUri"`) do set "TARGET_URL=%%U"
)
if exist "%STARTING_FILE%" if "%UPDATE_NEEDED%"=="1" set "TARGET_URL=%TARGET_URL%?mode=update"

echo [Term Deposit Manager] Opening browser (%TARGET_URL%)...
set "EDGE_EXE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  set "EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
)

if defined EDGE_EXE (
  start /max "" "%EDGE_EXE%" --start-maximized --app="%TARGET_URL%"
) else (
  powershell -NoProfile -Command "Start-Process '%TARGET_URL%' -WindowStyle Maximized"
)

echo [Term Deposit Manager] Checking Docker on WSL...
wsl docker info >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker is not running on WSL. Please start Docker in WSL and try again.
  pause
  exit /b 1
)

if "%UPDATE_NEEDED%"=="1" (
  echo [Term Deposit Manager] Scheduled update detected. Pulling latest changes and rebuilding container on WSL...
  wsl sh scripts/update-helper.sh pull
  wsl docker compose up -d --build --force-recreate
  set "MAX_WAIT=180"
) else (
  echo [Term Deposit Manager] Starting container on WSL...
  wsl docker compose up -d
  set "MAX_WAIT=30"
)
if errorlevel 1 (
  echo [ERROR] Failed to start container.
  pause
  exit /b 1
)

echo [Term Deposit Manager] Waiting for application health check...
set /a COUNT=0
:WAIT_LOOP
set /a COUNT+=1
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3457/api/health' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 goto READY

if %COUNT% GEQ %MAX_WAIT% (
  echo [ERROR] Timed out waiting for application startup. Check logs with: wsl docker compose logs
  pause
  exit /b 1
)

timeout /t 1 /nobreak >nul
goto WAIT_LOOP

:READY
echo [Term Deposit Manager] Keeping WSL session active while container is running...
powershell -NoProfile -Command "$q = [char]34; Start-Process -FilePath 'wsl.exe' -WindowStyle Hidden -ArgumentList ('-e sh -c ' + $q + 'exec 9>/tmp/term-deposit-manager-keepalive.lock && flock -n 9 && while docker inspect -f {{.State.Running}} term-deposit-manager 2>/dev/null | grep -qx true; do sleep 10; done' + $q)"

if "%UPDATE_NEEDED%"=="1" (
  if exist "%PENDING_FILE%" del /f /q "%PENDING_FILE%"
  echo [Term Deposit Manager] Scheduled update completed.
) else (
  echo [Term Deposit Manager] Checking for updates for next startup...
  wsl sh scripts/update-helper.sh check data/.update-pending
)

echo [Term Deposit Manager] Application is ready at http://127.0.0.1:3457
timeout /t 1 /nobreak >nul
exit /b 0
