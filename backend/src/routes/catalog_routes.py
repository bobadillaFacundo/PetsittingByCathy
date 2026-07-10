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

from src.services.tag_helpers import load_tag_sets, tag_set_to_dict, set_tag_variants, parse_csv_values

@router.get("/tagsets")
def get_tagsets(db: Session = Depends(get_db)):
    return [tag_set_to_dict(t) for t in load_tag_sets(db)]

@router.post("/tagsets")
def create_tagset(data: catalog_dto.TagSetCreate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    new_item = TagSet(name=data.name)
    db.add(new_item)
    db.flush()
    set_tag_variants(db, new_item, parse_csv_values(data.variants))
    db.commit()
    db.refresh(new_item)
    return tag_set_to_dict(new_item)

@router.put("/tagsets/{item_id}")
def update_tagset(item_id: int, data: catalog_dto.TagSetUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(TagSet).filter(TagSet.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    set_tag_variants(db, item, parse_csv_values(data.variants))
    db.commit()
    db.refresh(item)
    return tag_set_to_dict(item)

@router.delete("/tagsets/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tagset(item_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(TagSet).filter(TagSet.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return None

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


# --- COLOR RULES ---
from src.services.tag_helpers import load_color_rules, color_rule_to_dict, set_color_keywords, parse_csv_values

@router.get("/color-rules")
def get_color_rules(db: Session = Depends(get_db)):
    rules = load_color_rules(db)
    if not rules:
        defaults = [
            ("red", "exact", ["no", "nada", "ninguno"]),
            ("red", "partial", ["sangre", "líquido", "diarrea", "vomito"]),
            ("yellow", "exact", ["poco", "un poco", "mitad", "regular", "blanda"]),
            ("yellow", "partial", ["observación", "observacion"]),
        ]
        for color, match_type, keywords in defaults:
            rule = ColorRule(color=color, match_type=match_type)
            db.add(rule)
            db.flush()
            set_color_keywords(db, rule, keywords)
        db.commit()
        rules = load_color_rules(db)
    return [color_rule_to_dict(r) for r in rules]

@router.put("/color-rules/{item_id}")
def update_color_rule(item_id: int, data: catalog_dto.ColorRuleUpdate, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    item = db.query(ColorRule).filter(ColorRule.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    set_color_keywords(db, item, parse_csv_values(data.keywords))
    db.commit()
    db.refresh(item)
    return color_rule_to_dict(item)
