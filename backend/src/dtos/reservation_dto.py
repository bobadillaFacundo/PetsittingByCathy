from pydantic import BaseModel, ValidationError
from typing import Optional
from datetime import date, datetime
from src.dtos.animal_dto import AnimalResponse
from src.timezone_ar import serialize_ar_datetime


class ReservationCreate(BaseModel):
    animal_id: Optional[int] = None
    species_id: Optional[int] = None
    start_date: datetime
    end_date: datetime
    status: Optional[str] = "Pendiente"
    notes: Optional[str] = None
    belongings_photos: Optional[str] = None
    recurrence: Optional[str] = "none"
    recurrence_until: Optional[date] = None


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


class ReservationResponse(BaseModel):
    id: int
    animal_id: Optional[int] = None
    species_id: Optional[int] = None
    start_date: str
    end_date: str
    status: Optional[str] = None
    notes: Optional[str] = None
    belongings_photos: Optional[str] = None
    recurrence: Optional[str] = "none"
    recurrence_until: Optional[date] = None
    series_id: Optional[str] = None
    animal: Optional[AnimalResponse] = None
    species: Optional[SpeciesBrief] = None

    class Config:
        from_attributes = True


def reservation_to_response(row) -> ReservationResponse:
    """Construye respuesta API sin depender de field_serializer ni joinedload frágil."""
    animal = None
    if getattr(row, "animal", None) is not None:
        try:
            animal = AnimalResponse.model_validate(row.animal)
        except ValidationError:
            animal = None

    species = None
    if getattr(row, "species", None) is not None:
        try:
            species = SpeciesBrief.model_validate(row.species)
        except ValidationError:
            species = None

    return ReservationResponse(
        id=row.id,
        animal_id=row.animal_id,
        species_id=row.species_id,
        start_date=serialize_ar_datetime(row.start_date),
        end_date=serialize_ar_datetime(row.end_date),
        status=row.status,
        notes=row.notes,
        belongings_photos=row.belongings_photos,
        recurrence=getattr(row, "recurrence", None) or "none",
        recurrence_until=getattr(row, "recurrence_until", None),
        series_id=getattr(row, "series_id", None),
        animal=animal,
        species=species,
    )
