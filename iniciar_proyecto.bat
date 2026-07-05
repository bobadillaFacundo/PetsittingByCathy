@echo off
echo Iniciando el proyecto con vLLM y Whisper...

:: --- Configuración del Backend ---
echo Iniciando servidor Backend...
start "backend" cmd /k "cd /d "%~dp0backend" && call venv\Scripts\activate && uvicorn src.main:app --reload"

:: --- Configuración de vLLM (Inteligencia Artificial Local en WSL) ---
echo Iniciando servidor vLLM local...
:: Ejecutamos vLLM dentro de WSL con modelo optimizado AWQ (Puerto 8701)
start "vLLM" wsl -e bash -lc "source /mnt/f/guarderiaCanina/backend/wsl_venv/bin/activate && export VLLM_USE_FLASHINFER_SAMPLER=0 && python3 -m vllm.entrypoints.openai.api_server --model Qwen/Qwen2.5-1.5B-Instruct-AWQ --gpu-memory-utilization 0.75 --max-model-len 4096 --enforce-eager --port 8701; echo 'vLLM server stopped.'; exec bash"

:: --- Configuración del Frontend ---
echo Iniciando servidor Frontend...
start "frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

:: --- Configuración del DevTunnel (Acceso a Internet) ---
echo Iniciando túnel estático a internet...
start "DevTunnel" cmd /k "devtunnel host guarderia-canina.brs -a"

echo ¡Servidores iniciados en ventanas separadas!
pause
