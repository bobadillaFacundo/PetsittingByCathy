@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ========================================
echo   Petsitting by Cathy - START
echo ========================================
echo.

:: --- Backend (puerto 8000) ---
echo [1/3] Iniciando Backend...
start "Petsitting-Backend" /D "%~dp0backend" cmd /k "call .venv\Scripts\activate.bat && uvicorn src.main:app --reload --host 0.0.0.0 --port 8000"

:: --- Frontend (puerto 5173 fijo, requerido por el DevTunnel) ---
echo [2/3] Iniciando Frontend en puerto 5173...
start "Petsitting-Frontend" /D "%~dp0frontend" cmd /k "npx vite --port 5173 --host 0.0.0.0 --strictPort"

:: --- Esperar a que los puertos esten listos antes del tunel ---
echo.
echo Esperando a que Backend (8000) y Frontend (5173) acepten conexiones...
echo (si falla, mira las ventanas Backend/Frontend)

set /a tries=0
:wait_ports
set /a tries+=1
if %tries% GTR 60 (
  echo.
  echo ERROR: Timeout esperando puertos 8000/5173.
  echo Deja abiertas las ventanas Backend/Frontend y revisa el error.
  pause
  exit /b 1
)

powershell -NoProfile -Command ^
  "$ok8000=$false; $ok5173=$false; try{(New-Object Net.Sockets.TcpClient('127.0.0.1',8000)).Close(); $ok8000=$true}catch{}; try{(New-Object Net.Sockets.TcpClient('127.0.0.1',5173)).Close(); $ok5173=$true}catch{}; if($ok8000 -and $ok5173){exit 0}else{exit 1}"

if errorlevel 1 (
  timeout /t 2 /nobreak >nul
  goto wait_ports
)

echo Puertos listos.
echo.

:: --- DevTunnel (mapea 5173 y 8000) ---
echo [3/3] Iniciando DevTunnel guarderia-canina.brs...
start "Petsitting-DevTunnel" cmd /k "devtunnel host guarderia-canina.brs -a"

echo.
echo ========================================
echo   Listo. Ventanas abiertas:
echo   - Petsitting-Backend
echo   - Petsitting-Frontend
echo   - Petsitting-DevTunnel
echo.
echo   App:  https://2hgl4wdb-5173.brs.devtunnels.ms/
echo ========================================
echo.
pause
