# Arquitectura del sistema

## Visión general

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React PWA) — Vercel / Vite dev :5173                 │
│  Dashboard · VoiceRecorder · Calendario · Admin · Historial     │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS  /api/*  (proxy o CORS)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend (FastAPI) — Render / uvicorn :8000                      │
│  auth · animals · reports · dashboard · catalogs · reservations   │
└─────┬──────────────┬──────────────┬──────────────┬──────────────┘
      │              │              │              │
      ▼              ▼              ▼              ▼
 PostgreSQL     Supabase       Groq API       vLLM (opcional)
 (Supabase)     Storage        STT/NLP/       Qwen 7B
                uploads/       Vision         Tailscale
```

## Capas del backend

| Capa | Ubicación | Responsabilidad |
|------|-----------|-----------------|
| **Rutas** | `backend/src/routes/` | HTTP, validación, permisos |
| **DTOs** | `backend/src/dtos/` | Esquemas Pydantic de entrada/salida |
| **Modelos** | `backend/src/models/models.py` | ORM SQLAlchemy |
| **Servicios** | `backend/src/services/` | Lógica de negocio, IA, Storage |
| **BD** | `backend/src/database/` | Sesión, seed, migraciones |

### Servicios principales

| Servicio | Archivo | Función |
|----------|---------|---------|
| Audio / NLP | `audio_service.py` | STT, prompts Qwen/Groq, clima, evolución |
| Reportes | `report_helpers.py` | Severidad, alertas, TagSets obligatorios |
| Visión vacunas | `vision_service.py` | Groq Vision, HEIC/PDF, OCR/Ollama fallback |
| Storage | `storage_service.py` | Subida a Supabase Storage |
| Tags | `tag_helpers.py` | Variantes TagSet, keywords de color |
| Media | `media_helpers.py` | Validación de extensiones |

## Flujos de datos clave

### 1. Reporte por voz

```
Micrófono → VoiceRecorder.jsx
         → POST /reports/analyze-voice
         → Whisper (local) o Groq STT
         → Qwen/Groq NLP → JSON (TagSets, severidad)
         → Wizard confirmación
         → POST /reports/confirm → PostgreSQL
         → (opcional) fotos → Storage
         → (si crítico) critical_alerts
```

Detalle: [README_NLP.md](../README_NLP.md)

### 2. Escaneo de vacunas

```
Foto/PDF/HEIC → LibretaTab.jsx (normaliza a JPEG en browser)
             → POST /animals/{id}/vaccines/scan
             → vision_service (Groq qwen/qwen3.6-27b)
             → lote editable → bulk / bulk-with-document
             → Supabase Storage (carpeta vaccines/)
```

Detalle: [VACUNAS_ESCANEO.md](./VACUNAS_ESCANEO.md)

### 3. Calendario y reservas

| Tipo de evento | Animales permitidos | `is_daycare` |
|----------------|---------------------|--------------|
| Estadía / Nueva reserva | Internas | `false` |
| Vet / Baño / actividades | Guardería externa | `true` |

Validación en `reservation_routes.py` y `CalendarioPanel.jsx`.

### 4. Guardería externa vs Internas

| Sección admin | `is_daycare` | Uso |
|---------------|--------------|-----|
| **Guardería Externa** | `true` | Casita diaria, tablero, vet/baño en calendario |
| **Internas** | `false` | Servicios sin estadía permanente, reservas |

## Autenticación

- JWT en header `Authorization: Bearer <token>`
- Login: `POST /auth/login` (OAuth2 form: username + password)
- Expiración ~24 h; el frontend limpia sesión en `401` (`src/lib/auth.js`)
- Roles: `admin` | `user` en tabla `users`

## Almacenamiento de archivos

| Entorno | Destino |
|---------|---------|
| **Producción** | Supabase Storage (`SUPABASE_STORAGE_BUCKET`, ej. `uploads/`) |
| **Desarrollo** | `backend/uploads/` servido en `/uploads/...` |

Subcarpetas típicas: `photos/`, `labs/`, `vaccines/`, `observations/`.

## IA — modos de operación

| Capacidad | Producción (Render) | Desarrollo local |
|-----------|---------------------|------------------|
| STT | Groq Whisper | Groq o faster-whisper |
| NLP reportes | Groq (`USE_GROQ=1`) | Groq o vLLM Tailscale |
| Visión vacunas | Groq Vision | Groq (+ Ollama/OCR si configurados) |
| Clima / evolución | Groq / vLLM | Idem |

En Render: `VISION_SKIP_LOCAL_FALLBACKS=1` (sin Ollama/OCR locales).

## Migraciones al arrancar

`main.py` ejecuta `migrate_normalize.migrate()` en el lifespan de FastAPI:
- Columnas nuevas (ej. `vaccines.document_url`, perfil animal)
- Tablas hijas 1FN (tag_variants, etc.)
- Usa `DIRECT_DATABASE_URL` (puerto 5432) si está definida

## Documentación relacionada

- [DESPLIEGUE.md](./DESPLIEGUE.md)
- [API.md](./API.md)
- [README_BDD.md](../README_BDD.md)
