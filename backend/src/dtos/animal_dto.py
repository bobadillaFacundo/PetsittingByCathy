from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime

class AnimalBase(BaseModel):
    name: str
    species_id: int
    veterinarian_id: Optional[int] = None
    birth_date: Optional[date] = None
    sex: Optional[str] = None
    photo_url: Optional[str] = None
    is_active: bool = True

class AnimalCreate(AnimalBase):
    pass

class AnimalResponse(AnimalBase):
    id: int

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
