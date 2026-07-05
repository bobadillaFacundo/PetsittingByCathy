import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.database.session import SessionLocal
from src.models.models import Report, ReportEvent, ReportMedication, AnimalDiagnosis, AnimalMedication, AnimalObservation, Animal

db = SessionLocal()

try:
    # 1. Delete deeply nested report children
    db.query(ReportEvent).delete()
    db.query(ReportMedication).delete()
    
    # 2. Delete reports
    db.query(Report).delete()

    # 3. Delete animal children
    db.query(AnimalDiagnosis).delete()
    db.query(AnimalMedication).delete()
    db.query(AnimalObservation).delete()

    # 4. Delete all animals
    db.query(Animal).delete()

    db.commit()
    print("Todas las mascotas y sus respectivos reportes clínicos han sido eliminados de la base de datos exitosamente.")
except Exception as e:
    db.rollback()
    print(f"Error al eliminar mascotas: {e}")
finally:
    db.close()
