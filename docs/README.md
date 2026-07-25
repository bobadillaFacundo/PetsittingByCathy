# Documentación — Petsitting by Cathy

Índice central de la documentación del proyecto. Empezá por el [README principal](../README.md) si es tu primera vez.

## Guías por tema

| Documento | Contenido |
|-----------|-----------|
| [ARQUITECTURA.md](./ARQUITECTURA.md) | Capas, flujos de datos, IA, Storage, decisiones de diseño |
| [DESPLIEGUE.md](./DESPLIEGUE.md) | Render, Vercel, Supabase, variables de entorno, backups |
| [API.md](./API.md) | Referencia de endpoints REST |
| [VACUNAS_ESCANEO.md](./VACUNAS_ESCANEO.md) | Escaneo de libretas con Groq Vision, HEIC/PDF, Storage |
| [FRONTEND.md](./FRONTEND.md) | React, rutas, panel admin, PWA, componentes |
| [BACKEND.md](./BACKEND.md) | FastAPI, servicios, migraciones, estructura de carpetas |

## Documentos en la raíz del repo

| Archivo | Contenido |
|---------|-----------|
| [README_NLP.md](../README_NLP.md) | Pipeline voz → Whisper/Groq → Qwen → PostgreSQL |
| [README_PWA.md](../README_PWA.md) | Instalación móvil, offline, iOS, DevTunnel |
| [README_BDD.md](../README_BDD.md) | Esquema relacional, normalización, ER |
| [README_GRAFICOS.md](../README_GRAFICOS.md) | Gráficos Recharts en auditoría admin |

## Por carpeta

| Carpeta | README |
|---------|--------|
| `frontend/` | [frontend/README.md](../frontend/README.md) |
| `backend/` | [backend/README.md](../backend/README.md) |
| `backend/tests/` | [backend/tests/README.md](../backend/tests/README.md) |

## Roles de usuario

| Rol | Acceso |
|-----|--------|
| **Cuidador** (`user`) | Tablero, reportes por voz, calendario, historial |
| **Admin** (`admin`) | Todo lo anterior + panel `/admin` (catálogos, mascotas, exportar) |
| **Super-admin** (`username === cathy`) | Diccionario IA, colores, análisis IA, auditoría, usuarios |

## Stack resumido

- **Frontend:** React 19, Vite 6, Tailwind 4, React Router 8, PWA
- **Backend:** FastAPI, SQLAlchemy, PostgreSQL (Supabase)
- **IA:** Groq (STT + NLP + visión), vLLM/Qwen (fallback local), Whisper local (dev)
- **Archivos:** Supabase Storage + `/uploads` local en desarrollo
