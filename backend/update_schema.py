import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "veterinary_assistant.db")

def migrate():
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    try:
        print("Agregando breed_id a animals...")
        cur.execute("ALTER TABLE animals ADD COLUMN breed_id INTEGER REFERENCES breeds(id)")
    except sqlite3.OperationalError as e:
        print(f"Ignorado (probablemente ya existe): {e}")

    try:
        print("Agregando is_castrated a animals...")
        cur.execute("ALTER TABLE animals ADD COLUMN is_castrated BOOLEAN DEFAULT 0")
    except sqlite3.OperationalError as e:
        print(f"Ignorado (probablemente ya existe): {e}")

    conn.commit()
    conn.close()
    
    print("Creando tablas nuevas (Breeds, Labs, Dewormings)...")
    from src.database.session import engine, Base
    from src.models import models
    Base.metadata.create_all(bind=engine)
    print("¡Migración completada!")

if __name__ == "__main__":
    migrate()
