from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from src.database.session import get_db
from src.models.models import Animal, Species
from src.dtos.animal_dto import AnimalCreate, AnimalResponse, AnimalUpdate
from src.auth import get_current_admin
from typing import List

router = APIRouter(prefix="/animals", tags=["Animals"])

@router.post("/", response_model=AnimalResponse)
def create_animal(animal: AnimalCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_admin)):
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
def get_animals(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    animals = db.query(Animal).offset(skip).limit(limit).all()
    return animals

@router.get("/{animal_id}", response_model=AnimalResponse)
def get_animal(animal_id: int, db: Session = Depends(get_db)):
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal no encontrado")
    return animal

@router.put("/{animal_id}", response_model=AnimalResponse)
def update_animal(animal_id: int, animal_update: AnimalUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_admin)):
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
def delete_animal(animal_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_admin)):
    db_animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not db_animal:
        raise HTTPException(status_code=404, detail="Animal no encontrado")
    
    # Soft delete
    db_animal.is_active = False
    db.commit()
    return None

from src.dtos.animal_dto import AnimalHistoryResponse, ReportHistoryDTO, EventDTO
from sqlalchemy.orm import joinedload

@router.get("/{animal_id}/history", response_model=AnimalHistoryResponse)
def get_animal_history(animal_id: int, db: Session = Depends(get_db)):
    from src.models.models import Report, ReportEvent, EventType, User
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal no encontrado")
        
    reports = db.query(Report).filter(Report.animal_id == animal_id).order_by(Report.created_at.desc()).all()
    
    history = []
    for r in reports:
        events = db.query(ReportEvent).filter(ReportEvent.report_id == r.id).all()
        user = db.query(User).filter(User.id == r.user_id).first()
        
        event_dtos = []
        for e in events:
            etype = db.query(EventType).filter(EventType.id == e.event_type_id).first()
            event_dtos.append(EventDTO(type=etype.name if etype else "Desconocido", value=e.value))
            
        history.append(ReportHistoryDTO(
            id=r.id,
            created_at=r.created_at,
            transcript=r.audio_transcript,
            user_name=user.name if user else "Desconocido",
            events=event_dtos
        ))
        
    return AnimalHistoryResponse(animal=animal, reports=history)

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
from src.models.models import InternalDeworming, ExternalDeworming, LabResult, HealthRecord, Vaccine, VeterinaryProduct, LaboratoryCatalog, VaccineCatalog

@router.get("/{animal_id}/health_record")
def get_health_record(animal_id: int, db: Session = Depends(get_db)):
    record = db.query(HealthRecord).filter(HealthRecord.animal_id == animal_id).first()
    if not record:
        from datetime import datetime
        record = HealthRecord(animal_id=animal_id, creation_date=datetime.utcnow().date())
        db.add(record)
        db.commit()
        db.refresh(record)
    return record

@router.get("/{animal_id}/vaccines")
def get_vaccines(animal_id: int, db: Session = Depends(get_db)):
    record = db.query(HealthRecord).filter(HealthRecord.animal_id == animal_id).first()
    if not record:
        return []
    return db.query(Vaccine).options(joinedload(Vaccine.vaccine_catalog)).filter(Vaccine.health_record_id == record.id).order_by(Vaccine.date_administered.desc()).all()

@router.post("/{animal_id}/vaccines")
def add_vaccine(animal_id: int, data: dict, db: Session = Depends(get_db)):
    from datetime import datetime
    record = db.query(HealthRecord).filter(HealthRecord.animal_id == animal_id).first()
    if not record:
        record = HealthRecord(animal_id=animal_id, creation_date=datetime.utcnow().date())
        db.add(record)
        db.commit()
        db.refresh(record)
        
    vet_name = data.get('veterinarian_name')
    if vet_name:
        from src.models.models import Veterinarian
        vet = db.query(Veterinarian).filter(Veterinarian.name == vet_name).first()
        if not vet:
            vet = Veterinarian(name=vet_name)
            db.add(vet)
            db.commit()

    vaccine = Vaccine(
        health_record_id=record.id,
        vaccine_id=data['vaccine_id'],
        date_administered=datetime.strptime(data['date_administered'], "%Y-%m-%d").date() if data.get('date_administered') else datetime.utcnow().date(),
        next_due_date=datetime.strptime(data['next_due_date'], "%Y-%m-%d").date() if data.get('next_due_date') else None,
        lot_number=data.get('lot_number'),
        veterinarian_name=vet_name
    )
    db.add(vaccine)
    db.commit()
    db.refresh(vaccine)
    return vaccine

from sqlalchemy.orm import joinedload

@router.get("/{animal_id}/internal_dewormings")
def get_internal_dewormings(animal_id: int, db: Session = Depends(get_db)):
    items = db.query(InternalDeworming).options(joinedload(InternalDeworming.product)).filter(InternalDeworming.animal_id == animal_id).order_by(InternalDeworming.date.desc()).all()
    return items

@router.post("/{animal_id}/internal_dewormings")
def add_internal_deworming(animal_id: int, data: dict, db: Session = Depends(get_db)):
    from datetime import datetime
    item = InternalDeworming(
        animal_id=animal_id,
        date=datetime.strptime(data['date'], "%Y-%m-%d").date() if data.get('date') else datetime.utcnow().date(),
        product_id=data['product_id'],
        next_due_date=datetime.strptime(data['next_due_date'], "%Y-%m-%d").date() if data.get('next_due_date') else None
    )
    db.add(item)
    db.commit()
    return item

@router.get("/{animal_id}/external_dewormings")
def get_external_dewormings(animal_id: int, db: Session = Depends(get_db)):
    items = db.query(ExternalDeworming).options(joinedload(ExternalDeworming.product)).filter(ExternalDeworming.animal_id == animal_id).order_by(ExternalDeworming.date.desc()).all()
    return items

@router.post("/{animal_id}/external_dewormings")
def add_external_deworming(animal_id: int, data: dict, db: Session = Depends(get_db)):
    from datetime import datetime
    item = ExternalDeworming(
        animal_id=animal_id,
        date=datetime.strptime(data['date'], "%Y-%m-%d").date() if data.get('date') else datetime.utcnow().date(),
        product_id=data['product_id'],
        next_due_date=datetime.strptime(data['next_due_date'], "%Y-%m-%d").date() if data.get('next_due_date') else None
    )
    db.add(item)
    db.commit()
    return item

@router.get("/{animal_id}/lab_results")
def get_lab_results(animal_id: int, db: Session = Depends(get_db)):
    items = db.query(LabResult).options(joinedload(LabResult.laboratory)).filter(LabResult.animal_id == animal_id).order_by(LabResult.date.desc()).all()
    return items

@router.post("/{animal_id}/lab_results")
def add_lab_result(animal_id: int, data: dict, db: Session = Depends(get_db)):
    from datetime import datetime
    item = LabResult(
        animal_id=animal_id,
        date=datetime.strptime(data['date'], "%Y-%m-%d").date() if data.get('date') else datetime.utcnow().date(),
        title=data.get('title'),
        document_url=data['document_url']
    )
    db.add(item)
    db.commit()
    return item

from fastapi import UploadFile, File
import os
import uuid

@router.post("/{animal_id}/lab_results/upload")
def upload_lab_result(animal_id: int, laboratory_id: int, file: UploadFile = File(...), date: str = None, db: Session = Depends(get_db)):
    from datetime import datetime
    
    # Save file
    uploads_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads", "labs")
    os.makedirs(uploads_dir, exist_ok=True)
    
    file_ext = os.path.splitext(file.filename)[1]
    filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(uploads_dir, filename)
    
    with open(file_path, "wb") as f:
        f.write(file.file.read())
        
    document_url = f"/uploads/labs/{filename}"
    
    item = LabResult(
        animal_id=animal_id,
        date=datetime.strptime(date, "%Y-%m-%d").date() if date else datetime.utcnow().date(),
        laboratory_id=laboratory_id,
        document_url=document_url
    )
    db.add(item)
    db.commit()
    return item
