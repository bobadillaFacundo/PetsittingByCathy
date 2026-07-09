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
    # 1. Animales Activos solamente (is_active=True)
    animals = db.query(Animal).filter(Animal.is_active == True).all()
    
    # 2. Agrupar por severidad dinámica
    normal_animals = [a for a in animals if getattr(a, 'severity', 'normal') == 'normal']
    observation_animals = [a for a in animals if getattr(a, 'severity', 'normal') in ['observation', 'critical']]

    # 3. Alertas: Se devuelven vacías porque ahora las alertas vienen del endpoint /weather
    # Se dejan vacías para retrocompatibilidad rápida si aún no se generó el clima
    return DashboardResponse(
        normal_animals=normal_animals,
        observation_animals=observation_animals,
        alerts=[]
    )

@router.get("/weather")
def get_weather_report(db: Session = Depends(get_db)):
    from src.services.audio_service import NLPService
    
    # Obtener reportes de las últimas 48hs
    yesterday = datetime.utcnow() - timedelta(hours=48)
    recent_reports = db.query(Report).filter(Report.created_at >= yesterday).all()
    
    if not recent_reports:
        return {
            "weather": "No hay reportes en las últimas 48 horas. El clima está despejado.",
            "alerts": []
        }
        
    reports_data = []
    for r in recent_reports:
        animal = db.query(Animal).filter(Animal.id == r.animal_id).first()
        reports_data.append({
            "animal": animal.name if animal else "Desconocido",
            "transcript": r.audio_transcript,
            "date": r.created_at.strftime("%Y-%m-%d %H:%M")
        })
        
    result = NLPService.generate_global_weather_report(reports_data)
    
    # Enriquecer las alertas con el animal_id y actualizar estados
    for alert in result.get("alerts", []):
        animal_name = alert.get("animal_name")
        if animal_name:
            animal = db.query(Animal).filter(Animal.name.ilike(f"%{animal_name}%")).first()
            if animal:
                alert["animal_id"] = animal.id
                
                # Actualizar la severidad en la base de datos
                alert_sev = alert.get("severity", "").lower()
                if alert_sev in ["high", "critical", "alto"]:
                    animal.severity = "critical"
                elif alert_sev in ["medium", "observation", "medio"]:
                    animal.severity = "observation"
    
    db.commit()
                
    return result

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
