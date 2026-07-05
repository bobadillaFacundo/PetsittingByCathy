import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.database.session import SessionLocal
from src.models.models import User
from src.auth import get_password_hash

db = SessionLocal()

# Verificar si cathy ya existe
cathy = db.query(User).filter_by(name="cathy").first()
if cathy:
    # Si ya existe, actualizamos su rol y contraseña
    cathy.role = "admin"
    cathy.password_hash = get_password_hash("1234")
    print("El usuario 'cathy' ya existía. Se han actualizado sus credenciales a admin.")
else:
    # Crear nueva usuaria
    nuevo_admin = User(name="cathy", password_hash=get_password_hash("1234"), role="admin")
    db.add(nuevo_admin)
    print("Usuario 'cathy' creado con éxito como Administrador.")

db.commit()
db.close()
