@echo off
REM Remote Support Agent — Windows install (requests Administrator via UAC)
setlocal
cd /d "%~dp0"

set EXE=RemoteSupport-Agent-Windows-x64-1.0.10.exe
if not exist "%EXE%" set EXE=RemoteSupport-Agent-Windows-x64-1.0.9.exe
if not exist "%EXE%" set EXE=RemoteSupport-Agent-Windows-x64-1.0.8.exe
if not exist "%EXE%" set EXE=RemoteSupport-Agent-Windows-x64-1.0.7.exe
if not exist "%EXE%" set EXE=RemoteSupport-Agent-Windows-x64-1.0.6.exe
if not exist "%EXE%" set EXE=RemoteSupport-Agent-Windows-x64-1.0.5.exe
if not exist "%EXE%" set EXE=RemoteSupport-Agent-Windows-x64-1.0.4.exe

if not exist "%EXE%" (
    echo Installer not found in %~dp0
    echo Download from https://remotesharing.space/downloads/
    pause
    exit /b 1
)

echo Installing Remote Support Agent...
echo Administrator permission is required.
echo.

"%EXE%" --install --server wss://remotesharing.space --accept-consent
set ERR=%ERRORLEVEL%

echo.
if %ERR%==0 (
    echo SUCCESS — check https://remotesharing.space/viewer.html for your endpoint.
) else if %ERR%==2 (
    echo INSTALLED — files copied but registration pending. Run repair from Program Files.
) else (
    echo INSTALL FAILED — see %%TEMP%%\RemoteSupport-install.log
)
echo.
pause
exit /b %ERR%