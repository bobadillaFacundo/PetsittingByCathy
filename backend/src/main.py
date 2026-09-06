from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError, ResponseValidationError
from contextlib import asynccontextmanager
import os
import traceback
from src.timezone_ar import force_process_timezone
from src.routes import animal_routes, report_routes, chat_routes, dashboard_routes, auth_routes, catalog_routes, user_routes, reservation_routes, calendar_routes

force_process_timezone()


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from src.database.migrate_normalize import migrate
        migrate()
    except Exception as e:
        traceback.print_exc()
        print(f"ERROR al migrar BD al iniciar: {e}")
    yield


app = FastAPI(
    title="Asistente Veterinario API",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False,
)


def _cors_headers(request: Request) -> dict:
    origin = request.headers.get("origin")
    if not origin:
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
    }


@app.exception_handler(RequestValidationError)
async def request_validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
        headers=_cors_headers(request),
    )


@app.exception_handler(ResponseValidationError)
async def response_validation_handler(request: Request, exc: ResponseValidationError):
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": f"Error al serializar: {exc.errors()[:3]}"},
        headers=_cors_headers(request),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    from fastapi import HTTPException as FastAPIHTTPException
    from starlette.exceptions import HTTPException as StarletteHTTPException

    headers = _cors_headers(request)
    if isinstance(exc, (FastAPIHTTPException, StarletteHTTPException)):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=headers,
        )
    traceback.print_exc()
    detail = "Error interno del servidor"
    # Errores de SQL / schema: devolver pista corta para diagnosticar en prod
    name = type(exc).__name__
    if name in ("ProgrammingError", "OperationalError", "ResponseValidationError"):
        msg = str(getattr(exc, "orig", None) or exc)
        detail = f"{name}: {msg[:240]}"
    return JSONResponse(
        status_code=500,
        content={"detail": detail},
        headers=headers,
    )

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(animal_routes.router)
app.include_router(report_routes.router)
app.include_router(chat_routes.router)
app.include_router(dashboard_routes.router)
app.include_router(auth_routes.router)
app.include_router(catalog_routes.router)
app.include_router(user_routes.router)
app.include_router(reservation_routes.router)
app.include_router(calendar_routes.router)

uploads_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

@app.get("/")
def read_root():
    return {"message": "Bienvenido a la API del Asistente Veterinario"}


@app.get("/health/ollama")
def health_ollama():
    from src.services.vision_service import probe_ollama

    return probe_ollama()


@app.get("/health/schema")
def health_schema():
    from sqlalchemy import inspect
    from src.database.session import engine

    inspector = inspect(engine)
    if "reservations" not in inspector.get_table_names():
        return {"reservations": "missing"}
    cols = {c["name"]: c for c in inspector.get_columns("reservations")}
    animal_cols = set()
    missing_animals = []
    if "animals" in inspector.get_table_names():
        animal_cols = {c["name"] for c in inspector.get_columns("animals")}
        from src.models.models import Animal
        missing_animals = sorted(
            name for name in Animal.__table__.columns.keys() if name not in animal_cols
        )
    care_table = "animal_care_profiles" in inspector.get_table_names()
    care_missing = []
    if care_table:
        care_cols = {c["name"] for c in inspector.get_columns("animal_care_profiles")}
        from src.models.models import AnimalCareProfile
        care_missing = sorted(
            name for name in AnimalCareProfile.__table__.columns.keys() if name not in care_cols
        )
    return {
        "reservations_species_id": "species_id" in cols,
        "reservations_animal_id_nullable": cols.get("animal_id", {}).get("nullable", False),
        "animals_missing_columns": missing_animals,
        "animal_care_profiles": care_table,
        "care_missing_columns": care_missing,
        "api_version": "care-intake-v5",
    }
