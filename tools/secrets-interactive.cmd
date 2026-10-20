@echo off
setlocal
chcp 65001 >nul
pushd "%~dp0.."
echo Configure production secrets for app-drink-cf
echo.
powershell.exe -NoProfile -File ".\tools\set-production-secrets.ps1"
echo.
echo Secret setup finished with exit code %errorlevel%.
echo Copy any error message above before closing this window.
pause
popd
endlocal
