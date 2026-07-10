import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.database.session import SessionLocal
from src.models.models import TagSet
from src.services.tag_helpers import set_tag_variants, parse_csv_values, get_tag_variants

db = SessionLocal()

nuevos_conjuntos = {
    "Comida": "comió, morfó, comio, desayuno, ceno, trago, se alimento, alimento, comida, balanceado",
    "Agua": "tomó, bebio, tomo, bebio, se hidrato, agua, sed",
    "Caca": "cagó, cago, defeco, hizo caca, popo, garco",
    "Medicacion": "tomo pastilla, medicacion, remedio, pastilla, inyeccion, gotitas, tratamiento, dosis",
    "Pis": "meo, hizo pis, orino, pichi"
}

print("Iniciando creación/actualización de conjuntos (TagSets)...")

for name, variants_csv in nuevos_conjuntos.items():
    tag_set = db.query(TagSet).filter_by(name=name).first()
    nuevas = parse_csv_values(variants_csv)
    if tag_set:
        print(f"El conjunto '{name}' ya existe. Actualizando variantes base...")
        existentes = get_tag_variants(tag_set)
        set_tag_variants(db, tag_set, list(set(existentes + nuevas)))
    else:
        print(f"Creando conjunto '{name}'...")
        tag_set = TagSet(name=name)
        db.add(tag_set)
        db.flush()
        set_tag_variants(db, tag_set, nuevas)

db.commit()
db.close()
print("¡Conjuntos creados exitosamente en la base de datos!")
