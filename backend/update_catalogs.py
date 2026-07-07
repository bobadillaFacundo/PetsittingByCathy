import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "veterinary_assistant.db")

def migrate_and_seed():
    print("Migrando y poblando catálogos...")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    # Enable foreign keys
    c.execute("PRAGMA foreign_keys = ON;")
    
    # Drop existing weak entity tables to recreate them with new schema
    c.execute("DROP TABLE IF EXISTS lab_results")
    c.execute("DROP TABLE IF EXISTS internal_dewormings")
    c.execute("DROP TABLE IF EXISTS external_dewormings")
    c.execute("DROP TABLE IF EXISTS laboratory_catalog")
    c.execute("DROP TABLE IF EXISTS veterinary_products")
    
    conn.commit()
    conn.close()

    # Recreate tables using SQLAlchemy
    from src.database.session import engine, Base
    from src.models import models
    Base.metadata.create_all(bind=engine)
    
    print("Tablas creadas. Poblando con ejemplos...")
    from src.database.session import SessionLocal
    db = SessionLocal()
    
    # Seed Laboratories
    labs = ["Hemograma Completo", "Análisis de Orina", "Perfil Bioquímico", "Ecografía", "Radiografía"]
    for lab in labs:
        db.add(models.LaboratoryCatalog(name=lab))
        
    # Seed Veterinary Products
    internal_products = ["Drontal", "Total Full", "Basken", "Endogard"]
    for p in internal_products:
        db.add(models.VeterinaryProduct(name=p, type="INTERNAL"))
        
    external_products = ["NexGard", "Bravecto", "Simparica", "Pipeta Frontline", "Collar Seresto"]
    for p in external_products:
        db.add(models.VeterinaryProduct(name=p, type="EXTERNAL"))
        
    db.commit()
    db.close()
    
    print("¡Migración y población completada con éxito!")

if __name__ == "__main__":
    migrate_and_seed()
