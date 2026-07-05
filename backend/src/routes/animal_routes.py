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
