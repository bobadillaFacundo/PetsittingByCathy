import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine
from src.database.session import SQLALCHEMY_DATABASE_URL, SessionLocal
from src.models.models import TagSet

db = SessionLocal()

nuevos_conjuntos = {
    "Comida": "comió, morfó, comio, desayuno, ceno, trago, se alimento, alimento, comida, balanceado",
    "Agua": "tomó, bebio, tomo, bebio, se hidrato, agua, sed",
    "Caca": "cagó, cago, defeco, hizo caca, popo, garco",
    "Medicacion": "tomo pastilla, medicacion, remedio, pastilla, inyeccion, gotitas, tratamiento, dosis",
    "Pis": "meo, hizo pis, orino, pichi"
}

print("Iniciando creación/actualización de conjuntos (TagSets)...")

for name, variants in nuevos_conjuntos.items():
    tag_set = db.query(TagSet).filter_by(name=name).first()
    if tag_set:
        print(f"El conjunto '{name}' ya existe. Actualizando variantes base...")
        # Unimos las variantes viejas con las nuevas para no perder lo que la IA ya aprendió
        variantes_existentes = set([v.strip() for v in tag_set.variants.split(',')])
        variantes_nuevas = set([v.strip() for v in variants.split(',')])
        variantes_combinadas = variantes_existentes.union(variantes_nuevas)
        tag_set.variants = ", ".join(list(variantes_combinadas))
    else:
        print(f"Creando conjunto '{name}'...")
        nuevo = TagSet(name=name, variants=variants)
        db.add(nuevo)

db.commit()
db.close()
print("¡Conjuntos creados exitosamente en la base de datos!")
