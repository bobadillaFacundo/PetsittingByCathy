# Despliegue y entornos

## Entornos típicos

| Entorno | Frontend | Backend | Base de datos |
|---------|----------|---------|---------------|
| **Local** | `localhost:5173` | `localhost:8000` | Supabase o Postgres local |
| **Producción** | Vercel | Render (`petsittingbycathy.onrender.com`) | Supabase PostgreSQL |

## Inicio rápido local

### Windows (todo-en-uno)

```bat
PetsittingByCathy - START.bat
```

Levanta backend `:8000`, frontend `:5173` y opcionalmente DevTunnel.

### Manual

```bash
# Backend
cd backend
cp .env.example .env   # completar variables
pip install -r requirements.txt
python -m src.database.init_db
python -m src.database.migrate_normalize
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd frontend
cp .env.example .env
npm install
npm run dev
```

El proxy de Vite redirige `/api/*` → `http://localhost:8000`.

## Render (backend)

Configuración en `backend/render.yaml`:

| Campo | Valor |
|-------|-------|
| `rootDir` | `backend` |
| `buildCommand` | `pip install -r requirements.txt` |
| `startCommand` | `uvicorn src.main:app --host 0.0.0.0 --port $PORT` |
| `PYTHON_VERSION` | `3.11.0` |

### Variables obligatorias en Render Dashboard

| Variable | Descripción |
|----------|-------------|
| `SECRET_KEY` | Firma JWT (hex 32+ bytes) |
| `DATABASE_URL` | Supabase pooler (puerto **6543**) |
| `DIRECT_DATABASE_URL` | Supabase directo (puerto **5432**) para migraciones |
| `SUPABASE_URL` | URL del proyecto |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo backend |
| `SUPABASE_STORAGE_BUCKET` | Ej. `uploads` |
| `GROQ_API_KEY` | STT + NLP + visión |
| `USE_GROQ` | `1` en producción |
| `GROQ_STT_MODEL` | `whisper-large-v3-turbo` |
| `GROQ_MODEL` | `openai/gpt-oss-20b` |
| `GROQ_VISION_MODEL` | `qwen/qwen3.6-27b` |
| `VISION_SKIP_LOCAL_FALLBACKS` | `1` |
| `TZ` | `America/Argentina/Buenos_Aires` |

### Variables opcionales

| Variable | Uso |
|----------|-----|
| `QDRANT_URL` + `QDRANT_API_KEY` | Vectores / RAG |
| `OLLAMA_BASE_URL` | Solo si accesible desde Render (no Tailscale) |
| `OCR_SERVICE_URL` | PaddleOCR remoto |
| `VLLM_BASE_URL` | Si no usás Groq para NLP |

> **Nota:** URLs `localhost` o Tailscale (`100.82.x.x`) no funcionan como fallback desde Render.

## Vercel (frontend)

- Build: `npm run build` en `frontend/`
- `vercel.json` define rewrites hacia la API de producción
- Variable `VITE_API_BASE` (si aplica) en `.env` / dashboard Vercel

## Supabase

### PostgreSQL

1. **Transaction pooler (6543)** → `DATABASE_URL` para uvicorn
2. **Direct (5432)** → `DIRECT_DATABASE_URL` para `ALTER TABLE` al iniciar

### Storage

1. Crear bucket **público** (ej. `uploads`)
2. Carpetas: `photos/`, `labs/`, `vaccines/`
3. `SUPABASE_SERVICE_ROLE_KEY` en backend únicamente

Plantilla completa: `backend/.env.example`

## Backups (`migration/`)

Scripts para respaldar Postgres y Qdrant al servidor propio:

```bash
cd migration
cp BACKUP.env.example BACKUP.env
pip install -r requirements.txt
./run_backup.sh          # Postgres
./run_backup_qdrant.sh   # Qdrant → Chroma
```

Cron sugerido: cada ~15 días (`0 3 */15 * *`).

## HTTPS y PWA

- Producción: HTTPS en frontend y backend
- Desarrollo móvil: DevTunnel o `VITE_DEV_HTTPS=1`

Ver [README_PWA.md](../README_PWA.md).

## Health checks

| Endpoint | Uso |
|----------|-----|
| `GET /` | API viva |
| `GET /health/schema` | Verifica columnas de `reservations` |

## Troubleshooting producción

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| 502 en escaneo vacunas | Groq caído o timeout | Revisar `GROQ_API_KEY`, logs Render |
| 400 al escanear | Archivo ilegible | Usar JPG nítido; el frontend convierte HEIC |
| Cold start lento | Plan free Render | Esperar ~30 s o plan Starter |
| JWT inválido | Token expirado | Re-login |
| Migración falla | Sin `DIRECT_DATABASE_URL` | Configurar puerto 5432 |

## Documentación relacionada

- [ARQUITECTURA.md](./ARQUITECTURA.md)
- [backend/.env.example](../backend/.env.example)
- [backend/render.yaml](../backend/render.yaml)
