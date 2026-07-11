from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from src.database.session import get_db
from src.models.models import Deworming, Animal, VeterinaryProduct, Vaccine, HealthRecord, VaccineCatalog
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
    
    # Dewormings
    dewormings = db.query(Deworming).join(Animal).join(VeterinaryProduct).filter(
        Deworming.next_due_date.isnot(None),
        Animal.is_active == True
    ).all()
    
    for d in dewormings:
        alert_type = f"Desparasitación {d.product.type}" if d.product.type else "Desparasitación"
        alerts.append({
            "id": f"alert-deworming-{d.id}",
            "animal_name": d.animal.name,
            "alert_type": alert_type,
            "product_name": d.product.name,
            "due_date": d.next_due_date
        })
        
    # Vaccines
    vaccines = db.query(Vaccine).join(HealthRecord).join(Animal, HealthRecord.animal_id == Animal.id).join(VaccineCatalog).filter(
        Vaccine.next_due_date.isnot(None),
        Animal.is_active == True
    ).all()
    
    for v in vaccines:
        alerts.append({
            "id": f"alert-vaccine-{v.id}",
            "animal_name": v.health_record.animal.name,
            "alert_type": "Vacunación",
            "product_name": v.vaccine_catalog.name,
            "due_date": v.next_due_date
        })
        
    return alerts
