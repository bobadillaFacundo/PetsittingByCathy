import sys, os
sys.path.append(os.path.abspath('.'))
from src.database.session import engine
from sqlalchemy import text

with engine.connect() as conn:
    res = conn.execute(text('SELECT id, created_at, animal_id FROM reports ORDER BY created_at DESC LIMIT 5'))
    for row in res:
        print(row)
