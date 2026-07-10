from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timedelta
from pydantic import BaseModel
from typing import List, Optional

from src.database.session import get_db
from src.models.models import Animal, Report, ReportEvent, EventType, CriticalAlert
from src.dtos.animal_dto import AnimalResponse
from src.services.report_helpers import resolve_critical_alert, format_critical_alert_message

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

class AlertDTO(BaseModel):
    animal_id: int
    animal_name: str
    message: str
    severity: str # "high", "medium"

class CriticalAlertDTO(BaseModel):
    id: int
    animal_id: int
    animal_name: str
    report_id: Optional[int] = None
    message: str
    keyword_detected: str
    created_at: datetime

class DashboardResponse(BaseModel):
    normal_animals: List[AnimalResponse]
    observation_animals: List[AnimalResponse]
    alerts: List[AlertDTO]
    critical_alerts: List[CriticalAlertDTO]

@router.get("/", response_model=DashboardResponse)
def get_dashboard(db: Session = Depends(get_db)):
    # 1. Animales Activos solamente (is_active=True)
    animals = db.query(Animal).filter(Animal.is_active == True).all()
    
    # 2. Agrupar por severidad dinámica
    normal_animals = [a for a in animals if getattr(a, 'severity', 'normal') == 'normal']
    observation_animals = [a for a in animals if getattr(a, 'severity', 'normal') in ['observation', 'critical']]

    # 3. Alertas de Vacunas y Desparasitaciones (próximos 15 días o vencidas)
    alerts_list = []
    from src.models.models import Vaccine, Deworming, HealthRecord, VaccineCatalog, VeterinaryProduct
    from sqlalchemy.orm import joinedload
    
    threshold_date = datetime.utcnow().date() + timedelta(days=15)
    
    # Vacunas
    expiring_vaccines = db.query(Vaccine).join(HealthRecord).filter(
        Vaccine.next_due_date <= threshold_date
    ).all()
    for v in expiring_vaccines:
        hr = db.query(HealthRecord).filter(HealthRecord.id == v.health_record_id).first()
        if hr:
            animal = db.query(Animal).filter(Animal.id == hr.animal_id, Animal.is_active == True).first()
            if animal:
                days_left = (v.next_due_date - datetime.utcnow().date()).days
                msg = f"Vacuna vence en {days_left} días" if days_left >= 0 else f"Vacuna VENCIDA hace {-days_left} días"
                alerts_list.append(AlertDTO(
                    animal_id=animal.id,
                    animal_name=animal.name,
                    message=msg,
                    severity="high" if days_left < 0 else "medium"
                ))
                
    # Desparasitaciones (tabla unificada)
    expiring_dewormings = db.query(Deworming).options(
        joinedload(Deworming.product)
    ).filter(Deworming.next_due_date <= threshold_date).all()
    for de in expiring_dewormings:
        animal = db.query(Animal).filter(Animal.id == de.animal_id, Animal.is_active == True).first()
        if animal:
            days_left = (de.next_due_date - datetime.utcnow().date()).days
            tipo = "Interna" if de.product and de.product.type == "INTERNAL" else "Externa"
            msg = f"Desparasitación {tipo} vence en {days_left} días" if days_left >= 0 else f"Desparasitación {tipo} VENCIDA hace {-days_left} días"
            alerts_list.append(AlertDTO(
                animal_id=animal.id,
                animal_name=animal.name,
                message=msg,
                severity="high" if days_left < 0 else "medium"
            ))

    # 4. Alertas críticas no resueltas (palabras clave rojas)
    critical_alerts_list = []
    unresolved = db.query(CriticalAlert).filter(
        CriticalAlert.is_resolved == False
    ).order_by(CriticalAlert.created_at.desc()).all()
    for ca in unresolved:
        animal = db.query(Animal).filter(Animal.id == ca.animal_id, Animal.is_active == True).first()
        if animal:
            critical_alerts_list.append(CriticalAlertDTO(
                id=ca.id,
                animal_id=animal.id,
                animal_name=animal.name,
                report_id=ca.report_id,
                message=format_critical_alert_message(ca.keyword_detected),
                keyword_detected=ca.keyword_detected,
                created_at=ca.created_at,
            ))

    # 5. Retornar
    return DashboardResponse(
        normal_animals=normal_animals,
        observation_animals=observation_animals,
        alerts=alerts_list,
        critical_alerts=critical_alerts_list,
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

@router.patch("/critical-alerts/{alert_id}/resolve")
def resolve_alert(alert_id: int, db: Session = Depends(get_db)):
    """Marca una alerta crítica como leída/resuelta."""
    alert = resolve_critical_alert(db, alert_id)
    if not alert:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Alerta no encontrada")
    db.commit()
    return {"status": "success", "alert_id": alert_id}

@router.get("/dictionary")
def get_dictionary(db: Session = Depends(get_db)):
    from src.models.models import TagSet
    from src.services.tag_helpers import load_tag_sets, add_tag_variant, tag_set_to_dict
    tags = load_tag_sets(db)
    result = [tag_set_to_dict(tag) for tag in tags]
    return result
