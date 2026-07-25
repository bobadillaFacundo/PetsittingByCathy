# Backend — Petsitting by Cathy

API REST en **FastAPI** para la guardería canina.

## Inicio rápido

```bash
cd backend
cp .env.example .env
pip install -r requirements.txt
python -m src.database.init_db
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

- Swagger: http://localhost:8000/docs
- Health: http://localhost:8000/health/schema

## Documentación completa

| Guía | Contenido |
|------|-----------|
| [docs/BACKEND.md](../docs/BACKEND.md) | Estructura, servicios, scripts |
| [docs/API.md](../docs/API.md) | Referencia de endpoints |
| [docs/DESPLIEGUE.md](../docs/DESPLIEGUE.md) | Render, Supabase, variables |
| [docs/VACUNAS_ESCANEO.md](../docs/VACUNAS_ESCANEO.md) | Groq Vision, libretas |
| [README_NLP.md](../README_NLP.md) | Pipeline de voz |
| [README_BDD.md](../README_BDD.md) | Esquema PostgreSQL |
| [tests/README.md](./tests/README.md) | pytest |

## Tests

```bash
python -m pytest
```
