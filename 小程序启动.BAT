@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0"
if errorlevel 1 exit /b 1
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-mobile-web.ps1"
set "EXIT_CODE=%errorlevel%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo [Paper Helper] Phone access stopped. Read the message above.
  if not defined PAPER_HELPER_NO_PAUSE pause
)
popd
exit /b %EXIT_CODE%
