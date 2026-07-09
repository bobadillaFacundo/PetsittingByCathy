import sys, os
sys.path.append(os.path.abspath('.'))
from src.database.session import engine
from sqlalchemy import text
with engine.begin() as conn:
    conn.execute(text("ALTER TABLE animals ADD COLUMN IF NOT EXISTS severity VARCHAR DEFAULT 'normal'"))
