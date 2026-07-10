from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from src.database.session import get_db
from src.models.models import Species, Breed, LaboratoryCatalog, VaccineCatalog, VeterinaryProduct, Veterinarian, TagSet, ColorRule
from src.dtos import catalog_dto
from src.auth import get_current_user

router = APIRouter(prefix="/catalogs", tags=["Catalogs"])

# --- SPECIES ---
@router.get("/species", response_model=list[catalog_dto.BaseCatalogResponse])
def get_species(db: Session = Depends(get_db)):
    return db.query(Species).all()

@router.post("/species", response_model=catalog_dto.BaseCatalogResponse)
def create_species(data: catalog_dto.BaseCatalogCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    new_item = Species(name=data.name)
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@router.put("/species/{item_id}", response_model=catalog_dto.BaseCatalogResponse)
def update_species(item_id: int, data: catalog_dto.BaseCatalogUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(Species).filter(Species.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    item.name = data.name
    db.commit()
    db.refresh(item)
    return item

@router.delete("/species/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_species(item_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(Species).filter(Species.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return None

# --- BREEDS ---
@router.get("/breeds", response_model=list[catalog_dto.BreedResponse])
def get_breeds(species_id: int = None, db: Session = Depends(get_db)):
    query = db.query(Breed)
    if species_id:
        query = query.filter(Breed.species_id == species_id)
    return query.all()

@router.post("/breeds", response_model=catalog_dto.BreedResponse)
def create_breed(data: catalog_dto.BreedCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    new_item = Breed(name=data.name, species_id=data.species_id)
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@router.put("/breeds/{item_id}", response_model=catalog_dto.BreedResponse)
def update_breed(item_id: int, data: catalog_dto.BreedUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(Breed).filter(Breed.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    item.name = data.name
    item.species_id = data.species_id
    db.commit()
    db.refresh(item)
    return item

@router.delete("/breeds/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_breed(item_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(Breed).filter(Breed.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return None

# --- LABORATORIES ---
@router.get("/laboratories", response_model=list[catalog_dto.BaseCatalogResponse])
def get_laboratories(db: Session = Depends(get_db)):
    return db.query(LaboratoryCatalog).all()

@router.post("/laboratories", response_model=catalog_dto.BaseCatalogResponse)
def create_laboratory(data: catalog_dto.BaseCatalogCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    new_item = LaboratoryCatalog(name=data.name)
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@router.put("/laboratories/{item_id}", response_model=catalog_dto.BaseCatalogResponse)
def update_laboratory(item_id: int, data: catalog_dto.BaseCatalogUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(LaboratoryCatalog).filter(LaboratoryCatalog.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    item.name = data.name
    db.commit()
    db.refresh(item)
    return item

@router.delete("/laboratories/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_laboratory(item_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(LaboratoryCatalog).filter(LaboratoryCatalog.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return None

# --- VACCINES ---
@router.get("/vaccines", response_model=list[catalog_dto.BaseCatalogResponse])
def get_vaccines(db: Session = Depends(get_db)):
    return db.query(VaccineCatalog).all()

@router.post("/vaccines", response_model=catalog_dto.BaseCatalogResponse)
def create_vaccine(data: catalog_dto.BaseCatalogCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    new_item = VaccineCatalog(name=data.name)
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@router.put("/vaccines/{item_id}", response_model=catalog_dto.BaseCatalogResponse)
def update_vaccine(item_id: int, data: catalog_dto.BaseCatalogUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(VaccineCatalog).filter(VaccineCatalog.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    item.name = data.name
    db.commit()
    db.refresh(item)
    return item

@router.delete("/vaccines/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vaccine(item_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(VaccineCatalog).filter(VaccineCatalog.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return None

# --- VETERINARY PRODUCTS ---
@router.get("/products", response_model=list[catalog_dto.VeterinaryProductResponse])
def get_products(db: Session = Depends(get_db)):
    return db.query(VeterinaryProduct).all()

@router.post("/products", response_model=catalog_dto.VeterinaryProductResponse)
def create_product(data: catalog_dto.VeterinaryProductCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    new_item = VeterinaryProduct(name=data.name, type=data.type)
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@router.put("/products/{item_id}", response_model=catalog_dto.VeterinaryProductResponse)
def update_product(item_id: int, data: catalog_dto.VeterinaryProductUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(VeterinaryProduct).filter(VeterinaryProduct.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    item.name = data.name
    item.type = data.type
    db.commit()
    db.refresh(item)
    return item

@router.delete("/products/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(item_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(VeterinaryProduct).filter(VeterinaryProduct.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return None

# --- VETERINARIANS ---
@router.get("/veterinarians", response_model=list[catalog_dto.VeterinarianResponse])
def get_veterinarians(db: Session = Depends(get_db)):
    return db.query(Veterinarian).all()

@router.post("/veterinarians", response_model=catalog_dto.VeterinarianResponse)
def create_veterinarian(data: catalog_dto.VeterinarianCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    new_item = Veterinarian(name=data.name, phone=data.phone, email=data.email)
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@router.put("/veterinarians/{item_id}", response_model=catalog_dto.VeterinarianResponse)
def update_veterinarian(item_id: int, data: catalog_dto.VeterinarianUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(Veterinarian).filter(Veterinarian.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    item.name = data.name
    item.phone = data.phone
    item.email = data.email
    db.commit()
    db.refresh(item)
    return item

@router.delete("/veterinarians/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_veterinarian(item_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(Veterinarian).filter(Veterinarian.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return None

# --- TAGSETS (AI DICTIONARIES) ---
@router.get("/tagsets", response_model=list[catalog_dto.TagSetResponse])
def get_tagsets(db: Session = Depends(get_db)):
    return db.query(TagSet).all()

@router.post("/tagsets", response_model=catalog_dto.TagSetResponse)
def create_tagset(data: catalog_dto.TagSetCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    new_item = TagSet(name=data.name, variants=data.variants)
# --- SPECIES ---
@router.get("/species", response_model=list[catalog_dto.BaseCatalogResponse])
def get_species(db: Session = Depends(get_db)):
    return db.query(Species).all()

@router.post("/species", response_model=catalog_dto.BaseCatalogResponse)
def create_species(data: catalog_dto.BaseCatalogCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    new_item = Species(name=data.name)
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@router.put("/species/{item_id}", response_model=catalog_dto.BaseCatalogResponse)
def update_species(item_id: int, data: catalog_dto.BaseCatalogUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(Species).filter(Species.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    item.name = data.name
    db.commit()
    db.refresh(item)
    return item

@router.delete("/species/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_species(item_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(Species).filter(Species.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return None

# --- BREEDS ---
@router.get("/breeds", response_model=list[catalog_dto.BreedResponse])
def get_breeds(species_id: int = None, db: Session = Depends(get_db)):
    query = db.query(Breed)
    if species_id:
        query = query.filter(Breed.species_id == species_id)
    return query.all()

@router.post("/breeds", response_model=catalog_dto.BreedResponse)
def create_breed(data: catalog_dto.BreedCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    new_item = Breed(name=data.name, species_id=data.species_id)
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@router.put("/breeds/{item_id}", response_model=catalog_dto.BreedResponse)
def update_breed(item_id: int, data: catalog_dto.BreedUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(Breed).filter(Breed.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    item.name = data.name
    item.species_id = data.species_id
    db.commit()
    db.refresh(item)
    return item

@router.delete("/breeds/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_breed(item_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(Breed).filter(Breed.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return None

# --- LABORATORIES ---
@router.get("/laboratories", response_model=list[catalog_dto.BaseCatalogResponse])
def get_laboratories(db: Session = Depends(get_db)):
    return db.query(LaboratoryCatalog).all()

@router.post("/laboratories", response_model=catalog_dto.BaseCatalogResponse)
def create_laboratory(data: catalog_dto.BaseCatalogCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    new_item = LaboratoryCatalog(name=data.name)
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@router.put("/laboratories/{item_id}", response_model=catalog_dto.BaseCatalogResponse)
def update_laboratory(item_id: int, data: catalog_dto.BaseCatalogUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(LaboratoryCatalog).filter(LaboratoryCatalog.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    item.name = data.name
    db.commit()
    db.refresh(item)
    return item

@router.delete("/laboratories/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_laboratory(item_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(LaboratoryCatalog).filter(LaboratoryCatalog.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return None

# --- VACCINES ---
@router.get("/vaccines", response_model=list[catalog_dto.BaseCatalogResponse])
def get_vaccines(db: Session = Depends(get_db)):
    return db.query(VaccineCatalog).all()

@router.post("/vaccines", response_model=catalog_dto.BaseCatalogResponse)
def create_vaccine(data: catalog_dto.BaseCatalogCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    new_item = VaccineCatalog(name=data.name)
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@router.put("/vaccines/{item_id}", response_model=catalog_dto.BaseCatalogResponse)
def update_vaccine(item_id: int, data: catalog_dto.BaseCatalogUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(VaccineCatalog).filter(VaccineCatalog.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    item.name = data.name
    db.commit()
    db.refresh(item)
    return item

@router.delete("/vaccines/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vaccine(item_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(VaccineCatalog).filter(VaccineCatalog.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return None

# --- VETERINARY PRODUCTS ---
@router.get("/products", response_model=list[catalog_dto.VeterinaryProductResponse])
def get_products(db: Session = Depends(get_db)):
    return db.query(VeterinaryProduct).all()

@router.post("/products", response_model=catalog_dto.VeterinaryProductResponse)
def create_product(data: catalog_dto.VeterinaryProductCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    new_item = VeterinaryProduct(name=data.name, type=data.type)
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@router.put("/products/{item_id}", response_model=catalog_dto.VeterinaryProductResponse)
def update_product(item_id: int, data: catalog_dto.VeterinaryProductUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(VeterinaryProduct).filter(VeterinaryProduct.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    item.name = data.name
    item.type = data.type
    db.commit()
    db.refresh(item)
    return item

@router.delete("/products/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(item_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(VeterinaryProduct).filter(VeterinaryProduct.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return None

# --- VETERINARIANS ---
@router.get("/veterinarians", response_model=list[catalog_dto.VeterinarianResponse])
def get_veterinarians(db: Session = Depends(get_db)):
    return db.query(Veterinarian).all()

@router.post("/veterinarians", response_model=catalog_dto.VeterinarianResponse)
def create_veterinarian(data: catalog_dto.VeterinarianCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    new_item = Veterinarian(name=data.name, phone=data.phone, email=data.email)
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@router.put("/veterinarians/{item_id}", response_model=catalog_dto.VeterinarianResponse)
def update_veterinarian(item_id: int, data: catalog_dto.VeterinarianUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(Veterinarian).filter(Veterinarian.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    item.name = data.name
    item.phone = data.phone
    item.email = data.email
    db.commit()
    db.refresh(item)
    return item

@router.delete("/veterinarians/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_veterinarian(item_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(Veterinarian).filter(Veterinarian.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return None

# --- TAGSETS (AI DICTIONARIES) ---
@router.get("/tagsets", response_model=list[catalog_dto.TagSetResponse])
def get_tagsets(db: Session = Depends(get_db)):
    return db.query(TagSet).all()

@router.post("/tagsets", response_model=catalog_dto.TagSetResponse)
def create_tagset(data: catalog_dto.TagSetCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    new_item = TagSet(name=data.name, variants=data.variants)
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@router.put("/tagsets/{item_id}", response_model=catalog_dto.TagSetResponse)
def update_tagset(item_id: int, data: catalog_dto.TagSetUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(TagSet).filter(TagSet.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    item.variants = data.variants
    db.commit()
    db.refresh(item)
    return item

@router.delete("/tagsets/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tagset(item_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(TagSet).filter(TagSet.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return None

# --- COLOR RULES ---
@router.get("/color-rules", response_model=list[catalog_dto.ColorRuleResponse])
def get_color_rules(db: Session = Depends(get_db)):
    rules = db.query(ColorRule).all()
    # Seed default rules if empty
    if not rules:
        default_rules = [
            ColorRule(color="red", match_type="exact", keywords="no, nada, ninguno"),
            ColorRule(color="red", match_type="partial", keywords="sangre, líquido, diarrea, vomito"),
            ColorRule(color="yellow", match_type="exact", keywords="poco, un poco, mitad, regular, blanda"),
            ColorRule(color="yellow", match_type="partial", keywords="observación, observacion")
        ]
        db.add_all(default_rules)
        db.commit()
        rules = db.query(ColorRule).all()
    return rules

@router.put("/color-rules/{item_id}", response_model=catalog_dto.ColorRuleResponse)
def update_color_rule(item_id: int, data: catalog_dto.ColorRuleUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(ColorRule).filter(ColorRule.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    item.keywords = data.keywords
    db.commit()
    db.refresh(item)
    return item
