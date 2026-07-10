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

# TagSet (AI Dictionaries)
class TagSetCreate(BaseModel):
    name: str
    variants: str

class TagSetUpdate(BaseModel):
    variants: str

class TagSetResponse(BaseModel):
    id: int
    name: str
    variants: str

    class Config:
        from_attributes = True

# ColorRule
class ColorRuleCreate(BaseModel):
    color: str
    match_type: str
    keywords: str

class ColorRuleUpdate(BaseModel):
    keywords: str

class ColorRuleResponse(BaseModel):
    id: int
    color: str
    match_type: str
    keywords: str

    class Config:
        from_attributes = True
