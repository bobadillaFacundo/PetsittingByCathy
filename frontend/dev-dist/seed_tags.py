import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine
from src.database.session import SQLALCHEMY_DATABASE_URL, SessionLocal
from src.models.models import TagSet

# Crear la tabla si no existe
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TagSet.__table__.create(bind=engine, checkfirst=True)

db = SessionLocal()

tag_sets = [
    {
        "name": "Comida",
        "variants": "comida, comió, morfó, tragó, se alimentó, alimento"
    },
    {
        "name": "Enfermedad",
        "variants": "enfermedad, enfermo, diagnóstico, peste, infección, dolor, alergia, vómito, vomitó"
    },
    {
        "name": "Pis",
        "variants": "pis, orina, meó, meo, hizo del uno"
    },
    {
        "name": "Caca",
        "variants": "caca, heces, popó, defecó, cagó, hizo del dos, garcó"
    },
    {
        "name": "Agua",
        "variants": "agua, tomó, bebió, hidratación, aguita"
    }
]

for tag_data in tag_sets:
    record = db.query(TagSet).filter_by(name=tag_data["name"]).first()
    if not record:
        db.add(TagSet(**tag_data))
    else:
        record.variants = tag_data["variants"]

db.commit()
db.close()
print("Etiquetas base (TagSets) creadas/actualizadas con éxito.")
