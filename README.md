# Petsitting by Cathy

Sistema integral de gestión para **guardería canina** (y mascotas externas): historial clínico, reportes por voz con IA, calendario de reservas, libreta sanitaria con escaneo de vacunas, panel de administración y PWA instalable en móviles.

| | |
|---|---|
| **Frontend** | React 19 + Vite 6 + Tailwind 4 + PWA → [Vercel](https://vercel.com) |
| **Backend** | FastAPI + SQLAlchemy → [Render](https://render.com) |
| **Base de datos** | PostgreSQL en [Supabase](https://supabase.com) |
| **IA** | [Groq](https://groq.com) (STT, NLP, visión) + vLLM/Qwen opcional en dev |
| **Archivos** | Supabase Storage |

---

## Tabla de contenidos

1. [Características](#características)
2. [Roles y permisos](#roles-y-permisos)
3. [Inicio rápido](#inicio-rápido)
4. [Estructura del proyecto](#estructura-del-proyecto)
5. [Documentación](#documentación)
6. [API resumida](#api-resumida)
7. [Variables de entorno](#variables-de-entorno)
8. [Licencia](#licencia)

---

## Características

### Reportes por voz (NLP)

El cuidador graba un audio (*"Kira comió la mitad pero vomitó agua"*). El sistema:

1. **Transcribe** (Groq Whisper en producción; faster-whisper local en dev)
2. **Interpreta** con LLM (Groq o Qwen 7B vía vLLM)
3. **Normaliza** en TagSets (Comida, Agua, Pis, Caca + catálogo editable)
4. **Confirma** en un wizard con severidad verde / amarillo / rojo
5. **Alerta** si detecta keywords críticas

Soporta **fotos**, **modo offline** (sync por lote) y **edición** posterior del texto.

→ Detalle: [README_NLP.md](./README_NLP.md)

### PWA móvil

Instalable en Android/iOS, safe-area, reportes offline, cámara.

→ Detalle: [README_PWA.md](./README_PWA.md)

### Panel de inteligencia (admin)

- **Clima de la guardería:** resumen IA de las últimas 48 h
- **Análisis por animal:** evolución neutra y factual
- **Gráficos interactivos:** barras por mascota, donut de síntomas (clic filtra)
- **Alertas críticas** en tablero hasta resolverlas
- **Exportación PDF** de historia clínica asistida por IA

→ Gráficos: [README_GRAFICOS.md](./README_GRAFICOS.md)

### Calendario

| Tipo | Animales | Ejemplos de estado |
|------|----------|-------------------|
| **Estadía / reserva** | Internas (`is_daycare=false`) | Pendiente, Confirmada, Ingresada, Finalizada |
| **Vet / Baño** | Guardería externa (`is_daycare=true`) | Llevar Veterinaria, Viene Veterinaria, Llevar a Bañar |

### Guardería externa vs Internas

| Sección admin | `is_daycare` | Uso |
|---------------|--------------|-----|
| **Guardería Externa** | `true` | Tablero diario (casita), vet/baño en calendario, estadía |
| **Internas** | `false` | Reservas y servicios sin estadía permanente |

Cada animal tiene perfil clínico completo: libreta, desparasitaciones, laboratorios, medicación, observaciones.

**Perfil del animal:** color de pelaje, edad o rango (rescate), raza / SÍMIL, rasgos (ciego, sordo, neurológico, etc.).

### Escaneo de vacunas con IA

Subir foto, HEIC o PDF de libreta → **Groq Vision** extrae vacunas → lote editable → guardar con documento en Storage.

→ Detalle: [docs/VACUNAS_ESCANEO.md](./docs/VACUNAS_ESCANEO.md)

### Base de datos normalizada

PostgreSQL con esquema 1FN/2FN, libreta sanitaria, reportes, reservas, catálogos IA.

→ Detalle: [README_BDD.md](./README_BDD.md)

---

## Roles y permisos

| Rol | Acceso |
|-----|--------|
| **Cuidador** (`user`) | Tablero, reportes, calendario, historial |
| **Admin** (`admin`) | + Panel `/admin`: guardería, mascotas, catálogos, exportar |
| **Super-admin** (`username === 'cathy'`) | + Diccionario IA, colores, análisis, auditoría, usuarios |

---

## Inicio rápido

### Requisitos

- Python 3.11+
- Node.js 20+ (22+ recomendado para React Router 8)
- Cuenta Supabase (PostgreSQL + Storage)
- `GROQ_API_KEY` (STT, NLP y visión en producción)

### Windows — todo en uno

```bat
PetsittingByCathy - START.bat
```

### Manual

```bash
# 1. Backend
cd backend
cp .env.example .env    # completar SUPABASE, GROQ, DATABASE_URL
pip install -r requirements.txt
python -m src.database.init_db
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

# 2. Frontend (otra terminal)
cd frontend
npm install
npm run dev
```

App: `http://localhost:5173` — API: `http://localhost:8000` — Docs interactivas: `http://localhost:8000/docs`

### Producción

| Servicio | URL típica |
|----------|------------|
| API | `https://petsittingbycathy.onrender.com` |
| Web | Vercel (configurado en `frontend/vercel.json`) |

→ Guía completa: [docs/DESPLIEGUE.md](./docs/DESPLIEGUE.md)

---

## Estructura del proyecto

```
PetsittingByCathy/
├── backend/                 # API FastAPI
│   ├── src/routes/          # Endpoints REST
│   ├── src/services/        # IA, storage, helpers
│   ├── src/models/          # SQLAlchemy ORM
│   ├── tests/               # pytest
│   ├── render.yaml          # Render.com
│   └── .env.example
├── frontend/                # React PWA
│   ├── src/pages/admin/     # Panel administración
│   └── vercel.json
├── docs/                    # Documentación segmentada
│   ├── README.md            # Índice de docs
│   ├── ARQUITECTURA.md
│   ├── DESPLIEGUE.md
│   ├── API.md
│   ├── VACUNAS_ESCANEO.md
│   ├── FRONTEND.md
│   └── BACKEND.md
├── migration/               # Scripts backup Postgres/Qdrant
├── README_NLP.md
├── README_PWA.md
├── README_BDD.md
├── README_GRAFICOS.md
└── PetsittingByCathy - START.bat
```

---

## Documentación

### Índice principal

📁 **[docs/README.md](./docs/README.md)** — punto de entrada a toda la documentación técnica.

### Guías por tema

| Documento | Contenido |
|-----------|-----------|
| [docs/ARQUITECTURA.md](./docs/ARQUITECTURA.md) | Capas, flujos, IA, Storage |
| [docs/DESPLIEGUE.md](./docs/DESPLIEGUE.md) | Render, Vercel, Supabase, env |
| [docs/API.md](./docs/API.md) | Referencia REST completa |
| [docs/VACUNAS_ESCANEO.md](./docs/VACUNAS_ESCANEO.md) | Escaneo libretas Groq Vision |
| [docs/FRONTEND.md](./docs/FRONTEND.md) | React, rutas, admin, PWA |
| [docs/BACKEND.md](./docs/BACKEND.md) | FastAPI, servicios, tests |

### Documentos temáticos (raíz)

| Documento | Contenido |
|-----------|-----------|
| [README_NLP.md](./README_NLP.md) | Voz → texto → BD |
| [README_PWA.md](./README_PWA.md) | Instalación móvil, offline |
| [README_BDD.md](./README_BDD.md) | Esquema y normalización |
| [README_GRAFICOS.md](./README_GRAFICOS.md) | Gráficos auditoría |

### Por carpeta

| Carpeta | README |
|---------|--------|
| [frontend/README.md](./frontend/README.md) | Resumen frontend |
| [backend/README.md](./backend/README.md) | Resumen backend |
| [backend/tests/README.md](./backend/tests/README.md) | Suite pytest |

---

## API resumida

Autenticación: `Authorization: Bearer <JWT>` (excepto login).

| Área | Rutas principales |
|------|-------------------|
| Auth | `POST /auth/login`, `GET /auth/me` |
| Reportes | `POST /reports/analyze-voice`, `/confirm`, `GET /reports/all` |
| Animales | `CRUD /animals/`, `/history`, `/vaccines/scan` |
| Dashboard | `GET /dashboard/`, `/weather` |
| Catálogos | `CRUD /catalogs/{species, breeds, ...}` |
| Reservas | `CRUD /reservations/` |

Referencia completa: [docs/API.md](./docs/API.md) — Swagger: `/docs` en el backend.

---

## Variables de entorno

Plantilla completa: **`backend/.env.example`**

| Variable | Descripción |
|----------|-------------|
| `SECRET_KEY` | Firma JWT |
| `DATABASE_URL` | Supabase pooler (6543) |
| `DIRECT_DATABASE_URL` | Supabase directo (5432) migraciones |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Storage |
| `GROQ_API_KEY` | STT + NLP + visión |
| `USE_GROQ` | `1` en producción |
| `GROQ_VISION_MODEL` | `qwen/qwen3.6-27b` |
| `VISION_SKIP_LOCAL_FALLBACKS` | `1` en Render |
| `TZ` | `America/Argentina/Buenos_Aires` |

---

## Tecnologías

| Capa | Stack |
|------|-------|
| Frontend | React 19, Vite 6, Tailwind 4, React Router 8, Recharts, PWA |
| Backend | FastAPI, Starlette, SQLAlchemy, Pydantic, JWT |
| BD | PostgreSQL (Supabase) |
| IA | Groq (Whisper, Llama, Qwen Vision), vLLM/Qwen (dev) |
| Archivos | Supabase Storage |

---

## Licencia

[MIT](./LICENSE)

---

*Desarrollado para el día a día de cuidadores y control total de administradores de la guardería.*
