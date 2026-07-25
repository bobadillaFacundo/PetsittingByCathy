from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from src.database.session import get_db
from src.models.models import Reservation, Animal
from src.dtos.reservation_dto import ReservationCreate, ReservationUpdate, ReservationResponse
from src.auth import get_current_user
from src.timezone_ar import to_ar_naive
from typing import List

router = APIRouter(prefix="/reservations", tags=["Reservations"])

# Reservas de estadía: solo mascotas externas
DAYCARE_RESERVATION_STATUSES = {
    "Pendiente",
    "Confirmada",
    "Ingresada",
    "Finalizada",
    "Cancelada",
}

# Vet / baño: solo mascotas de guardería
SERVICE_STATUSES = {
    "Llevar Veterinaria",
    "Viene Veterinaria",
    "Llevar a Bañar",
}


def _validate_reservation_animal(db: Session, animal_id: int, status: str):
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal or not animal.is_active:
        raise HTTPException(status_code=404, detail="Mascota no encontrada")
    # Nueva Reserva / estadía → solo externas
    if status in DAYCARE_RESERVATION_STATUSES and animal.is_daycare:
        raise HTTPException(
            status_code=400,
            detail="Las reservas solo se pueden asignar a mascotas externas.",
        )
    # Vet / baño → solo guardería
    if status in SERVICE_STATUSES and not animal.is_daycare:
        raise HTTPException(
            status_code=400,
            detail="Vet / Baño solo se puede asignar a mascotas de guardería.",
        )
    return animal


def _normalize_reservation_payload(data: dict) -> dict:
    if "start_date" in data and data["start_date"] is not None:
        data["start_date"] = to_ar_naive(data["start_date"])
    if "end_date" in data and data["end_date"] is not None:
        data["end_date"] = to_ar_naive(data["end_date"])
    return data


@router.post("/", response_model=ReservationResponse)
def create_reservation(reservation: ReservationCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    status_val = reservation.status or "Pendiente"
    _validate_reservation_animal(db, reservation.animal_id, status_val)
    data = _normalize_reservation_payload(reservation.model_dump())
    db_reservation = Reservation(**data)
    db.add(db_reservation)
    db.commit()
    db.refresh(db_reservation)
    return db.query(Reservation).options(joinedload(Reservation.animal)).filter(Reservation.id == db_reservation.id).first()


@router.get("/", response_model=List[ReservationResponse])
def get_reservations(db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    reservations = db.query(Reservation).options(joinedload(Reservation.animal)).all()
    return reservations


@router.put("/{reservation_id}", response_model=ReservationResponse)
def update_reservation(reservation_id: int, reservation_update: ReservationUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    db_reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not db_reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")

    update_data = reservation_update.model_dump(exclude_unset=True)
    update_data = _normalize_reservation_payload(update_data)
    animal_id = update_data.get("animal_id", db_reservation.animal_id)
    status_val = update_data.get("status", db_reservation.status) or "Pendiente"
    _validate_reservation_animal(db, animal_id, status_val)

    for key, value in update_data.items():
        setattr(db_reservation, key, value)

    db.commit()
    db.refresh(db_reservation)
    return db.query(Reservation).options(joinedload(Reservation.animal)).filter(Reservation.id == reservation_id).first()


@router.delete("/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reservation(reservation_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    db_reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not db_reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")

    db.delete(db_reservation)
    db.commit()
    return None

from fastapi import UploadFile, File
import os
import uuid
from typing import List

@router.post("/{reservation_id}/photos")
async def upload_reservation_photos(
    reservation_id: int,
    photos: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_user)
):
    db_reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not db_reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")

    uploaded_urls = []
    
    if db_reservation.belongings_photos:
        try:
            import json
            uploaded_urls = json.loads(db_reservation.belongings_photos)
        except Exception:
            if db_reservation.belongings_photos.strip():
                uploaded_urls = [db_reservation.belongings_photos]

    allowed = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    from src.services.storage_service import upload_bytes
    for photo in photos:
        ext = os.path.splitext(photo.filename or "photo.jpg")[1].lower()
        if ext not in allowed:
            continue
            
        content = await photo.read()
        file_url = upload_bytes(
            content,
            folder="photos",
            original_filename=photo.filename or f"photo{ext}",
            content_type=photo.content_type,
        )
        uploaded_urls.append(file_url)

    import json
    db_reservation.belongings_photos = json.dumps(uploaded_urls)
    db.commit()
    db.refresh(db_reservation)
    
    return {"status": "success", "belongings_photos": uploaded_urls}

