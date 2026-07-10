# Petsitting by Cathy - Sistema Integral de Guardería Canina

Bienvenido al repositorio principal del sistema **Petsitting by Cathy**, una plataforma Full-Stack impulsada por Inteligencia Artificial (FastAPI + React) diseñada para gestionar y normalizar el historial clínico de mascotas en una guardería.

## Características Principales

### 1. Motor NLP y Reconocimiento de Voz
Los cuidadores graban un audio (*"Kira comió la mitad pero vomitó agua"*) y el sistema transcribe (Whisper local), interpreta con **Qwen 7B en el servidor vLLM**, extrae entidades y las normaliza en la base de datos.

En la confirmación siempre aparecen **Comida, Agua, Pis y Caca** (opcionales) y se puede marcar el texto como **observación** (amarillo).

> Ver detalles técnicos en [README_NLP.md](./README_NLP.md)

### 2. Aplicación Web Progresiva (PWA)
Instalable en teléfonos Android/iOS. Modo offline para reportes de voz, safe-area iOS, y acceso remoto vía **Microsoft DevTunnel**.

> Ver guía en [README_PWA.md](./README_PWA.md)

### 3. Dashboard de Inteligencia y Auditoría
- **El Clima de la Guardería:** la IA resume reportes recientes y detecta anomalías (sin exagerar).
- **Análisis por animal:** resumen neutro y factual de la evolución (sin alarmismo).
- **Gráficos interactivos (Admin):** barras por mascota y donut de síntomas; clic filtra el panel.
- **Filtro por color** en auditoría: Verde / Amarillo / Rojo.
- **Alertas críticas:** banner rojo hasta marcarlas como resueltas.
- **Colores semánticos:** verde, amarillo (observación) o rojo según reglas + tipo de evento.
- **Historial clínico:** timeline, edición de transcripción y PDF asistido por IA.
- **Fotos en reportes:** cámara o galería junto al audio.

> Gráficos: [README_GRAFICOS.md](./README_GRAFICOS.md)

### 4. Calendario de Reservas
Tab **Calendario** en la app (`CalendarioPanel`):
- **Estadía / Nueva Reserva** → solo mascotas **externas** (`is_daycare = false`). Estados: Pendiente, Confirmada, Ingresada, Finalizada, Cancelada.
- **Vet / Baño** → solo mascotas de **guardería** (`is_daycare = true`). Estados: Llevar Veterinaria, Viene Veterinaria, Llevar a Bañar.

Validación en frontend y en `POST/PUT /reservations`.

### 5. Mascotas Guardería vs Externas
- Campo `animals.is_daycare`:
  - **Guardería** (`true`): aparecen en la casita / tablero diario.
  - **Externas** (`false`): solo reservas de calendario (vet/baño usan guardería).
- Panel Admin: secciones **Mascotas Guardería** y **Mascotas Externas**.
- En el modal de mascota: pestañas Libreta sanitaria, Desparasitaciones y Laboratorios.

### 6. Panel Admin
Ruta `/admin` (rol `admin`). Super-admin (`username === 'cathy'`) ve además Diccionario IA, Colores, Análisis IA, Auditoría y Usuarios.

| Sección | Quién | Función |
|---------|-------|---------|
| Diccionario IA | Super | TagSets y variantes aprendidas |
| Colores de Reporte | Super | Keywords rojo / amarillo |
| Análisis IA | Super | Evolución neutra por paciente |
| Mascotas Guardería / Externas | Admin | CRUD + libreta / labs / desparasitaciones |
| Gestión de Catálogos | Admin | Especies, razas, labs, vacunas, productos, vets |
| Exportar Historias | Admin | PDF clínico IA (`1month`…`1year`) |
| Auditoría Reportes | Super | Clima, gráficos, feed filtrable |
| Usuarios | Super | Alta, password, activar/desactivar |

Modales de alta/edición con portal a `document.body` (scroll nativo en iOS).

### 7. Catálogos y Diccionarios IA
- TagSets **obligatorios** (no eliminables): Comida, Agua, Pis, Caca.
- Resto de conjuntos, especies, razas, colores, etc. editables en Admin.

### 8. Esquema Relacional Normalizado
Historiales médicos, desparasitaciones, libretas, reservas, reportes, alertas y multimedia.

> Ver [README_BDD.md](./README_BDD.md)

---

## Estructura del Proyecto

```
PetsittingByCathy/
├── backend/          # API FastAPI + SQLAlchemy + NLP
│   ├── src/
│   │   ├── models/   # Modelos ORM
│   │   ├── routes/   # Endpoints REST
│   │   └── services/ # Whisper, Qwen (vLLM), helpers
│   └── uploads/      # Audios, fotos, labs (gitignored)
├── frontend/         # React + Vite + TailwindCSS + PWA
│   └── src/
│       ├── components/   # VoiceRecorder, InstallPrompt
│       └── pages/        # Dashboard, AnimalHistory, admin/
├── PetsittingByCathy - START.bat   # Backend + Frontend + DevTunnel
├── README.md
├── README_NLP.md
├── README_PWA.md
├── README_BDD.md
├── README_GRAFICOS.md
└── LICENSE
```

---

## Inicio Rápido

### Requisitos
- Python 3.9+
- Node.js 18+
- PostgreSQL
- Servidor **vLLM** con Qwen 2.5 7B (recomendado) o Groq (`USE_GROQ=1`)

### Todo-en-uno (Windows)

```bat
PetsittingByCathy - START.bat
```

Levanta backend (`:8000`), frontend (`:5173`) y el túnel `guarderia-canina.brs`.

### Backend

```powershell
cd backend
python -m pip install -r requirements.txt
python -m src.database.init_db
python -m src.database.migrate_normalize
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```powershell
cd frontend
npm install
npx vite --port 5173 --host 0.0.0.0 --strictPort
```

La app corre en `http://localhost:5173` con proxy `/api` → `:8000`.

---

## API — Endpoints Relevantes

Todos los endpoints (excepto login) requieren `Authorization: Bearer <token>`.

### Auth y usuarios

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/login` | Login → JWT |
| `GET` | `/auth/me` | Usuario actual |
| `GET/POST` | `/users/` | Listar / crear usuarios (admin) |
| `PUT` | `/users/{id}/password` | Cambiar contraseña |
| `PUT` | `/users/{id}/toggle_status` | Activar / desactivar |

### Reportes e IA

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/reports/analyze-voice` | Transcribe audio y extrae entidades NLP |
| `POST` | `/reports/analyze-text` | Mismo NLP sin audio |
| `POST` | `/reports/confirm` | Guarda reporte + severidad + alertas |
| `POST` | `/reports/analyze-and-confirm-batch` | Sync offline |
| `PUT` | `/reports/{id}/edit` | Edita transcripción y recalcula |
| `POST` | `/reports/{id}/attach-photo` | Adjunta foto |
| `GET` | `/reports/all` | Feed de auditoría / gráficos |
| `GET` | `/reports/export-pdf/{animal_id}` | PDF clínico IA (`?range=1month\|3months\|6months\|9months\|1year`) |

### Animales y clínica

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET/POST` | `/animals/` | Listar / crear |
| `GET/PUT/DELETE` | `/animals/{id}` | Detalle / editar / borrar |
| `GET` | `/animals/{id}/history` | Historial clínico |
| `GET` | `/animals/{id}/evolution-analysis` | Análisis neutro por animal |
| `GET` | `/animals/{id}/health_record` | Libreta sanitaria |
| `GET/POST` | `/animals/{id}/vaccines` | Vacunas |
| `GET/POST` | `/animals/{id}/internal_dewormings` | Desparasitaciones internas |
| `GET/POST` | `/animals/{id}/external_dewormings` | Desparasitaciones externas |
| `GET/POST` | `/animals/{id}/lab_results` | Estudios de laboratorio |
| `POST` | `/animals/{id}/lab_results/upload` | Subir PDF/imagen de lab |

### Dashboard, catálogos y reservas

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/dashboard/` | Tablero + alertas |
| `GET` | `/dashboard/weather` | Clima IA |
| `PATCH` | `/dashboard/critical-alerts/{id}/resolve` | Resolver alerta |
| `GET` | `/dashboard/dictionary` | Diccionario IA |
| `GET/PUT` | `/catalogs/color-rules` | Reglas de color |
| `CRUD` | `/catalogs/{species\|breeds\|laboratories\|vaccines\|products\|veterinarians\|tagsets}` | Catálogos admin |
| `CRUD` | `/reservations/` | Calendario (reglas `is_daycare`) |
| `POST` | `/chat/` | Q&A NLP (endpoint disponible) |

Archivos estáticos: `/uploads/...` (audios, fotos, labs).

---

## Variables de Entorno

| Variable | Dónde | Descripción |
|----------|-------|-------------|
| `SECRET_KEY` | Backend | Firma JWT (default de desarrollo; cambiar en producción) |
| `VLLM_BASE_URL` | Backend | Default `http://100.82.178.56:8010/v1` |
| `VLLM_MODEL` | Backend | Default `Qwen/Qwen2.5-7B-Instruct-AWQ` |
| `USE_GROQ` | Backend | `1` para forzar Groq en lugar de vLLM |
| `GROQ_API_KEY` | Backend | Requerido si `USE_GROQ=1` |
| `GROQ_MODEL` | Backend | Default `llama-3.1-8b-instant` |
| `VITE_DEV_HTTPS` | Frontend | `1` para HTTPS local (PWA en LAN) |

PostgreSQL se configura en `backend/src/database/session.py`.

---

## Tecnologías

| Capa | Stack |
|------|-------|
| **Frontend** | React 19, Vite, TailwindCSS 4, React Router, Recharts, idb-keyval, VitePWA |
| **Backend** | FastAPI, SQLAlchemy, Pydantic, JWT + bcrypt |
| **Base de datos** | PostgreSQL |
| **IA** | faster-whisper (`medium` local) + **Qwen 2.5 7B** vía vLLM en servidor (`100.82.178.56:8010`) |

---

## Documentación Adicional

| Archivo | Contenido |
|---------|-----------|
| [README_NLP.md](./README_NLP.md) | Pipeline voz → texto → JSON → BD |
| [README_PWA.md](./README_PWA.md) | Instalación móvil, offline, túnel, responsive |
| [README_BDD.md](./README_BDD.md) | DER, tablas, normalización |
| [README_GRAFICOS.md](./README_GRAFICOS.md) | Gráficos y filtros de auditoría |
| [frontend/README.md](./frontend/README.md) | Estructura UI y paneles |
| [backend/tests/README.md](./backend/tests/README.md) | Suite de tests (pytest) |

---

## Licencia

Este proyecto está bajo la licencia [MIT](./LICENSE).

---

*Desarrollado para facilitar el día a día de cuidadores y proveer control total a los administradores.*
