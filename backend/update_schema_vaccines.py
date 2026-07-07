import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "veterinary_assistant.db")

def migrate():
    print("Creando tablas nuevas (HealthRecord, Vaccine)...")
    from src.database.session import engine, Base
    from src.models import models
    Base.metadata.create_all(bind=engine)
    print("¡Migración de libreta y vacunas completada!")

if __name__ == "__main__":
    migrate()
