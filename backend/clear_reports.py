import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.database.session import SessionLocal
from src.models.models import Report, ReportEvent, ReportMedication, AnimalDiagnosis, AnimalMedication, AnimalObservation

db = SessionLocal()

try:
    # Delete child records first
    db.query(ReportEvent).delete()
    db.query(ReportMedication).delete()
    db.query(AnimalDiagnosis).delete()
    db.query(AnimalMedication).delete()
    db.query(AnimalObservation).delete()

    # Delete parent reports
    db.query(Report).delete()

    db.commit()
    print("Reportes y datos extraídos eliminados exitosamente. Los animales y usuarios se mantuvieron.")
except Exception as e:
    db.rollback()
    print(f"Error: {e}")
finally:
    db.close()
