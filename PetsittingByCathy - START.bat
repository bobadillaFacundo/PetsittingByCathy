@echo off
echo Iniciando el proyecto con vLLM y Whisper...

:: --- Configuración del Backend ---
echo Iniciando servidor Backend...
start "backend" cmd /k "cd /d "%~dp0backend" && call .venv\Scripts\activate && uvicorn src.main:app --reload"


:: --- Configuración del Frontend ---
echo Iniciando servidor Frontend...
start "frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

:: --- Configuración del DevTunnel (Acceso a Internet) ---
echo Iniciando túnel estático a internet...
start "DevTunnel" cmd /k "devtunnel host guarderia-canina.brs -a"

echo ¡Servidores iniciados en ventanas separadas!
pause
