from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from src.database.session import get_db
from src.models.models import Animal, Species
from src.dtos.animal_dto import AnimalCreate, AnimalResponse, AnimalUpdate
from src.auth import get_current_user
from typing import List, Optional

router = APIRouter(prefix="/animals", tags=["Animals"])

@router.post("/", response_model=AnimalResponse)
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


@router.get("/", response_model=List[AnimalResponse])
def get_animals(
    skip: int = 0,
    limit: int = 1000,
    is_daycare: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Animal).filter(Animal.is_active == True)
    if is_daycare is not None:
        query = query.filter(Animal.is_daycare == is_daycare)
    animals = query.offset(skip).limit(limit).all()
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

from src.models.models import AnimalMedication, MedicationCatalog
from src.dtos.animal_dto import AnimalMedicationCreate, AnimalMedicationUpdate, AnimalMedicationResponse

@router.get("/{animal_id}/medications", response_model=List[AnimalMedicationResponse])
def get_animal_medications(animal_id: int, db: Session = Depends(get_db)):
    medications = db.query(AnimalMedication).join(MedicationCatalog).filter(AnimalMedication.animal_id == animal_id).all()
    result = []
    for m in medications:
        schedules = [s.scheduled_time.strftime("%H:%M") for s in m.schedules] if m.schedules else []
        result.append({
            "id": m.id,
            "medication_id": m.medication_id,
            "medication_name": m.medication.name,
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
    from src.models.models import AnimalMedicationSchedule
    from datetime import datetime
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
    db.commit()
    db.refresh(db_med)
    
    if med_in.schedules:
        for t_str in med_in.schedules:
            try:
                t = datetime.strptime(t_str, "%H:%M").time()
                db.add(AnimalMedicationSchedule(animal_medication_id=db_med.id, scheduled_time=t))
            except ValueError:
                pass
        db.commit()
        
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
        "schedules": med_in.schedules,
    }

@router.put("/{animal_id}/medications/{medication_id}", response_model=AnimalMedicationResponse)
def update_animal_medication(animal_id: int, medication_id: int, med_update: AnimalMedicationUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    from src.models.models import AnimalMedicationSchedule
    from datetime import datetime
    db_med = db.query(AnimalMedication).filter(AnimalMedication.id == medication_id, AnimalMedication.animal_id == animal_id).first()
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
        
    if med_update.schedules is not None:
        db.query(AnimalMedicationSchedule).filter(AnimalMedicationSchedule.animal_medication_id == db_med.id).delete()
        for t_str in med_update.schedules:
            try:
                t = datetime.strptime(t_str, "%H:%M").time()
                db.add(AnimalMedicationSchedule(animal_medication_id=db_med.id, scheduled_time=t))
            except ValueError:
                pass

    db.commit()
    db.refresh(db_med)
    
    catalog_name = db.query(MedicationCatalog).filter(MedicationCatalog.id == db_med.medication_id).first().name
    schedules = [s.scheduled_time.strftime("%H:%M") for s in db_med.schedules] if db_med.schedules else []
    
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
        "schedules": schedules,
    }

@router.delete("/{animal_id}/medications/{medication_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_animal_medication(animal_id: int, medication_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    db_med = db.query(AnimalMedication).filter(AnimalMedication.id == medication_id, AnimalMedication.animal_id == animal_id).first()
    if not db_med:
        raise HTTPException(status_code=404, detail="Medicacion no encontrada")
    db.delete(db_med)
    db.commit()
    return None

from src.dtos.animal_dto import AnimalHistoryResponse, ReportHistoryDTO, EventDTO, AnimalMedicationResponse
from sqlalchemy.orm import joinedload

@router.get("/{animal_id}/history", response_model=AnimalHistoryResponse)
def get_animal_history(animal_id: int, db: Session = Depends(get_db)):
    from src.models.models import Report, ReportEvent, EventType, User, Attachment
    from src.dtos.animal_dto import AttachmentDTO
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal no encontrado")
        
    reports = db.query(Report).filter(Report.animal_id == animal_id).order_by(Report.created_at.desc()).all()
    
    history = []
    for r in reports:
        events = db.query(ReportEvent).filter(ReportEvent.report_id == r.id).all()
        user = db.query(User).filter(User.id == r.user_id).first()
        attachments = db.query(Attachment).filter(Attachment.report_id == r.id).all()
        
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
        
    return AnimalHistoryResponse(animal=animal, reports=history, active_medications=med_dtos)

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
        "vaccine_catalog": {"id": v.vaccine_catalog.id, "name": v.vaccine_catalog.name} if v.vaccine_catalog else None,
    } for v in items]

@router.post("/{animal_id}/vaccines")
def add_vaccine(animal_id: int, data: dict, db: Session = Depends(get_db)):
    record = db.query(HealthRecord).filter(HealthRecord.animal_id == animal_id).first()
    if not record:
        record = HealthRecord(animal_id=animal_id, creation_date=today_ar())
        db.add(record)
        db.commit()
        db.refresh(record)

    vaccine_id = _parse_optional_int(data.get("vaccine_id"))
    if not vaccine_id:
        raise HTTPException(status_code=400, detail="vaccine_id es obligatorio")

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

    vaccine = Vaccine(
        health_record_id=record.id,
        vaccine_id=vaccine_id,
        date_administered=_parse_date(data.get("date_administered"), today_ar()),
        next_due_date=_parse_date(data.get("next_due_date"), None),
        lot_number=(data.get("lot_number") or None),
        veterinarian_id=vet_id,
    )
    db.add(vaccine)
    db.commit()
    db.refresh(vaccine)

    # Devolver el mismo formato que el GET (persistido y legible)
    return {
        "id": vaccine.id,
        "vaccine_id": vaccine.vaccine_id,
        "date_administered": vaccine.date_administered.isoformat() if vaccine.date_administered else None,
        "next_due_date": vaccine.next_due_date.isoformat() if vaccine.next_due_date else None,
        "lot_number": vaccine.lot_number,
        "veterinarian_id": vaccine.veterinarian_id,
        "veterinarian_name": None,
        "vaccine_catalog": None,
    }

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

from fastapi import UploadFile, File

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
