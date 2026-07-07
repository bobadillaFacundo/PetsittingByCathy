import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.database.session import SessionLocal
from src.models.models import Breed, Species

db = SessionLocal()

breeds_data = {
    "Perro": [
        "Labrador Retriever", "Golden Retriever", "Caniche", "Border Collie",
        "Bulldog Francés", "Beagle", "Dachshund (Salchicha)", "Pastor Alemán",
        "Boxer", "Schnauzer Miniatura"
    ],
    "Gato": [
        "Gato doméstico de pelo corto", "Siamés", "Persa", "Maine Coon",
        "British Shorthair", "Russian Blue", "Bengal", "Ragdoll"
    ],
    "Tortuga": [
        "Tortuga de orejas rojas", "Tortuga de orejas amarillas",
        "Tortuga rusa", "Tortuga leopardo"
    ],
    "Erizo": [
        "Erizo pigmeo africano"
    ],
    "Loro": [
        "Cacatúa ninfa (Ninfa)", "Periquito australiano", "Agapornis",
        "Cotorra monje", "Loro amazona"
    ],
    "Conejo": [
        "Conejo Enano Holandés", "Holland Lop", "Mini Rex",
        "Lionhead", "Conejo Californiano"
    ]
}

print("Iniciando carga de razas...")

for species_name, breed_names in breeds_data.items():
    species = db.query(Species).filter(Species.name == species_name).first()
    if not species:
        print(f"Especie no encontrada: {species_name}. Ignorando.")
        continue
    
    for b_name in breed_names:
        exists = db.query(Breed).filter(Breed.name == b_name, Breed.species_id == species.id).first()
        if not exists:
            db.add(Breed(name=b_name, species_id=species.id))
            print(f"Agregada raza {b_name} para {species_name}")

db.commit()
db.close()
print("¡Razas cargadas exitosamente!")
