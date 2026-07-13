import sys, os
sys.path.append(os.path.abspath('.'))
from src.database.session import engine
from sqlalchemy import text
with engine.begin() as conn:
    conn.execute(text('''
        CREATE TABLE IF NOT EXISTS animal_medication_schedules (
            id SERIAL PRIMARY KEY,
            animal_medication_id INTEGER NOT NULL REFERENCES animal_medications(id) ON DELETE CASCADE,
            scheduled_time TIME NOT NULL
        )
    '''))
print("Migration completed successfully!")
