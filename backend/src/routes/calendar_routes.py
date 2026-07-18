from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from src.database.session import get_db
from src.models.models import (
    Deworming, Animal, VeterinaryProduct, Vaccine, HealthRecord,
    VaccineCatalog, AnimalMedication, MedicationCatalog, AnimalMedicationSchedule,
)
from src.auth import get_current_user
from src.timezone_ar import today_ar
from typing import List, Optional
from pydantic import BaseModel
from datetime import date, datetime, timedelta, time as dt_time

router = APIRouter(prefix="/calendar", tags=["Calendar"])

class CalendarAlertResponse(BaseModel):
    id: str
    animal_name: str
    alert_type: str
    product_name: str
    due_date: datetime

    class Config:
        from_attributes = True


def _daterange(start: date, end: date):
    cur = start
    while cur <= end:
        yield cur
        cur += timedelta(days=1)


@router.get("/alerts", response_model=List[CalendarAlertResponse])
def get_calendar_alerts(
    start: Optional[date] = Query(None, description="Inicio del rango visible"),
    end: Optional[date] = Query(None, description="Fin del rango visible"),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    alerts = []
    today = today_ar()
    range_start = start or (today - timedelta(days=30))
    range_end = end or (today + timedelta(days=90))
    if range_end < range_start:
        range_start, range_end = range_end, range_start
    # Tope de seguridad para no generar miles de eventos
    if (range_end - range_start).days > 370:
        range_end = range_start + timedelta(days=370)
    
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

    # Medicaciones activas — crónicas todos los días del rango; con duración, N días desde hoy
    active_meds = (
        db.query(AnimalMedication)
        .options(
            joinedload(AnimalMedication.schedules),
            joinedload(AnimalMedication.medication),
            joinedload(AnimalMedication.animal),
        )
        .join(Animal)
        .filter(
            AnimalMedication.is_current == True,
            Animal.is_active == True,
        )
        .all()
    )

    for m in active_meds:
        alert_type_str = f"Medicación{' (Crónico)' if m.is_forever else ''}"
        product = f"{m.medication.name if m.medication else 'Medicamento'} ({m.dosage}, {m.frequency})"
        times = [s.scheduled_time for s in (m.schedules or [])]
        if not times:
            times = [dt_time(0, 0)]

        if m.is_forever:
            med_days = list(_daterange(range_start, range_end))
        elif m.duration_days and m.duration_days > 0:
            med_start = today
            med_end = today + timedelta(days=m.duration_days - 1)
            # Intersección con el rango visible
            day_from = max(med_start, range_start)
            day_to = min(med_end, range_end)
            med_days = list(_daterange(day_from, day_to)) if day_from <= day_to else []
        else:
            # Sin duración definida: al menos hoy si está en rango
            med_days = [today] if range_start <= today <= range_end else []

        for day in med_days:
            for i, t in enumerate(times):
                dt = datetime.combine(day, t)
                alerts.append({
                    "id": f"alert-med-{m.id}-{day.isoformat()}-{i}",
                    "animal_name": m.animal.name if m.animal else "?",
                    "alert_type": alert_type_str,
                    "product_name": product,
                    "due_date": dt,
                })
            
    return alerts
