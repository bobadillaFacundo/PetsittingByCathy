import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'src')))

from sqlalchemy.orm import Session
from src.database.session import SessionLocal
from src.models.models import Animal

db = SessionLocal()
animals = db.query(Animal).all()

print(f"Total animals: {len(animals)}")
for a in animals:
    print(f"ID: {a.id}, Name: {a.name}, Species: {a.species_id}, is_active: {a.is_active}, is_daycare: {a.is_daycare}")
db.close()
