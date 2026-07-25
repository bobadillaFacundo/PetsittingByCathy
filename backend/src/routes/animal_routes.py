from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from src.database.session import get_db
from src.models.models import Animal, Species
from src.dtos.animal_dto import AnimalCreate, AnimalResponse, AnimalUpdate
from src.auth import get_current_user, ensure_admin_for_inactive
from typing import List, Optional
import asyncio

router = APIRouter(prefix="/animals", tags=["Animals"])

@router.post("", response_model=AnimalResponse)
def create_animal(animal: AnimalCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    db_animal = Animal(**animal.model_dump())
    db.add(db_animal)
    db.commit()
    db.refresh(db_animal)
    return db_animal

@router.get("/species")
def get_species(db: Session = Depends(get_db)):
    species = db.query(Species).all()
    return [{"id": s.id, "name": s.name} for s in species]

@router.get("/breeds")
def get_breeds(species_id: int = None, db: Session = Depends(get_db)):
    from src.models.models import Breed
    query = db.query(Breed)
    if species_id:
        query = query.filter(Breed.species_id == species_id)
    breeds = query.all()
    return [{"id": b.id, "name": b.name, "species_id": b.species_id} for b in breeds]

from src.models.models import VeterinaryProduct, LaboratoryCatalog, VaccineCatalog

@router.get("/catalogs/laboratories")
def get_laboratory_catalog(db: Session = Depends(get_db)):
    return db.query(LaboratoryCatalog).all()

@router.get("/catalogs/products")
def get_product_catalog(db: Session = Depends(get_db)):
    return db.query(VeterinaryProduct).all()

@router.get("/catalogs/vaccines")
def get_vaccine_catalog(db: Session = Depends(get_db)):
    return db.query(VaccineCatalog).all()

@router.get("/veterinarians")
def get_veterinarians(db: Session = Depends(get_db)):
    from src.models.models import Veterinarian
    vets = db.query(Veterinarian).all()
    return [{"id": v.id, "name": v.name} for v in vets]


@router.get("", response_model=List[AnimalResponse])
def get_animals(
    skip: int = 0,
    limit: int = 1000,
    is_daycare: Optional[bool] = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _admin=Depends(ensure_admin_for_inactive),
):
    """Por defecto solo activas. Con include_inactive=true (solo admin) también inactivas."""
    query = db.query(Animal)
    if not include_inactive:
        query = query.filter(Animal.is_active == True)
    if is_daycare is not None:
        query = query.filter(Animal.is_daycare == is_daycare)
    animals = (
        query.order_by(Animal.is_active.desc(), Animal.name.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return animals

@router.get("/{animal_id}", response_model=AnimalResponse)
def get_animal(animal_id: int, db: Session = Depends(get_db)):
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal no encontrado")
    return animal

@router.put("/{animal_id}", response_model=AnimalResponse)
def update_animal(animal_id: int, animal_update: AnimalUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    db_animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not db_animal:
        raise HTTPException(status_code=404, detail="Animal no encontrado")
    
    update_data = animal_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_animal, key, value)
        
    db.commit()
    db.refresh(db_animal)
    return db_animal

@router.delete("/{animal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_animal(animal_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    db_animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not db_animal:
        raise HTTPException(status_code=404, detail="Animal no encontrado")
    
    # Soft delete
    db_animal.is_active = False
    db.commit()
    return None

from src.models.models import AnimalMedication, MedicationCatalog, AnimalMedicationSchedule
from src.dtos.animal_dto import AnimalMedicationCreate, AnimalMedicationUpdate, AnimalMedicationResponse
from sqlalchemy.orm import joinedload
from datetime import datetime


def _parse_schedule_time(t_str):
    """Acepta HH:MM o HH:MM:SS (input type=time en móviles a veces manda segundos)."""
    if t_str is None:
        return None
    raw = str(t_str).strip()
    if not raw:
        return None
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(raw, fmt).time()
        except ValueError:
            continue
    return None


@router.get("/{animal_id}/medications", response_model=List[AnimalMedicationResponse])
def get_animal_medications(animal_id: int, db: Session = Depends(get_db)):
    medications = (
        db.query(AnimalMedication)
        .options(joinedload(AnimalMedication.schedules), joinedload(AnimalMedication.medication))
        .filter(AnimalMedication.animal_id == animal_id)
        .all()
    )
    result = []
    for m in medications:
        schedules = sorted(
            [s.scheduled_time.strftime("%H:%M") for s in (m.schedules or [])],
        )
        result.append({
            "id": m.id,
            "medication_id": m.medication_id,
            "medication_name": m.medication.name if m.medication else "",
            "dosage": m.dosage,
            "frequency": m.frequency,
            "is_current": m.is_current,
            "amount_per_day": m.amount_per_day,
            "duration_days": m.duration_days,
            "is_forever": m.is_forever,
            "schedules": schedules,
        })
    return result

@router.post("/{animal_id}/medications", response_model=AnimalMedicationResponse)
def add_animal_medication(animal_id: int, med_in: AnimalMedicationCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    catalog = db.query(MedicationCatalog).filter(MedicationCatalog.name.ilike(med_in.medication_name)).first()
    if not catalog:
        catalog = MedicationCatalog(name=med_in.medication_name)
        db.add(catalog)
        db.commit()
        db.refresh(catalog)
        
    db_med = AnimalMedication(
        animal_id=animal_id,
        medication_id=catalog.id,
        dosage=med_in.dosage,
        frequency=med_in.frequency,
        is_current=med_in.is_current,
        amount_per_day=med_in.amount_per_day,
        duration_days=med_in.duration_days,
        is_forever=med_in.is_forever
    )
    db.add(db_med)
    db.flush()

    saved_times = []
    for t_str in (med_in.schedules or []):
        t = _parse_schedule_time(t_str)
        if t is None:
            continue
        db.add(AnimalMedicationSchedule(animal_medication_id=db_med.id, scheduled_time=t))
        saved_times.append(t.strftime("%H:%M"))

    db.commit()
    db.refresh(db_med)
        
    return {
        "id": db_med.id,
        "medication_id": db_med.medication_id,
        "medication_name": catalog.name,
        "dosage": db_med.dosage,
        "frequency": db_med.frequency,
        "is_current": db_med.is_current,
        "amount_per_day": db_med.amount_per_day,
        "duration_days": db_med.duration_days,
        "is_forever": db_med.is_forever,
        "schedules": saved_times,
    }

@router.put("/{animal_id}/medications/{medication_id}", response_model=AnimalMedicationResponse)
def update_animal_medication(animal_id: int, medication_id: int, med_update: AnimalMedicationUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    db_med = (
        db.query(AnimalMedication)
        .options(joinedload(AnimalMedication.schedules))
        .filter(AnimalMedication.id == medication_id, AnimalMedication.animal_id == animal_id)
        .first()
    )
    if not db_med:
        raise HTTPException(status_code=404, detail="Medicacion no encontrada")
        
    if med_update.medication_name is not None:
        catalog = db.query(MedicationCatalog).filter(MedicationCatalog.name.ilike(med_update.medication_name)).first()
        if not catalog:
            catalog = MedicationCatalog(name=med_update.medication_name)
            db.add(catalog)
            db.commit()
            db.refresh(catalog)
        db_med.medication_id = catalog.id
        
    update_data = med_update.model_dump(exclude_unset=True, exclude={"medication_name", "schedules"})
    for k, v in update_data.items():
        setattr(db_med, k, v)
        
    saved_times = None
    if med_update.schedules is not None:
        db.query(AnimalMedicationSchedule).filter(
            AnimalMedicationSchedule.animal_medication_id == db_med.id
        ).delete(synchronize_session=False)
        saved_times = []
        for t_str in med_update.schedules:
            t = _parse_schedule_time(t_str)
            if t is None:
                continue
            db.add(AnimalMedicationSchedule(animal_medication_id=db_med.id, scheduled_time=t))
            saved_times.append(t.strftime("%H:%M"))

    db.commit()
    db.refresh(db_med)
    
    catalog_name = db.query(MedicationCatalog).filter(MedicationCatalog.id == db_med.medication_id).first().name
    if saved_times is None:
        saved_times = sorted(
            [s.scheduled_time.strftime("%H:%M") for s in (db_med.schedules or [])]
        )
    
    return {
        "id": db_med.id,
        "medication_id": db_med.medication_id,
        "medication_name": catalog_name,
        "dosage": db_med.dosage,
        "frequency": db_med.frequency,
        "is_current": db_med.is_current,
        "amount_per_day": db_med.amount_per_day,
        "duration_days": db_med.duration_days,
        "is_forever": db_med.is_forever,
        "schedules": saved_times,
    }

@router.delete("/{animal_id}/medications/{medication_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_animal_medication(animal_id: int, medication_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    db_med = db.query(AnimalMedication).filter(AnimalMedication.id == medication_id, AnimalMedication.animal_id == animal_id).first()
    if not db_med:
        raise HTTPException(status_code=404, detail="Medicacion no encontrada")
    db.delete(db_med)
    db.commit()
    return None

from src.dtos.animal_dto import AnimalHistoryResponse, ReportHistoryDTO, EventDTO, AnimalMedicationResponse, ObservationDTO, AttachmentDTO
from sqlalchemy.orm import joinedload

@router.get("/{animal_id}/history", response_model=AnimalHistoryResponse)
def get_animal_history(animal_id: int, db: Session = Depends(get_db)):
    from src.models.models import Report, ReportEvent, EventType, User, Attachment, AnimalObservation
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal no encontrado")
        
    reports = db.query(Report).filter(Report.animal_id == animal_id).order_by(Report.created_at.desc()).all()
    
    history = []
    for r in reports:
        events = db.query(ReportEvent).filter(ReportEvent.report_id == r.id).all()
        user = db.query(User).filter(User.id == r.user_id).first()
        attachments = db.query(Attachment).filter(
            Attachment.report_id == r.id,
            Attachment.observation_id.is_(None),
        ).all()
        
        event_dtos = []
        for e in events:
            etype = db.query(EventType).filter(EventType.id == e.event_type_id).first()
            event_dtos.append(EventDTO(type=etype.name if etype else "Desconocido", value=e.value))

        attachment_dtos = [
            AttachmentDTO(id=a.id, file_url=a.file_url, file_type=a.file_type)
            for a in attachments
        ]
            
        history.append(ReportHistoryDTO(
            id=r.id,
            created_at=r.created_at,
            transcript=r.audio_transcript,
            user_name=user.name if user else "Desconocido",
            events=event_dtos,
            attachments=attachment_dtos,
        ))

    # Observaciones con multimedia (entidad débil 1:N)
    obs_rows = (
        db.query(AnimalObservation)
        .options(joinedload(AnimalObservation.attachments), joinedload(AnimalObservation.user))
        .filter(AnimalObservation.animal_id == animal_id)
        .order_by(AnimalObservation.created_at.desc())
        .all()
    )
    observation_dtos = [
        ObservationDTO(
            id=o.id,
            observation=o.observation,
            created_at=o.created_at,
            report_id=o.report_id,
            user_name=o.user.name if o.user else None,
            attachments=[
                AttachmentDTO(id=a.id, file_url=a.file_url, file_type=a.file_type)
                for a in (o.attachments or [])
            ],
        )
        for o in obs_rows
    ]

    # Medicaciones activas del animal
    active_meds = db.query(AnimalMedication).join(MedicationCatalog).filter(
        AnimalMedication.animal_id == animal_id,
        AnimalMedication.is_current == True
    ).all()
    med_dtos = [
        AnimalMedicationResponse(
            id=m.id,
            medication_id=m.medication_id,
            medication_name=m.medication.name,
            dosage=m.dosage,
            frequency=m.frequency,
            is_current=m.is_current,
            amount_per_day=m.amount_per_day,
            duration_days=m.duration_days,
            is_forever=m.is_forever,
            schedules=[s.scheduled_time.strftime("%H:%M") for s in m.schedules] if m.schedules else []
        )
        for m in active_meds
    ]
        
    return AnimalHistoryResponse(animal=animal, reports=history, observations=observation_dtos, active_medications=med_dtos)

from pydantic import BaseModel
class EvolutionAnalysisResponse(BaseModel):
    analysis: str

@router.get("/{animal_id}/evolution-analysis", response_model=EvolutionAnalysisResponse)
def get_evolution_analysis(animal_id: int, db: Session = Depends(get_db)):
    from src.models.models import Report, ReportEvent, EventType, User
    from src.services.audio_service import NLPService
    
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal no encontrado")
        
    # Obtener últimos 2 reportes (el actual y el anterior) para comparar la evolución
    reports = db.query(Report).filter(Report.animal_id == animal_id).order_by(Report.created_at.desc()).limit(2).all()
    
    if not reports:
        return EvolutionAnalysisResponse(analysis="No hay reportes suficientes para analizar la evolución.")
        
    # Invertir para que estén en orden cronológico (más antiguo primero) para la IA
    reports = list(reversed(reports))
    
    context_lines = []
    for r in reports:
        events = db.query(ReportEvent).filter(ReportEvent.report_id == r.id).all()
        date_str = r.created_at.strftime("%Y-%m-%d %H:%M")
        
        event_descriptions = []
        for e in events:
            etype = db.query(EventType).filter(EventType.id == e.event_type_id).first()
            type_name = etype.name if etype else "Desconocido"
            val = e.value if e.value else ""
            event_descriptions.append(f"{type_name}: {val}")
            
        event_str = ", ".join(event_descriptions)
        if not event_str:
            event_str = "Sin eventos registrados"
            
        context_lines.append(f"[{date_str}] {event_str}")
        
    history_context = "\n".join(context_lines)
    analysis_result = NLPService.analyze_animal_evolution(animal.name, history_context)
    
    return EvolutionAnalysisResponse(analysis=analysis_result)

from typing import Any
from sqlalchemy.orm import joinedload
from src.models.models import LabResult, HealthRecord, Vaccine, VeterinaryProduct, LaboratoryCatalog, VaccineCatalog, Deworming, Veterinarian
from src.timezone_ar import today_ar
from datetime import datetime, date


def _parse_optional_int(value):
    if value is None or value == "":
        return None
    return int(value)


def _parse_date(value, fallback=None):
    if value is None or value == "":
        return fallback
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    return datetime.strptime(str(value).strip(), "%Y-%m-%d").date()


def _serialize_lab(item: LabResult) -> dict:
    return {
        "id": item.id,
        "animal_id": item.animal_id,
        "laboratory_id": item.laboratory_id,
        "date": item.date.isoformat() if item.date else None,
        "document_url": item.document_url,
        "laboratory": {"id": item.laboratory.id, "name": item.laboratory.name} if item.laboratory else None,
    }


@router.get("/{animal_id}/health_record")
def get_health_record(animal_id: int, db: Session = Depends(get_db)):
    record = db.query(HealthRecord).filter(HealthRecord.animal_id == animal_id).first()
    if not record:
        record = HealthRecord(animal_id=animal_id, creation_date=today_ar())
        db.add(record)
        db.commit()
        db.refresh(record)
    return record

@router.get("/{animal_id}/vaccines")
def get_vaccines(animal_id: int, db: Session = Depends(get_db)):
    record = db.query(HealthRecord).filter(HealthRecord.animal_id == animal_id).first()
    if not record:
        return []
    items = db.query(Vaccine).options(
        joinedload(Vaccine.vaccine_catalog),
        joinedload(Vaccine.veterinarian),
    ).filter(Vaccine.health_record_id == record.id).order_by(Vaccine.date_administered.desc()).all()
    return [{
        "id": v.id,
        "vaccine_id": v.vaccine_id,
        "date_administered": v.date_administered.isoformat() if v.date_administered else None,
        "next_due_date": v.next_due_date.isoformat() if v.next_due_date else None,
        "lot_number": v.lot_number,
        "veterinarian_id": v.veterinarian_id,
        "veterinarian_name": v.veterinarian.name if v.veterinarian else None,
        "document_url": v.document_url,
        "vaccine_catalog": {"id": v.vaccine_catalog.id, "name": v.vaccine_catalog.name} if v.vaccine_catalog else None,
    } for v in items]

def _serialize_vaccine(v: Vaccine) -> dict:
    return {
        "id": v.id,
        "vaccine_id": v.vaccine_id,
        "date_administered": v.date_administered.isoformat() if v.date_administered else None,
        "next_due_date": v.next_due_date.isoformat() if v.next_due_date else None,
        "lot_number": v.lot_number,
        "veterinarian_id": v.veterinarian_id,
        "veterinarian_name": v.veterinarian.name if v.veterinarian else None,
        "document_url": v.document_url,
        "vaccine_catalog": {"id": v.vaccine_catalog.id, "name": v.vaccine_catalog.name} if v.vaccine_catalog else None,
    }


def _get_or_create_health_record(animal_id: int, db: Session) -> HealthRecord:
    record = db.query(HealthRecord).filter(HealthRecord.animal_id == animal_id).first()
    if not record:
        record = HealthRecord(animal_id=animal_id, creation_date=today_ar())
        db.add(record)
        db.commit()
        db.refresh(record)
    return record


def _resolve_veterinarian_id(data: dict, db: Session) -> Optional[int]:
    vet_id = _parse_optional_int(data.get("veterinarian_id"))
    if not vet_id and data.get("veterinarian_name"):
        vet_name = str(data["veterinarian_name"]).strip()
        if vet_name:
            vet = db.query(Veterinarian).filter(Veterinarian.name == vet_name).first()
            if not vet:
                vet = Veterinarian(name=vet_name)
                db.add(vet)
                db.flush()
            vet_id = vet.id
    return vet_id


def _enrich_scan_vaccines(result: dict, catalog_list: list[dict]) -> dict:
    from src.services.vision_service import match_vaccine_catalog_id

    vaccines = result.get("vaccines")
    if not isinstance(vaccines, list) or not vaccines:
        single = {
            "vaccine_name": result.get("vaccine_name"),
            "lot_number": result.get("lot_number"),
            "date_administered": result.get("date_administered"),
            "next_due_date": result.get("next_due_date"),
            "veterinarian_name": result.get("veterinarian_name"),
        }
        if any(single.values()):
            vaccines = [single]
        else:
            vaccines = []

    enriched = []
    for item in vaccines:
        row = dict(item)
        row["vaccine_id"] = match_vaccine_catalog_id(row.get("vaccine_name"), catalog_list)
        enriched.append(row)

    result["vaccines"] = enriched
    result["count"] = len(enriched)
    if enriched:
        result.update(enriched[0])
    return result


def _build_vaccine(record_id: int, item: dict, db: Session, document_url: str = None) -> Vaccine:
    vaccine_id = _parse_optional_int(item.get("vaccine_id"))
    if not vaccine_id:
        raise HTTPException(status_code=400, detail="vaccine_id es obligatorio en cada vacuna")

    vet_id = _resolve_veterinarian_id(item, db)
    doc_url = document_url or item.get("document_url") or None

    return Vaccine(
        health_record_id=record_id,
        vaccine_id=vaccine_id,
        date_administered=_parse_date(item.get("date_administered"), today_ar()),
        next_due_date=_parse_date(item.get("next_due_date"), None),
        lot_number=(item.get("lot_number") or None),
        veterinarian_id=vet_id,
        document_url=doc_url,
    )


@router.post("/{animal_id}/vaccines")
def add_vaccine(animal_id: int, data: dict, db: Session = Depends(get_db)):
    record = _get_or_create_health_record(animal_id, db)

    vaccine_id = _parse_optional_int(data.get("vaccine_id"))
    if not vaccine_id:
        raise HTTPException(status_code=400, detail="vaccine_id es obligatorio")

    vet_id = _resolve_veterinarian_id(data, db)

    vaccine = Vaccine(
        health_record_id=record.id,
        vaccine_id=vaccine_id,
        date_administered=_parse_date(data.get("date_administered"), today_ar()),
        next_due_date=_parse_date(data.get("next_due_date"), None),
        lot_number=(data.get("lot_number") or None),
        veterinarian_id=vet_id,
        document_url=(data.get("document_url") or None),
    )
    db.add(vaccine)
    db.commit()
    db.refresh(vaccine)
    vaccine = db.query(Vaccine).options(
        joinedload(Vaccine.vaccine_catalog),
        joinedload(Vaccine.veterinarian),
    ).filter(Vaccine.id == vaccine.id).first()
    return _serialize_vaccine(vaccine)


@router.post("/{animal_id}/vaccines/scan")
async def scan_vaccine_certificate(
    animal_id: int,
    file: UploadFile = File(...),
    engine: str = "auto",
    db: Session = Depends(get_db),
):
    """Escanea una imagen de vacuna y devuelve campos detectados (sin guardar)."""
    from src.services.vision_service import (
        scan_vaccine_image,
        ScanImageError,
        GroqUnavailableError,
    )

    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal no encontrado")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío")

    catalog = db.query(VaccineCatalog).all()
    catalog_list = [{"id": c.id, "name": c.name} for c in catalog]
    catalog_names = [c.name for c in catalog]

    try:
        result = await asyncio.to_thread(
            scan_vaccine_image,
            content,
            filename=file.filename or "vaccine.jpg",
            engine=engine,
            catalog_names=catalog_names,
        )
    except ScanImageError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except GroqUnavailableError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al analizar la imagen: {e}")

    return _enrich_scan_vaccines(result, catalog_list)


@router.post("/{animal_id}/vaccines/bulk")
def add_vaccines_bulk(animal_id: int, data: dict, db: Session = Depends(get_db)):
    """Registra varias vacunas a la vez (mismo documento opcional)."""
    items = data.get("vaccines") or []
    if not items:
        raise HTTPException(status_code=400, detail="Debes enviar al menos una vacuna")

    record = _get_or_create_health_record(animal_id, db)
    document_url = data.get("document_url") or None
    created_ids = []

    try:
        for item in items:
            vaccine = _build_vaccine(record.id, item, db, document_url=document_url)
            db.add(vaccine)
            db.flush()
            created_ids.append(vaccine.id)
    except HTTPException:
        db.rollback()
        raise

    db.commit()
    vaccines = db.query(Vaccine).options(
        joinedload(Vaccine.vaccine_catalog),
        joinedload(Vaccine.veterinarian),
    ).filter(Vaccine.id.in_(created_ids)).order_by(Vaccine.id.asc()).all()
    return {
        "created": [_serialize_vaccine(v) for v in vaccines],
        "count": len(vaccines),
    }


@router.post("/{animal_id}/vaccines/bulk-with-document")
async def add_vaccines_bulk_with_document(
    animal_id: int,
    file: UploadFile = File(...),
    vaccines: str = Form(...),
    db: Session = Depends(get_db),
):
    """Sube un certificado/libreta y registra varias vacunas con el mismo document_url."""
    import json as json_lib
    from src.services.storage_service import upload_bytes

    try:
        items = json_lib.loads(vaccines)
    except json_lib.JSONDecodeError:
        raise HTTPException(status_code=400, detail="vaccines debe ser un JSON válido")

    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=400, detail="Debes enviar al menos una vacuna")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío")

    from src.services.vision_service import prepare_file_for_storage
    storage_bytes, storage_name, storage_type = prepare_file_for_storage(
        content, file.filename or "cert.jpg", file.content_type
    )
    document_url = upload_bytes(
        storage_bytes,
        folder="vaccines",
        original_filename=storage_name,
        content_type=storage_type,
    )

    record = _get_or_create_health_record(animal_id, db)
    created_ids = []
    try:
        for item in items:
            vaccine = _build_vaccine(record.id, item, db, document_url=document_url)
            db.add(vaccine)
            db.flush()
            created_ids.append(vaccine.id)
    except HTTPException:
        db.rollback()
        raise

    db.commit()
    saved = db.query(Vaccine).options(
        joinedload(Vaccine.vaccine_catalog),
        joinedload(Vaccine.veterinarian),
    ).filter(Vaccine.id.in_(created_ids)).order_by(Vaccine.id.asc()).all()
    return {
        "created": [_serialize_vaccine(v) for v in saved],
        "count": len(saved),
        "document_url": document_url,
    }


@router.post("/{animal_id}/vaccines/with-document")
async def add_vaccine_with_document(
    animal_id: int,
    file: UploadFile = File(...),
    vaccine_id: int = Form(...),
    date_administered: str = Form(None),
    next_due_date: str = Form(None),
    lot_number: str = Form(None),
    veterinarian_id: str = Form(None),
    veterinarian_name: str = Form(None),
    db: Session = Depends(get_db),
):
    """Sube la foto del certificado a Storage y registra la vacuna con document_url."""
    from src.services.storage_service import upload_bytes

    if not vaccine_id:
        raise HTTPException(status_code=400, detail="vaccine_id es obligatorio")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío")

    from src.services.vision_service import prepare_file_for_storage
    storage_bytes, storage_name, storage_type = prepare_file_for_storage(
        content, file.filename or "cert.jpg", file.content_type
    )
    document_url = upload_bytes(
        storage_bytes,
        folder="vaccines",
        original_filename=storage_name,
        content_type=storage_type,
    )

    record = _get_or_create_health_record(animal_id, db)
    data = {
        "veterinarian_id": veterinarian_id,
        "veterinarian_name": veterinarian_name,
    }
    vet_id = _resolve_veterinarian_id(data, db)

    vaccine = Vaccine(
        health_record_id=record.id,
        vaccine_id=int(vaccine_id),
        date_administered=_parse_date(date_administered, today_ar()),
        next_due_date=_parse_date(next_due_date, None),
        lot_number=(lot_number or None),
        veterinarian_id=vet_id,
        document_url=document_url,
    )
    db.add(vaccine)
    db.commit()
    db.refresh(vaccine)
    vaccine = db.query(Vaccine).options(
        joinedload(Vaccine.vaccine_catalog),
        joinedload(Vaccine.veterinarian),
    ).filter(Vaccine.id == vaccine.id).first()
    return _serialize_vaccine(vaccine)


@router.delete("/{animal_id}/vaccines/{vaccine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vaccine(animal_id: int, vaccine_id: int, db: Session = Depends(get_db), current_admin=Depends(get_current_user)):
    record = db.query(HealthRecord).filter(HealthRecord.animal_id == animal_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Vacuna no encontrada")

    vaccine = db.query(Vaccine).filter(
        Vaccine.id == vaccine_id,
        Vaccine.health_record_id == record.id,
    ).first()
    if not vaccine:
        raise HTTPException(status_code=404, detail="Vacuna no encontrada")

    if vaccine.document_url:
        from src.services.storage_service import delete_by_url
        delete_by_url(vaccine.document_url)

    db.delete(vaccine)
    db.commit()
    return None

def _serialize_deworming(item):
    return {
        "id": item.id,
        "date": item.date.isoformat() if item.date else None,
        "next_due_date": item.next_due_date.isoformat() if item.next_due_date else None,
        "product_id": item.product_id,
        "product": {"id": item.product.id, "name": item.product.name, "type": item.product.type} if item.product else None,
    }

def _get_dewormings_by_type(animal_id: int, product_type: str, db: Session):
    return db.query(Deworming).join(VeterinaryProduct).options(
        joinedload(Deworming.product)
    ).filter(
        Deworming.animal_id == animal_id,
        VeterinaryProduct.type == product_type,
    ).order_by(Deworming.date.desc()).all()

@router.get("/{animal_id}/internal_dewormings")
def get_internal_dewormings(animal_id: int, db: Session = Depends(get_db)):
    items = _get_dewormings_by_type(animal_id, "INTERNAL", db)
    return [_serialize_deworming(i) for i in items]

@router.post("/{animal_id}/internal_dewormings")
def add_internal_deworming(animal_id: int, data: dict, db: Session = Depends(get_db)):
    product_id = _parse_optional_int(data.get("product_id"))
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id es obligatorio")
    item = Deworming(
        animal_id=animal_id,
        date=_parse_date(data.get("date"), today_ar()),
        product_id=product_id,
        next_due_date=_parse_date(data.get("next_due_date"), None),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    item = db.query(Deworming).options(joinedload(Deworming.product)).filter(Deworming.id == item.id).first()
    return _serialize_deworming(item)

@router.delete("/{animal_id}/internal_dewormings/{deworming_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_internal_deworming(
    animal_id: int,
    deworming_id: int,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    item = (
        db.query(Deworming)
        .join(VeterinaryProduct)
        .filter(
            Deworming.id == deworming_id,
            Deworming.animal_id == animal_id,
            VeterinaryProduct.type == "INTERNAL",
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Desparasitación interna no encontrada")
    db.delete(item)
    db.commit()
    return None

@router.get("/{animal_id}/external_dewormings")
def get_external_dewormings(animal_id: int, db: Session = Depends(get_db)):
    items = _get_dewormings_by_type(animal_id, "EXTERNAL", db)
    return [_serialize_deworming(i) for i in items]

@router.post("/{animal_id}/external_dewormings")
def add_external_deworming(animal_id: int, data: dict, db: Session = Depends(get_db)):
    product_id = _parse_optional_int(data.get("product_id"))
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id es obligatorio")
    item = Deworming(
        animal_id=animal_id,
        date=_parse_date(data.get("date"), today_ar()),
        product_id=product_id,
        next_due_date=_parse_date(data.get("next_due_date"), None),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    item = db.query(Deworming).options(joinedload(Deworming.product)).filter(Deworming.id == item.id).first()
    return _serialize_deworming(item)

@router.delete("/{animal_id}/external_dewormings/{deworming_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_external_deworming(
    animal_id: int,
    deworming_id: int,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    item = (
        db.query(Deworming)
        .join(VeterinaryProduct)
        .filter(
            Deworming.id == deworming_id,
            Deworming.animal_id == animal_id,
            VeterinaryProduct.type == "EXTERNAL",
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Desparasitación externa no encontrada")
    db.delete(item)
    db.commit()
    return None

@router.get("/{animal_id}/lab_results")
def get_lab_results(animal_id: int, db: Session = Depends(get_db)):
    items = db.query(LabResult).options(joinedload(LabResult.laboratory)).filter(LabResult.animal_id == animal_id).order_by(LabResult.date.desc()).all()
    return [_serialize_lab(i) for i in items]

@router.post("/{animal_id}/lab_results")
def add_lab_result(animal_id: int, data: dict, db: Session = Depends(get_db)):
    laboratory_id = _parse_optional_int(data.get("laboratory_id"))
    if not laboratory_id:
        raise HTTPException(status_code=400, detail="laboratory_id es obligatorio")
    if not data.get("document_url"):
        raise HTTPException(status_code=400, detail="document_url es obligatorio")
    item = LabResult(
        animal_id=animal_id,
        date=_parse_date(data.get("date"), today_ar()),
        laboratory_id=laboratory_id,
        document_url=data["document_url"],
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    item = db.query(LabResult).options(joinedload(LabResult.laboratory)).filter(LabResult.id == item.id).first()
    return _serialize_lab(item)

@router.delete("/{animal_id}/lab_results/{lab_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lab_result(animal_id: int, lab_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    db_lab = db.query(LabResult).filter(LabResult.id == lab_id, LabResult.animal_id == animal_id).first()
    if not db_lab:
        raise HTTPException(status_code=404, detail="Estudio no encontrado")
    
    from src.services.storage_service import delete_by_url
    delete_by_url(db_lab.document_url)
                
    db.delete(db_lab)
    db.commit()
    return None

@router.post("/{animal_id}/lab_results/upload")
async def upload_lab_result(
    animal_id: int,
    laboratory_id: int,
    files: List[UploadFile] = File(...),
    date: str = None,
    db: Session = Depends(get_db),
):
    """Sube uno o varios archivos de laboratorio (mismo tipo/fecha)."""
    from src.services.storage_service import upload_bytes

    if not files:
        raise HTTPException(status_code=400, detail="Debes seleccionar al menos un archivo")

    created = []
    errors = []
    lab_date = _parse_date(date, today_ar())

    for file in files:
        try:
            content = await file.read()
            if not content:
                errors.append(f"{file.filename or 'archivo'}: vacío")
                continue
            document_url = upload_bytes(
                content,
                folder="labs",
                original_filename=file.filename,
                content_type=file.content_type,
            )
            item = LabResult(
                animal_id=animal_id,
                date=lab_date,
                laboratory_id=laboratory_id,
                document_url=document_url,
            )
            db.add(item)
            db.flush()
            created.append(item.id)
        except Exception as e:
            errors.append(f"{file.filename or 'archivo'}: {e}")

    if not created:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"No se pudo subir ningún archivo. {'; '.join(errors)}")

    db.commit()
    items = (
        db.query(LabResult)
        .options(joinedload(LabResult.laboratory))
        .filter(LabResult.id.in_(created))
        .order_by(LabResult.id.desc())
        .all()
    )
    return {
        "uploaded": [_serialize_lab(i) for i in items],
        "count": len(items),
        "errors": errors,
    }


# ----------------- OBSERVACIONES (entidad débil 1:N con multimedia) ----------------- #

from src.models.models import AnimalObservation
from src.dtos.animal_dto import ObservationCreate


def _serialize_observation(obs: AnimalObservation) -> dict:
    return {
        "id": obs.id,
        "animal_id": obs.animal_id,
        "report_id": obs.report_id,
        "observation": obs.observation,
        "created_at": obs.created_at.isoformat() if obs.created_at else None,
        "user_name": obs.user.name if obs.user else None,
        "attachments": [
            {"id": a.id, "file_url": a.file_url, "file_type": a.file_type}
            for a in (obs.attachments or [])
        ],
    }


@router.get("/{animal_id}/observations")
def get_observations(animal_id: int, db: Session = Depends(get_db)):
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal no encontrado")
    items = (
        db.query(AnimalObservation)
        .options(joinedload(AnimalObservation.attachments), joinedload(AnimalObservation.user))
        .filter(AnimalObservation.animal_id == animal_id)
        .order_by(AnimalObservation.created_at.desc())
        .all()
    )
    return [_serialize_observation(o) for o in items]


@router.post("/{animal_id}/observations")
def create_observation(
    animal_id: int,
    data: ObservationCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal no encontrado")
    text = (data.observation or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="La observación no puede estar vacía")

    obs = AnimalObservation(
        animal_id=animal_id,
        observation=text,
        report_id=data.report_id,
        user_id=current_user.id,
    )
    db.add(obs)
    db.commit()
    db.refresh(obs)
    obs = (
        db.query(AnimalObservation)
        .options(joinedload(AnimalObservation.attachments), joinedload(AnimalObservation.user))
        .filter(AnimalObservation.id == obs.id)
        .first()
    )
    return _serialize_observation(obs)


@router.post("/{animal_id}/observations/{observation_id}/media")
async def upload_observation_media(
    animal_id: int,
    observation_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Sube una o varias fotos/videos a una observación."""
    from src.models.models import Attachment
    from src.services.storage_service import upload_bytes
    from src.services.media_helpers import detect_media_type

    obs = (
        db.query(AnimalObservation)
        .filter(AnimalObservation.id == observation_id, AnimalObservation.animal_id == animal_id)
        .first()
    )
    if not obs:
        raise HTTPException(status_code=404, detail="Observación no encontrada")
    if not files:
        raise HTTPException(status_code=400, detail="Debes seleccionar al menos un archivo")

    created = []
    errors = []
    for file in files:
        try:
            content = await file.read()
            if not content:
                errors.append(f"{file.filename or 'archivo'}: vacío")
                continue
            file_type, folder = detect_media_type(file.filename, file.content_type)
            file_url = upload_bytes(
                content,
                folder=folder,
                original_filename=file.filename,
                content_type=file.content_type,
            )
            att = Attachment(
                animal_id=animal_id,
                report_id=obs.report_id,
                observation_id=observation_id,
                file_type=file_type,
                file_url=file_url,
            )
            db.add(att)
            db.flush()
            created.append(att.id)
        except ValueError as e:
            errors.append(f"{file.filename or 'archivo'}: {e}")
        except Exception as e:
            errors.append(f"{file.filename or 'archivo'}: {e}")

    if not created:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"No se pudo subir ningún archivo. {'; '.join(errors)}")

    db.commit()
    obs = (
        db.query(AnimalObservation)
        .options(joinedload(AnimalObservation.attachments), joinedload(AnimalObservation.user))
        .filter(AnimalObservation.id == observation_id)
        .first()
    )
    return {
        "observation": _serialize_observation(obs),
        "count": len(created),
        "errors": errors,
    }


@router.delete("/{animal_id}/observations/{observation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_observation(
    animal_id: int,
    observation_id: int,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    from src.services.storage_service import delete_by_url

    obs = (
        db.query(AnimalObservation)
        .options(joinedload(AnimalObservation.attachments))
        .filter(AnimalObservation.id == observation_id, AnimalObservation.animal_id == animal_id)
        .first()
    )
    if not obs:
        raise HTTPException(status_code=404, detail="Observación no encontrada")

    for att in obs.attachments or []:
        delete_by_url(att.file_url)

    db.delete(obs)
    db.commit()
    return None
