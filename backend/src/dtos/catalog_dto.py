from pydantic import BaseModel
from typing import Optional

class BaseCatalogCreate(BaseModel):
    name: str

class BaseCatalogUpdate(BaseModel):
    name: str

class BaseCatalogResponse(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True

# Breed
class BreedCreate(BaseModel):
    name: str
    species_id: int

class BreedUpdate(BaseModel):
    name: str
    species_id: int

class BreedResponse(BaseModel):
    id: int
    name: str
    species_id: int

    class Config:
        from_attributes = True

# VeterinaryProduct
class VeterinaryProductCreate(BaseModel):
    name: str
    type: str # INTERNAL or EXTERNAL

class VeterinaryProductUpdate(BaseModel):
    name: str
    type: str

class VeterinaryProductResponse(BaseModel):
    id: int
    name: str
    type: str

    class Config:
        from_attributes = True

# Veterinarian
class VeterinarianCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None

class VeterinarianUpdate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None

class VeterinarianResponse(BaseModel):
    id: int
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None

    class Config:
        from_attributes = True
