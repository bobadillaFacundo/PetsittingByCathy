import sys, os
sys.path.append(os.path.abspath('.'))
from src.database.session import engine
from sqlalchemy import text

with engine.begin() as conn:
    conn.execute(text("ALTER TABLE critical_alerts ADD COLUMN severity TEXT DEFAULT 'red'"))
print("Done")
