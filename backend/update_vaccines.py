import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "veterinary_assistant.db")

def update_vaccines():
    print("Migrando y poblando catálogo de vacunas...")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    c.execute("PRAGMA foreign_keys = ON;")
    
    # Drop vaccines to recreate with vaccine_id
    c.execute("DROP TABLE IF EXISTS vaccines")
    c.execute("DROP TABLE IF EXISTS vaccine_catalog")
    
    conn.commit()
    conn.close()

    from src.database.session import engine, Base
    from src.models import models
    Base.metadata.create_all(bind=engine)
    
    from src.database.session import SessionLocal
    db = SessionLocal()
    
    vaccines = ["Séxtuple", "Quíntuple", "Antirrábica", "Tos de las Perreras", "Leptospirosis", "Triple Felina", "Leucemia Felina"]
    for v in vaccines:
        db.add(models.VaccineCatalog(name=v))
        
    db.commit()
    db.close()
    print("Vacunas actualizadas con éxito!")

if __name__ == "__main__":
    update_vaccines()
