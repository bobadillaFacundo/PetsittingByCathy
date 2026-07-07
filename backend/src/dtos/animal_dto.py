from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime

class AnimalBase(BaseModel):
    name: str
    species_id: int
    breed_id: Optional[int] = None
    veterinarian_id: Optional[int] = None
    birth_date: Optional[date] = None
    sex: Optional[str] = None
    is_castrated: bool = False
    photo_url: Optional[str] = None
    is_active: bool = True

class AnimalCreate(AnimalBase):
    pass

class AnimalUpdate(BaseModel):
    name: Optional[str] = None
    species_id: Optional[int] = None
    breed_id: Optional[int] = None
    veterinarian_id: Optional[int] = None
    birth_date: Optional[date] = None
    sex: Optional[str] = None
    is_castrated: Optional[bool] = None
    photo_url: Optional[str] = None
    is_active: Optional[bool] = None

class AnimalResponse(AnimalBase):
    id: int

    class Config:
        from_attributes = True

class BreedResponse(BaseModel):
    id: int
    name: str
    species_id: int

    class Config:
        from_attributes = True

class InternalDewormingResponse(BaseModel):
    id: int
    date: date
    product_name: str
    next_due_date: Optional[date] = None

    class Config:
        from_attributes = True

class ExternalDewormingResponse(BaseModel):
    id: int
    date: date
    product_name: str
    next_due_date: Optional[date] = None

    class Config:
        from_attributes = True

class LabResultResponse(BaseModel):
    id: int
    date: date
    document_url: str
    title: Optional[str] = None

    class Config:
        from_attributes = True

class EventDTO(BaseModel):
    type: str
    value: Optional[str] = None

class ReportHistoryDTO(BaseModel):
    id: int
    created_at: datetime
    transcript: Optional[str] = None
    user_name: str
    events: List[EventDTO]

class AnimalHistoryResponse(BaseModel):
    animal: AnimalResponse
    reports: List[ReportHistoryDTO]
