# Backend — FastAPI

Código en `backend/`. API REST para la guardería canina.

## Stack

| Tecnología | Uso |
|------------|-----|
| FastAPI | Framework HTTP |
| Uvicorn | ASGI server |
| SQLAlchemy | ORM |
| Pydantic | Validación |
| PyJWT + bcrypt | Autenticación |
| psycopg2-binary | PostgreSQL |
| Supabase SDK | Storage |
| faster-whisper | STT local (dev) |
| Pillow, pymupdf, pypdf | Imágenes y PDF |
| qdrant-client | Vectores (opcional) |

## Estructura

```
backend/
├── src/
│   ├── main.py                 # App FastAPI, CORS, lifespan, migración
│   ├── auth.py                 # JWT, get_current_user
│   ├── timezone_ar.py          # TZ Argentina
│   ├── models/models.py        # ORM
│   ├── dtos/                   # Pydantic schemas
│   ├── routes/
│   │   ├── auth_routes.py
│   │   ├── user_routes.py
│   │   ├── animal_routes.py    # Animales, clínica, vacunas scan
│   │   ├── report_routes.py
│   │   ├── dashboard_routes.py
│   │   ├── catalog_routes.py
│   │   ├── reservation_routes.py
│   │   └── calendar_routes.py
│   ├── services/
│   │   ├── audio_service.py
│   │   ├── vision_service.py
│   │   ├── storage_service.py
│   │   ├── report_helpers.py
│   │   ├── tag_helpers.py
│   │   ├── weight_helpers.py
│   │   └── media_helpers.py
│   └── database/
│       ├── session.py
│       ├── init_db.py
│       ├── seed_db.py
│       └── migrate_normalize.py
├── tests/                      # pytest
├── requirements.txt
├── render.yaml
├── .env.example
└── uploads/                    # Archivos locales (gitignored)
```

## Arranque

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
python -m src.database.init_db
python -m src.database.migrate_normalize
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

Al iniciar, `lifespan` ejecuta migraciones automáticas (`migrate_normalize.migrate()`).

## Servicios de IA

| Servicio | STT | NLP reportes | Visión vacunas |
|----------|-----|--------------|----------------|
| **Producción** | Groq Whisper | Groq (`USE_GROQ=1`) | Groq `qwen/qwen3.6-27b` |
| **Dev** | Groq o Whisper local | Groq o vLLM | Groq → Ollama → OCR |

Configuración: `backend/.env.example` y [README_NLP.md](../README_NLP.md).

## Storage

`storage_service.py` sube a Supabase Storage cuando hay credenciales; si no, guarda en `uploads/`.

## Scripts de utilidad (raíz backend)

| Script | Uso |
|--------|-----|
| `seed_species.py` / `seed_breeds.py` | Datos iniciales |
| `seed_fake_data.py` | Demo |
| `migrate_to_supabase.py` | Migración legacy |
| `clear_reports.py` / `clear_animals.py` | Limpieza dev |

## Tests

```bash
cd backend
python -m pytest
python -m pytest --cov=src --cov-report=term-missing
```

SQLite en memoria; IA mockeada. Ver [tests/README.md](./tests/README.md).

## Dependencias de seguridad (mínimos)

```
starlette>=1.3.1
python-multipart>=0.0.27
PyJWT>=2.13.0
Pillow>=12.3.0
pypdf>=6.14.2
urllib3>=2.6.0
requests>=2.32.4
```

## Documentación relacionada

- [API.md](../docs/API.md)
- [DESPLIEGUE.md](../docs/DESPLIEGUE.md)
- [VACUNAS_ESCANEO.md](../docs/VACUNAS_ESCANEO.md)
- [README_BDD.md](../README_BDD.md)
