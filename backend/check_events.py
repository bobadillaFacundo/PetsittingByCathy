import sys, os
sys.path.append(os.path.abspath('.'))
from src.database.session import engine
from sqlalchemy import text

with engine.connect() as conn:
    res = conn.execute(text("SELECT name FROM event_types"))
    print([r[0] for r in res])
