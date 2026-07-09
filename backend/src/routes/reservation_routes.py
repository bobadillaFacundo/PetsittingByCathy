from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from src.database.session import get_db
from src.models.models import Reservation
from src.dtos.reservation_dto import ReservationCreate, ReservationUpdate, ReservationResponse
from src.auth import get_current_user
from typing import List

router = APIRouter(prefix="/reservations", tags=["Reservations"])

@router.post("/", response_model=ReservationResponse)
def create_reservation(reservation: ReservationCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    db_reservation = Reservation(**reservation.model_dump())
    db.add(db_reservation)
    db.commit()
    db.refresh(db_reservation)
    return db_reservation

@router.get("/", response_model=List[ReservationResponse])
def get_reservations(db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    # joinedload para traer la entidad Animal si es necesario
    from sqlalchemy.orm import joinedload
    reservations = db.query(Reservation).options(joinedload(Reservation.animal)).all()
    return reservations

@router.put("/{reservation_id}", response_model=ReservationResponse)
def update_reservation(reservation_id: int, reservation_update: ReservationUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    db_reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not db_reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    
    update_data = reservation_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_reservation, key, value)
        
    db.commit()
    db.refresh(db_reservation)
    return db_reservation

@router.delete("/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reservation(reservation_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    db_reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not db_reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    
    db.delete(db_reservation)
    db.commit()
    return None
