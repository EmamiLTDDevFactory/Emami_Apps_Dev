@echo off
cd /d "%~dp0"
echo Starting Dev Tracker preview...
echo.
echo Once you see "running at http://localhost:8081...", open that address
echo in your browser (or just go to http://localhost:8081/apps/dev-tracker/).
echo.
echo Leave this window open while you're viewing the app.
echo Close this window (or press Ctrl+C) when you're done.
echo.
node preview-server.js
pause
