@echo off
rem Whale widget local proxy starter (ASCII only to stay safe on GBK cmd)
cd /d "%~dp0"
echo [whale] starting local proxy at http://127.0.0.1:8790 ...
echo [whale] keep this window open while using the widget.
node proxy.js
echo.
echo [whale] proxy exited with code %errorlevel%
pause
