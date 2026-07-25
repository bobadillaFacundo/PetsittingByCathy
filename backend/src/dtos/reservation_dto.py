from pydantic import BaseModel, field_serializer
from typing import Optional
from datetime import datetime
from src.dtos.animal_dto import AnimalResponse
from src.timezone_ar import to_ar_naive, serialize_ar_datetime

class ReservationBase(BaseModel):
    animal_id: Optional[int] = None
    species_id: Optional[int] = None
    start_date: datetime
    end_date: datetime
    status: Optional[str] = "Pendiente"
    notes: Optional[str] = None
    belongings_photos: Optional[str] = None

    @field_serializer("start_date", "end_date")
    def serialize_dates(self, v: datetime) -> str:
        return serialize_ar_datetime(v)

class ReservationCreate(ReservationBase):
    pass

class ReservationUpdate(BaseModel):
    animal_id: Optional[int] = None
    species_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    belongings_photos: Optional[str] = None

class SpeciesBrief(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True

class ReservationResponse(ReservationBase):
    id: int
    animal: Optional[AnimalResponse] = None
    species: Optional[SpeciesBrief] = None

    class Config:
        from_attributes = True
