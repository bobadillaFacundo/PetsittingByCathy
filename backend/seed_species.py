import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine
from src.database.session import SQLALCHEMY_DATABASE_URL, SessionLocal
from src.models.models import Species

# Crear la tabla si no existe
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
Species.__table__.create(bind=engine, checkfirst=True)

db = SessionLocal()

species_list = ["Perro", "Gato", "Conejo", "Loro", "Tortuga", "Erizo"]

for sp in species_list:
    record = db.query(Species).filter_by(name=sp).first()
    if not record:
        db.add(Species(name=sp))

db.commit()
db.close()
print("Especies sembradas con éxito.")
