# Tests — Petsitting by Cathy

Suite de pruebas automatizadas del **backend** (FastAPI + SQLAlchemy).

## Requisitos

```powershell
cd backend
python -m pip install -r requirements.txt
```

## Ejecutar todos los tests

```powershell
cd backend
python -m pytest
```

## Con cobertura

```powershell
python -m pytest --cov=src --cov-report=term-missing
```

## Estructura

| Archivo | Qué prueba |
|---------|------------|
| `conftest.py` | SQLite en memoria, seed, auth headers |
| `test_tag_helpers.py` | Variantes, keywords, sinónimos (1FN) |
| `test_report_helpers.py` | Severidad, alertas críticas |
| `test_auth.py` | Login, JWT, /auth/me |
| `test_reports_api.py` | confirm, edit, fotos, listado |
| `test_animals_api.py` | animales, historial, vacunas, desparasitaciones |
| `test_dashboard_api.py` | tablero, alertas críticas, diccionario |
| `test_catalogs_api.py` | color rules, tagsets, constraints UNIQUE |
| `test_app.py` | endpoint raíz |

## Notas

- Los tests usan **SQLite en memoria** (no requieren PostgreSQL).
- NLP/Whisper se **mockean** donde haría falta red o GPU.
- Marcadores: `@pytest.mark.unit`, `@pytest.mark.api`
