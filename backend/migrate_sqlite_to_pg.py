import sys
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

# Ajustar el path para que encuentre "src"
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.models.models import (
    Base, User, Species, Veterinarian, Breed, TagSet, DataDictionary,
    VeterinaryProduct, LaboratoryCatalog, VaccineCatalog, DiagnosisCatalog,
    MedicationCatalog, EventType, Animal, LabResult, InternalDeworming,
    ExternalDeworming, HealthRecord, Vaccine, AnimalDiagnosis,
    AnimalMedication, AnimalObservation, Report, ReportEvent,
    ReportMedication, Attachment
)

# SQLite URL original
SQLITE_URL = "sqlite:///./veterinary_assistant.db"
# PostgreSQL URL nuevo
PG_URL = "postgresql://admin:1234@100.82.178.56:5432/veterinary_assistant"

def migrate_data():
    print("Conectando a bases de datos...")
    sqlite_engine = create_engine(SQLITE_URL)
    pg_engine = create_engine(PG_URL)

    # Crear tablas en PG si no existen
    print("Creando esquema en PostgreSQL...")
    Base.metadata.create_all(bind=pg_engine)

    SqliteSession = sessionmaker(bind=sqlite_engine)
    PgSession = sessionmaker(bind=pg_engine)

    sqlite_db = SqliteSession()
    pg_db = PgSession()

    # ORDEN CRÍTICO para respetar las Foreign Keys
    tables_to_migrate = [
        User, Species, Veterinarian, Breed, TagSet, DataDictionary,
        VeterinaryProduct, LaboratoryCatalog, VaccineCatalog, DiagnosisCatalog,
        MedicationCatalog, EventType, Animal, LabResult, InternalDeworming,
        ExternalDeworming, HealthRecord, Vaccine, AnimalDiagnosis,
        AnimalMedication, AnimalObservation, Report, ReportEvent,
        ReportMedication, Attachment
    ]

    try:
        for model in tables_to_migrate:
            print(f"Migrando tabla: {model.__tablename__}...")
            # Extraer registros de sqlite
            records = sqlite_db.query(model).all()
            
            # Limpiar la tabla destino primero (opcional, asumiendo base limpia)
            pg_db.execute(text(f"TRUNCATE TABLE {model.__tablename__} CASCADE"))
            
            # Copiar registros. Expunging them from SQLite session allows them to be added to PG session
            for record in records:
                sqlite_db.expunge(record)
                from sqlalchemy.orm import make_transient
                make_transient(record)
                pg_db.add(record)
            
            pg_db.commit()
            print(f"   -> {len(records)} registros migrados.")

        print("¡Migración de datos completada con éxito!")

    except Exception as e:
        pg_db.rollback()
        print(f"Error durante la migración: {e}")
    finally:
        sqlite_db.close()
        pg_db.close()

if __name__ == "__main__":
    migrate_data()
