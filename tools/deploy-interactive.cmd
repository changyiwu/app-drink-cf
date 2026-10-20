@echo off
setlocal
chcp 65001 >nul
pushd "%~dp0.."
echo Cloudflare Worker deploy: app-drink-cf
echo.
call npx wrangler deploy
echo.
echo Deployment command finished with exit code %errorlevel%.
echo Copy the Workers URL or error message above before closing this window.
pause
popd
endlocal
