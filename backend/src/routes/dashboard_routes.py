from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from pydantic import BaseModel
from typing import List

from src.database.session import get_db
from src.models.models import Animal, Report, ReportEvent, EventType
from src.dtos.animal_dto import AnimalResponse

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

class AlertDTO(BaseModel):
    animal_id: int
    animal_name: str
    message: str
    severity: str # "high", "medium"

class DashboardResponse(BaseModel):
    normal_animals: List[AnimalResponse]
    observation_animals: List[AnimalResponse]
    alerts: List[AlertDTO]

@router.get("/", response_model=DashboardResponse)
def get_dashboard(db: Session = Depends(get_db)):
    # 1. Animales
    animals = db.query(Animal).all()
    normal_animals = [a for a in animals if a.is_active]
    observation_animals = [a for a in animals if not a.is_active]

    # 2. Alertas Automáticas (Lógica simplificada para el prototipo)
    alerts = []
    
    # Regla 1: 48 horas sin comer
    eat_event = db.query(EventType).filter(EventType.name == "Comió").first()
    
    if eat_event:
        for animal in animals:
            # Buscar el último reporte de comida
            last_report = (
                db.query(Report)
                .join(ReportEvent)
                .filter(Report.animal_id == animal.id)
                .filter(ReportEvent.event_type_id == eat_event.id)
                .order_by(Report.created_at.desc())
                .first()
            )
            
            if last_report:
                # Verificar si pasaron más de 48hs
                if datetime.utcnow() - last_report.created_at > timedelta(hours=48):
                    alerts.append(AlertDTO(
                        animal_id=animal.id,
                        animal_name=animal.name,
                        message=f"Lleva más de 48 horas sin reporte de comida.",
                        severity="high"
                    ))
                else:
                    # Verificar si el último reporte explícitamente dice que NO comió
                    last_event = db.query(ReportEvent).filter(ReportEvent.report_id == last_report.id, ReportEvent.event_type_id == eat_event.id).first()
                    if last_event and last_event.value and last_event.value.lower() == "no":
                        alerts.append(AlertDTO(
                            animal_id=animal.id,
                            animal_name=animal.name,
                            message=f"El último reporte indica que no comió.",
                            severity="medium"
                        ))

    return DashboardResponse(
        normal_animals=normal_animals,
        observation_animals=observation_animals,
        alerts=alerts
    )

@router.get("/dictionary")
def get_dictionary(db: Session = Depends(get_db)):
    from src.models.models import TagSet
    tags = db.query(TagSet).all()
    result = []
    for tag in tags:
        variants_list = [v.strip() for v in tag.variants.split(",") if v.strip()]
        result.append({
            "id": tag.id,
            "name": tag.name,
            "variants": variants_list
        })
    return result
