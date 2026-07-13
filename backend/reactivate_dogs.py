import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'src')))

from sqlalchemy.orm import Session
from src.database.session import SessionLocal
from src.models.models import Animal

db = SessionLocal()
dogs = db.query(Animal).filter(Animal.species_id == 1, Animal.is_daycare == True, Animal.is_active == False).all()

count = 0
for dog in dogs:
    dog.is_active = True
    count += 1

db.commit()
print(f"Reactivated {count} dogs.")
db.close()
