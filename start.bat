@echo off
cd /d "%~dp0"
rem "python -c" in plaats van "where python": de Microsoft Store-snelkoppeling wordt wel gevonden, maar werkt niet
python -c "" >nul 2>nul
if %errorlevel%==0 (
  python server.py 8080
) else (
  echo Python niet gevonden, Node.js wordt gebruikt.
  start "" http://localhost:8080
  npx --yes http-server -p 8080 -c-1
)
