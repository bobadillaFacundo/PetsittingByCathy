from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from src.database.session import get_db
from src.models.models import Deworming, Animal, VeterinaryProduct, Vaccine, HealthRecord, VaccineCatalog, AnimalMedication, MedicationCatalog
from src.auth import get_current_user
from typing import List
from pydantic import BaseModel
from datetime import date

router = APIRouter(prefix="/calendar", tags=["Calendar"])

class CalendarAlertResponse(BaseModel):
    id: str
    animal_name: str
    alert_type: str
    product_name: str
    due_date: date

    class Config:
        from_attributes = True

@router.get("/alerts", response_model=List[CalendarAlertResponse])
def get_calendar_alerts(db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    alerts = []
    
    # Dewormings — solo la última por animal+producto (evita duplicados)
    latest_deworming_ids = (
        db.query(func.max(Deworming.id))
        .join(Animal)
        .filter(
            Deworming.next_due_date.isnot(None),
            Animal.is_active == True
        )
        .group_by(Deworming.animal_id, Deworming.product_id)
    ).all()
    latest_ids = [row[0] for row in latest_deworming_ids]
    
    if latest_ids:
        dewormings = db.query(Deworming).filter(Deworming.id.in_(latest_ids)).all()
        for d in dewormings:
            tipo = d.product.type if d.product and d.product.type else ""
            if tipo == "INTERNAL":
                alert_type = "Desparasitación Interna"
            elif tipo == "EXTERNAL":
                alert_type = "Desparasitación Externa"
            else:
                alert_type = f"Desparasitación {tipo}" if tipo else "Desparasitación"
            alerts.append({
                "id": f"alert-deworming-{d.id}",
                "animal_name": d.animal.name,
                "alert_type": alert_type,
                "product_name": d.product.name,
                "due_date": d.next_due_date
            })
        
    # Vaccines — solo la última por animal+vacuna (evita duplicados)
    latest_vaccine_ids = (
        db.query(func.max(Vaccine.id))
        .join(HealthRecord)
        .join(Animal, HealthRecord.animal_id == Animal.id)
        .filter(
            Vaccine.next_due_date.isnot(None),
            Animal.is_active == True
        )
        .group_by(HealthRecord.animal_id, Vaccine.vaccine_id)
    ).all()
    latest_vax_ids = [row[0] for row in latest_vaccine_ids]
    
    if latest_vax_ids:
        vaccines = db.query(Vaccine).filter(Vaccine.id.in_(latest_vax_ids)).all()
        for v in vaccines:
            alerts.append({
                "id": f"alert-vaccine-{v.id}",
                "animal_name": v.health_record.animal.name,
                "alert_type": "Vacunación",
                "product_name": v.vaccine_catalog.name,
                "due_date": v.next_due_date
            })

    # Medicaciones activas — mostrar como alertas en el calendario
    active_meds = db.query(AnimalMedication).join(Animal).join(MedicationCatalog).filter(
        AnimalMedication.is_current == True,
        Animal.is_active == True
    ).all()
    
    for m in active_meds:
        alerts.append({
            "id": f"alert-med-{m.id}",
            "animal_name": m.animal.name,
            "alert_type": "Medicación activa",
            "product_name": f"{m.medication.name} ({m.dosage}, {m.frequency})",
            "due_date": date.today()
        })
        
    return alerts
