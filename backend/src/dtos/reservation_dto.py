from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from src.dtos.animal_dto import AnimalResponse

class ReservationBase(BaseModel):
    animal_id: int
    start_date: datetime
    end_date: datetime
    status: Optional[str] = "Pendiente"
    notes: Optional[str] = None
    belongings_photos: Optional[str] = None

class ReservationCreate(ReservationBase):
    pass

class ReservationUpdate(BaseModel):
    animal_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    belongings_photos: Optional[str] = None

class ReservationResponse(ReservationBase):
    id: int
    animal: Optional[AnimalResponse] = None

    class Config:
        from_attributes = True
