import sys
import os

# Ajustar el path para que encuentre "src"
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from src.database.session import SQLALCHEMY_DATABASE_URL, engine, SessionLocal, Base
from src.models.models import User, Species, Veterinarian, Animal, DataDictionary, TagSet
from src.auth import get_password_hash

# Crear el engine
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})

# Crear SOLO la tabla de DataDictionary (las demás ya existen)
DataDictionary.__table__.create(bind=engine, checkfirst=True)

# Llenar con datos por defecto
db = SessionLocal()

# Seed Users (Roles)
if not db.query(User).first():
    db.add(User(name="admin", password_hash=get_password_hash("admin123"), role="admin"))
    db.add(User(name="user", password_hash=get_password_hash("user123"), role="user"))
    db.commit()

# Datos a cargar o actualizar
dictionary_data = [
    {
        "table_name": "ReportEvent",
        "entity_name": "Eventos Rutinarios",
        "synonyms": "comió, morfó, tragó, tomó agua, tomó, hizo pis, meó, hizo del uno, hizo caca, cagó, hizo del dos, garcó, vomitó, largó todo, potó, conducta, se portó de 10, se portó joya",
        "fields_config": '[{"name": "event_type_name", "type": "string"}, {"name": "value", "type": "string"}]'
    },
    {
        "table_name": "AnimalDiagnosis",
        "entity_name": "Diagnóstico Médico",
        "synonyms": "diagnóstico, enfermedad, peste, apestado, infección, inflamación, hinchado, dolor, le duele, alergia, irritación, jodido de",
        "fields_config": '[{"name": "diagnosis_name", "type": "string"}]'
    },
    {
        "table_name": "AnimalMedication",
        "entity_name": "Medicación",
        "synonyms": "pastilla, pasti, jarabe, inyección, pichicata, crema, antibiótico, medicamento, remedio, gotitas",
        "fields_config": '[{"name": "medication_name", "type": "string"}, {"name": "dosage", "type": "string"}]'
    },
    {
        "table_name": "AnimalObservation",
        "entity_name": "Observación General",
        "synonyms": "noté que, me rescaté que, me fijé que, parece que, observación, cuidado, alerta, guarda con, ojito con, ojo al piojo, chequeá",
        "fields_config": '[{"name": "observation", "type": "string"}]'
    }
]

for data in dictionary_data:
    record = db.query(DataDictionary).filter_by(table_name=data["table_name"]).first()
    if record:
        record.synonyms = data["synonyms"]
    else:
        db.add(DataDictionary(**data))

db.commit()
db.close()

print("Diccionario actualizado con modismos argentinos exitosamente.")

