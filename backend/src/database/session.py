import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from dotenv import load_dotenv
from src.database.db_urls import ddl_url_candidates, redact_db_url

load_dotenv()

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

if not SQLALCHEMY_DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL no está definida. "
        "Copiá backend/.env.example a backend/.env y completá los valores."
    )

# Supabase con pgBouncer (Transaction mode, puerto 6543) requiere:
#   - pool_pre_ping=True        → detecta conexiones muertas
#   - prepared_statement=False  → pgBouncer no soporta prepared statements
_is_supabase = "supabase" in SQLALCHEMY_DATABASE_URL or "pooler.supabase" in SQLALCHEMY_DATABASE_URL

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"options": "-c statement_timeout=30000"} if not _is_supabase else {},
    execution_options={"prepared": False} if _is_supabase else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def _ddl_candidates() -> list[str]:
    return ddl_url_candidates(SQLALCHEMY_DATABASE_URL, os.getenv("DIRECT_DATABASE_URL"))


def _make_ddl_engine(url: str):
    is_pooler = "pooler" in url or ":6543" in url
    return create_engine(
        url,
        isolation_level="AUTOCOMMIT",
        pool_pre_ping=True,
        connect_args={"options": "-c statement_timeout=120000"} if not is_pooler else {},
        execution_options={"prepared": False} if is_pooler else {},
    )


def _ddl_database_url() -> str:
    """Primera candidata (compatibilidad). Preferí get_ddl_engine()."""
    return _ddl_candidates()[0]


def get_ddl_engine():
    last_error = None
    for url in _ddl_candidates():
        engine_candidate = _make_ddl_engine(url)
        try:
            with engine_candidate.connect() as conn:
                conn.execute(text("SELECT 1"))
            print(f"[DDL] conexión OK {redact_db_url(url)}")
            return engine_candidate
        except Exception as exc:
            last_error = exc
            print(f"[DDL] no autenticó {redact_db_url(url)}: {exc}")
            engine_candidate.dispose()
    raise RuntimeError(
        "No se pudo abrir una conexión DDL a la base. "
        "Revisá DATABASE_URL / DIRECT_DATABASE_URL en Render."
    ) from last_error

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
