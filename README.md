# Petsitting by Cathy - Sistema Integral de Guardería Canina

Bienvenido al repositorio principal del sistema **Petsitting by Cathy**, una plataforma Full-Stack impulsada por Inteligencia Artificial (FastAPI + React) diseñada para gestionar y normalizar el historial clínico de mascotas en una guardería.

## Características Principales

### 1. Motor NLP y Reconocimiento de Voz
Los cuidadores graban un audio (*"Kira comió la mitad pero vomitó agua"*) y el sistema transcribe, limpia, extrae entidades (Comida, Enfermedad, etc.) y las normaliza en la base de datos.

> Ver detalles técnicos en [README_NLP.md](./README_NLP.md)

### 2. Aplicación Web Progresiva (PWA)
Instalable en teléfonos Android/iOS sin tiendas de aplicaciones. Modo offline para reportes de voz con sincronización posterior.

> Ver guía en [README_PWA.md](./README_PWA.md)

### 3. Dashboard de Inteligencia y Auditoría
- **El Clima de la Guardería:** la IA resume reportes de las últimas 48 h y detecta anomalías.
- **Gráficos interactivos (Admin):** barras por mascota y donut de síntomas; clic en un segmento filtra todo el panel en tiempo real.
- **Alertas críticas:** banner rojo fijado en el tablero cuando se detectan palabras clave (`sangre`, `vómito`, `diarrea`, etc.). Permanece hasta marcarla como resuelta.
- **Colores semánticos:** eventos en verde, amarillo o rojo según reglas configurables en el panel admin.
- **Historial clínico:** timeline por paciente con exportación PDF asistida por IA (solo admin).
- **Edición de transcripciones:** corregir manualmente un reporte antiguo; la IA re-analiza y recalcula colores.
- **Fotos en reportes:** tomar o subir imágenes junto al reporte de voz (heridas, comida, deposiciones, etc.).

> Gráficos interactivos del panel admin: [README_GRAFICOS.md](./README_GRAFICOS.md)

### 4. Esquema Relacional Normalizado
Historiales médicos, desparasitaciones, libretas sanitarias, reservas, reportes diarios, alertas y multimedia.

> Ver diagrama ER y análisis de normalización en [README_BDD.md](./README_BDD.md)

---

## Estructura del Proyecto

```
PetsittingByCathy/
├── backend/          # API FastAPI + SQLAlchemy + NLP
│   ├── src/
│   │   ├── models/   # Modelos ORM
│   │   ├── routes/   # Endpoints REST
│   │   └── services/ # Whisper, Qwen, helpers
│   └── uploads/      # Audios, fotos, labs (gitignored)
├── frontend/         # React + Vite + TailwindCSS
│   └── src/
│       ├── components/   # VoiceRecorder, InstallPrompt
│       └── pages/        # Dashboard, AnimalHistory, admin/
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
- PostgreSQL (producción) o SQLite (desarrollo local)
- vLLM con Qwen 2.5 7B (opcional; Groq como alternativa)

### Backend

```powershell
cd backend
python -m pip install -r requirements.txt
python -m src.database.init_db        # Crea tablas
python -m src.database.migrate_normalize  # Migra CSV→tablas hijas, unifica dewormings
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

La app corre en `http://localhost:5173` con proxy `/api` → `:8000`.

---

## API — Endpoints Nuevos y Relevantes

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/reports/analyze-voice` | Transcribe audio y extrae entidades NLP |
| `POST` | `/reports/confirm` | Guarda reporte confirmado + alertas críticas |
| `PUT` | `/reports/{id}/edit` | Edita transcripción y recalcula eventos/colores |
| `POST` | `/reports/{id}/attach-photo` | Adjunta foto al reporte |
| `GET` | `/animals/{id}/history` | Historial con eventos, fotos y transcripciones |
| `GET` | `/dashboard/` | Tablero + alertas de vacunas + **alertas críticas** |
| `PATCH` | `/dashboard/critical-alerts/{id}/resolve` | Marca alerta crítica como resuelta |
| `GET` | `/catalogs/color-rules` | Reglas de color (palabras clave rojo/amarillo) |

Todos los endpoints (excepto login) requieren header `Authorization: Bearer <token>`.

---

## Tecnologías

| Capa | Stack |
|------|-------|
| **Frontend** | React 19, Vite, TailwindCSS 4, React Router, Recharts, idb-keyval |
| **Backend** | FastAPI, SQLAlchemy, Pydantic, JWT + bcrypt |
| **Base de datos** | PostgreSQL |
| **IA** | faster-whisper (`medium`), Qwen 2.5 7B (vLLM) o Groq |

---

## Documentación Adicional

| Archivo | Contenido |
|---------|-----------|
| [README_NLP.md](./README_NLP.md) | Pipeline voz → texto → JSON → BD |
| [README_PWA.md](./README_PWA.md) | Instalación móvil, offline, cámara |
| [README_BDD.md](./README_BDD.md) | DER, tablas, normalización |
| [README_GRAFICOS.md](./README_GRAFICOS.md) | Gráficos Recharts, filtros interactivos |
| [backend/tests/README.md](./backend/tests/README.md) | Suite de tests (pytest) |

---

## Licencia

Este proyecto está bajo la licencia [MIT](./LICENSE).

---

*Desarrollado para facilitar el día a día de cuidadores y proveer control total a los administradores.*
