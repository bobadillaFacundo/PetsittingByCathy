from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.exc import SQLAlchemyError
import os
import json
import traceback
import uuid
from typing import List

from src.database.session import get_db
from src.models.models import Reservation, Animal
from src.dtos.reservation_dto import (
    ReservationCreate,
    ReservationUpdate,
    ReservationResponse,
    reservation_to_response,
)
from src.auth import get_current_user
from src.timezone_ar import to_ar_naive
from src.services.recurrence import (
    MAX_OCCURRENCES,
    RECURRENCE_NONE,
    VALID_RECURRENCES,
    build_occurrences,
    exceeds_max,
)

router = APIRouter(prefix="/reservations", tags=["Reservations"])

DAYCARE_RESERVATION_STATUSES = {
    "Pendiente",
    "Confirmada",
    "Ingresada",
    "Finalizada",
    "Cancelada",
}

SERVICE_STATUSES = {
    "Llevar Veterinaria",
    "Viene Veterinaria",
    "Llevar a Bañar",
    "Otras actividades",
}

OTHER_ACTIVITY_STATUS = "Otras actividades"


def _validate_reservation_animal(db: Session, animal_id: int, status: str):
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal or animal.is_active is False:
        raise HTTPException(status_code=404, detail="Mascota no encontrada")
    if status in DAYCARE_RESERVATION_STATUSES and animal.is_daycare is True:
        raise HTTPException(
            status_code=400,
            detail="Las reservas solo se pueden asignar a mascotas externas.",
        )
    if status in SERVICE_STATUSES and animal.is_daycare is not True:
        raise HTTPException(
            status_code=400,
            detail="Vet / Baño / otras actividades solo se puede asignar a mascotas de guardería.",
        )
    return animal


def _get_reservation_query(db: Session):
    return db.query(Reservation).options(
        selectinload(Reservation.animal).selectinload(Animal.care_profile),
        selectinload(Reservation.animal).selectinload(Animal.species),
        selectinload(Reservation.animal).selectinload(Animal.breed),
        selectinload(Reservation.species),
    )


def _validate_status_value(status_val: str) -> None:
    if status_val not in DAYCARE_RESERVATION_STATUSES and status_val not in SERVICE_STATUSES:
        raise HTTPException(status_code=400, detail="Estado de evento no válido")


def _validate_status_transition(current_status: str, new_status: str | None) -> None:
    if new_status is None:
        return
    _validate_status_value(new_status)
    if current_status in SERVICE_STATUSES:
        if new_status != current_status:
            raise HTTPException(
                status_code=400,
                detail=f"Este evento es «{current_status}» y no puede cambiarse a otro tipo.",
            )
        return
    if new_status in SERVICE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="No se puede convertir una reserva de estadía en vet, baño u otra actividad.",
        )


def _validate_reservation_data(db: Session, data: dict, *, is_update: bool = False) -> None:
    status_val = data.get("status") or "Pendiente"
    _validate_status_value(status_val)
    animal_id = data.get("animal_id")
    notes = (data.get("notes") or "").strip()

    if status_val == OTHER_ACTIVITY_STATUS:
        if not notes:
            raise HTTPException(status_code=400, detail="La descripción de la actividad es obligatoria")
        if animal_id is not None:
            _validate_reservation_animal(db, animal_id, status_val)
        return

    if animal_id is None:
        raise HTTPException(status_code=400, detail="Debes seleccionar una mascota")
    _validate_reservation_animal(db, animal_id, status_val)


def _normalize_reservation_payload(data: dict) -> dict:
    if "start_date" in data and data["start_date"] is not None:
        data["start_date"] = to_ar_naive(data["start_date"])
    if "end_date" in data and data["end_date"] is not None:
        data["end_date"] = to_ar_naive(data["end_date"])
    if "recurrence" in data:
        rec = (data.get("recurrence") or RECURRENCE_NONE).strip().lower()
        data["recurrence"] = rec if rec in VALID_RECURRENCES else RECURRENCE_NONE
    return data


def _validate_recurrence(data: dict) -> None:
    rec = data.get("recurrence") or RECURRENCE_NONE
    until = data.get("recurrence_until")
    if rec == RECURRENCE_NONE:
        data["recurrence_until"] = None
        data["series_id"] = None
        return
    if until is None:
        raise HTTPException(
            status_code=400,
            detail="Indicá hasta cuándo se repite la actividad.",
        )
    start = data["start_date"]
    if until < start.date():
        raise HTTPException(
            status_code=400,
            detail="La fecha de fin de la serie no puede ser anterior al inicio.",
        )
    if exceeds_max(start, rec, until):
        raise HTTPException(
            status_code=400,
            detail=f"La serie supera el máximo de {MAX_OCCURRENCES[rec]} repeticiones. Acortá la fecha 'hasta'.",
        )


def _db_error_detail(exc: SQLAlchemyError) -> str:
    err = str(getattr(exc, "orig", exc)).lower()
    if any(k in err for k in ("animal_id", "species_id", "recurrence", "series_id", "null value", "not-null", "does not exist", "undefinedcolumn")):
        return (
            "No se pudo guardar la actividad. "
            "Reiniciá el backend en Render para aplicar la migración de base de datos."
        )
    return "No se pudo guardar la reserva. Verificá los datos."


@router.post("", response_model=ReservationResponse)
def create_reservation(
    reservation: ReservationCreate,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    data = _normalize_reservation_payload(reservation.model_dump())
    _validate_reservation_data(db, data)
    _validate_recurrence(data)

    occurrences = build_occurrences(
        data["start_date"],
        data["end_date"],
        data.get("recurrence"),
        data.get("recurrence_until"),
    )
    series_id = uuid.uuid4().hex if len(occurrences) > 1 else None

    created = []
    for occ_start, occ_end in occurrences:
        row = Reservation(
            **{
                **data,
                "start_date": occ_start,
                "end_date": occ_end,
                "series_id": series_id,
            }
        )
        db.add(row)
        created.append(row)

    try:
        db.flush()
        db.commit()
        for row in created:
            db.refresh(row)
    except SQLAlchemyError as exc:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=_db_error_detail(exc)) from exc

    return reservation_to_response(created[0])


@router.get("", response_model=List[ReservationResponse])
def get_reservations(db: Session = Depends(get_db), current_admin=Depends(get_current_user)):
    rows = _get_reservation_query(db).all()
    return [reservation_to_response(row) for row in rows]


@router.put("/{reservation_id}", response_model=ReservationResponse)
def update_reservation(
    reservation_id: int,
    reservation_update: ReservationUpdate,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    db_reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not db_reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")

    update_data = reservation_update.model_dump(exclude_unset=True)
    update_data = _normalize_reservation_payload(update_data)
    if "status" in update_data:
        _validate_status_transition(db_reservation.status, update_data["status"])
    _validate_reservation_data(
        db,
        {
            "status": update_data.get("status", db_reservation.status),
            "animal_id": update_data.get("animal_id", db_reservation.animal_id),
            "notes": update_data.get("notes", db_reservation.notes),
            "species_id": update_data.get("species_id", db_reservation.species_id),
        },
        is_update=True,
    )

    for key, value in update_data.items():
        setattr(db_reservation, key, value)

    try:
        db.commit()
        db.refresh(db_reservation)
    except SQLAlchemyError as exc:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=_db_error_detail(exc)) from exc

    row = _get_reservation_query(db).filter(Reservation.id == reservation_id).first()
    return reservation_to_response(row or db_reservation)


@router.delete("/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reservation(
    reservation_id: int,
    scope: str = Query("one", description="one = solo esta; following = esta y las siguientes de la serie"),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    db_reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not db_reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")

    if scope == "following" and db_reservation.series_id:
        (
            db.query(Reservation)
            .filter(
                Reservation.series_id == db_reservation.series_id,
                Reservation.start_date >= db_reservation.start_date,
            )
            .delete(synchronize_session=False)
        )
    else:
        db.delete(db_reservation)
    db.commit()
    return None


@router.post("/{reservation_id}/photos")
async def upload_reservation_photos(
    reservation_id: int,
    photos: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    db_reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not db_reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")

    uploaded_urls = []

    if db_reservation.belongings_photos:
        try:
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

    db_reservation.belongings_photos = json.dumps(uploaded_urls)
    db.commit()
    db.refresh(db_reservation)

    return {"status": "success", "belongings_photos": uploaded_urls}
