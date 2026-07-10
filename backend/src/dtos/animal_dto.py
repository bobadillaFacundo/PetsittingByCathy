from pydantic import BaseModel, model_validator
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
    is_daycare: bool = True

    coat_color: Optional[str] = None
    is_rescue: bool = False
    age_years: Optional[float] = None
    age_estimate_min: Optional[float] = None
    age_estimate_max: Optional[float] = None
    is_simil_breed: bool = False

    is_blind: bool = False
    is_deaf: bool = False
    no_smell: bool = False
    has_neurological: bool = False
    has_involuntary_movements: bool = False

    @model_validator(mode="after")
    def validate_age_fields(self):
        if self.is_rescue:
            amin = self.age_estimate_min
            amax = self.age_estimate_max
            if amin is not None and amax is not None and amin > amax:
                raise ValueError("El rango de edad estimado es inválido (mínimo > máximo)")
        return self


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
    is_daycare: Optional[bool] = None

    coat_color: Optional[str] = None
    is_rescue: Optional[bool] = None
    age_years: Optional[float] = None
    age_estimate_min: Optional[float] = None
    age_estimate_max: Optional[float] = None
    is_simil_breed: Optional[bool] = None

    is_blind: Optional[bool] = None
    is_deaf: Optional[bool] = None
    no_smell: Optional[bool] = None
    has_neurological: Optional[bool] = None
    has_involuntary_movements: Optional[bool] = None


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


class AttachmentDTO(BaseModel):
    id: int
    file_url: str
    file_type: str


class ReportHistoryDTO(BaseModel):
    id: int
    created_at: datetime
    transcript: Optional[str] = None
    user_name: str
    events: List[EventDTO]
    attachments: List[AttachmentDTO] = []


class AnimalHistoryResponse(BaseModel):
    animal: AnimalResponse
    reports: List[ReportHistoryDTO]
