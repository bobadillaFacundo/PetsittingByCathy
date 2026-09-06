from pydantic import BaseModel, model_validator, field_validator
from typing import Optional, List, Any
from datetime import date, datetime

CARE_PROFILE_FIELDS = (
    "is_escapist", "has_attachment_issues", "dog_sociability", "needs_medication",
    "needs_diapers", "needs_isolation", "needs_muzzle", "has_special_diet",
    "care_notes", "housing_type", "aversive_to_people", "aversive_to_dogs",
    "has_bitten_people", "has_bitten_dogs", "bites_often", "lives_with_dogs",
    "lives_with_dogs_count", "plays_with_dogs", "familiar_with_animals", "fears",
    "destroys_things", "destroys_what", "likes_water", "likes_pool", "food_brand",
    "food_amount", "food_times_per_day", "special_diet_details", "intake_vaccines",
    "intake_dewormed_internal", "intake_dewormed_external", "intake_medication",
    "allergies", "health_issues", "walks_outside_neighborhood", "contact_name",
    "contact_phone", "contact_email", "contact_notes",
)


def split_care_profile(data: dict) -> tuple[dict, dict]:
    animal = {k: v for k, v in data.items() if k not in CARE_PROFILE_FIELDS}
    care = {k: v for k, v in data.items() if k in CARE_PROFILE_FIELDS}
    return animal, care


def merge_care_profile(animal: Any) -> dict:
    payload = {col.name: getattr(animal, col.name) for col in animal.__table__.columns}
    profile = getattr(animal, "care_profile", None)
    for name in CARE_PROFILE_FIELDS:
        payload[name] = getattr(profile, name, None) if profile is not None else None
    species = getattr(animal, "species", None)
    breed = getattr(animal, "breed", None)
    payload["species_name"] = species.name if species is not None and getattr(species, "name", None) else None
    payload["breed_name"] = breed.name if breed is not None and getattr(breed, "name", None) else None
    return payload


class AnimalBase(BaseModel):
    name: str
    species_id: int
    breed_id: Optional[int] = None
    veterinarian_id: Optional[int] = None
    birth_date: Optional[date] = None
    sex: Optional[str] = None
    is_castrated: bool = False
    weight_kg: Optional[float] = None
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

    is_escapist: bool = False
    has_attachment_issues: bool = False
    dog_sociability: Optional[str] = None
    needs_medication: bool = False
    needs_diapers: bool = False
    needs_isolation: bool = False
    needs_muzzle: bool = False
    has_special_diet: bool = False
    care_notes: Optional[str] = None

    housing_type: Optional[str] = None
    aversive_to_people: bool = False
    aversive_to_dogs: bool = False
    has_bitten_people: bool = False
    has_bitten_dogs: bool = False
    bites_often: bool = False
    lives_with_dogs: bool = False
    lives_with_dogs_count: Optional[int] = None
    plays_with_dogs: bool = False
    familiar_with_animals: Optional[str] = None
    fears: Optional[str] = None
    destroys_things: bool = False
    destroys_what: Optional[str] = None
    likes_water: bool = False
    likes_pool: bool = False
    food_brand: Optional[str] = None
    food_amount: Optional[str] = None
    food_times_per_day: Optional[str] = None
    special_diet_details: Optional[str] = None
    intake_vaccines: Optional[str] = None
    intake_dewormed_internal: bool = False
    intake_dewormed_external: bool = False
    intake_medication: Optional[str] = None
    allergies: Optional[str] = None
    health_issues: Optional[str] = None
    walks_outside_neighborhood: bool = False
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    contact_notes: Optional[str] = None

    residence: Optional[str] = None

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
    weight_kg: Optional[float] = None
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

    is_escapist: Optional[bool] = None
    has_attachment_issues: Optional[bool] = None
    dog_sociability: Optional[str] = None
    needs_medication: Optional[bool] = None
    needs_diapers: Optional[bool] = None
    needs_isolation: Optional[bool] = None
    needs_muzzle: Optional[bool] = None
    has_special_diet: Optional[bool] = None
    care_notes: Optional[str] = None

    housing_type: Optional[str] = None
    aversive_to_people: Optional[bool] = None
    aversive_to_dogs: Optional[bool] = None
    has_bitten_people: Optional[bool] = None
    has_bitten_dogs: Optional[bool] = None
    bites_often: Optional[bool] = None
    lives_with_dogs: Optional[bool] = None
    lives_with_dogs_count: Optional[int] = None
    plays_with_dogs: Optional[bool] = None
    familiar_with_animals: Optional[str] = None
    fears: Optional[str] = None
    destroys_things: Optional[bool] = None
    destroys_what: Optional[str] = None
    likes_water: Optional[bool] = None
    likes_pool: Optional[bool] = None
    food_brand: Optional[str] = None
    food_amount: Optional[str] = None
    food_times_per_day: Optional[str] = None
    special_diet_details: Optional[str] = None
    intake_vaccines: Optional[str] = None
    intake_dewormed_internal: Optional[bool] = None
    intake_dewormed_external: Optional[bool] = None
    intake_medication: Optional[str] = None
    allergies: Optional[str] = None
    health_issues: Optional[str] = None
    walks_outside_neighborhood: Optional[bool] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    contact_notes: Optional[str] = None
    
    residence: Optional[str] = None


class AnimalResponse(AnimalBase):
    id: int
    species_name: Optional[str] = None
    breed_name: Optional[str] = None

    _BOOL_FIELDS = (
        "is_castrated", "is_rescue", "is_simil_breed", "is_blind", "is_deaf",
        "no_smell", "has_neurological", "has_involuntary_movements",
        "is_active", "is_daycare",
        "is_escapist", "has_attachment_issues", "needs_medication",
        "needs_diapers", "needs_isolation", "needs_muzzle", "has_special_diet",
        "aversive_to_people", "aversive_to_dogs", "has_bitten_people",
        "has_bitten_dogs", "bites_often", "lives_with_dogs", "plays_with_dogs",
        "destroys_things", "likes_water", "likes_pool",
        "intake_dewormed_internal", "intake_dewormed_external",
        "walks_outside_neighborhood",
    )

    @field_validator(*_BOOL_FIELDS, mode="before")
    @classmethod
    def null_bool_to_false(cls, v):
        return False if v is None else v

    @model_validator(mode="wrap")
    @classmethod
    def attach_related_names(cls, data, handler):
        if hasattr(data, "__table__") and hasattr(data, "id"):
            data = merge_care_profile(data)
        return handler(data)

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


class ObservationDTO(BaseModel):
    id: int
    observation: str
    created_at: datetime
    report_id: Optional[int] = None
    user_name: Optional[str] = None
    attachments: List[AttachmentDTO] = []


class ObservationCreate(BaseModel):
    observation: str
    report_id: Optional[int] = None


class ReportHistoryDTO(BaseModel):
    id: int
    created_at: datetime
    transcript: Optional[str] = None
    user_name: str
    events: List[EventDTO]
    attachments: List[AttachmentDTO] = []


class WeightHistoryDTO(BaseModel):
    id: Optional[int] = None
    kg: float
    recorded_at: Optional[str] = None
    source: str = "ficha"
    report_id: Optional[int] = None


class AnimalHistoryResponse(BaseModel):
    animal: AnimalResponse
    reports: List[ReportHistoryDTO]
    observations: List[ObservationDTO] = []
    active_medications: List['AnimalMedicationResponse'] = []
    weight_history: List[WeightHistoryDTO] = []

class AnimalMedicationResponse(BaseModel):
    id: int
    medication_id: int
    medication_name: str
    dosage: str
    frequency: str
    is_current: bool
    amount_per_day: Optional[str] = None
    duration_days: Optional[int] = None
    is_forever: bool = False
    schedules: List[str] = []

    class Config:
        from_attributes = True

class AnimalMedicationCreate(BaseModel):
    medication_name: str
    dosage: str
    frequency: str
    is_current: bool = True
    amount_per_day: Optional[str] = None
    duration_days: Optional[int] = None
    is_forever: bool = False
    schedules: List[str] = []

class AnimalMedicationUpdate(BaseModel):
    medication_name: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    is_current: Optional[bool] = None
    amount_per_day: Optional[str] = None
    duration_days: Optional[int] = None
    is_forever: Optional[bool] = None
    schedules: Optional[List[str]] = None
