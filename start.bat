@echo off
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0"
if errorlevel 1 exit /b 1

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-environment.ps1" -ProjectRoot "%~dp0." -SkipBuild
if errorlevel 1 goto :fail

echo [paper-helper] Starting backend and Electron...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-backend.ps1" -ProjectRoot "%~dp0." -StartFrontend
if errorlevel 1 goto :fail
popd
exit /b 0

:fail
set "FAIL_CODE=%errorlevel%"
if "%FAIL_CODE%"=="0" set "FAIL_CODE=1"
echo [paper-helper] Startup stopped. The specific error is shown above; logs are in logs\.
echo [paper-helper] Run setup.bat only when the error reports missing or incomplete dependencies.
if not defined PAPER_HELPER_NO_PAUSE pause
popd
exit /b %FAIL_CODE%
