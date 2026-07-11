import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from dotenv import load_dotenv

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

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
