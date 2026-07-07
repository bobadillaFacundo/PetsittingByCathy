import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.database.session import SessionLocal
from src.models.models import User
from src.auth import get_password_hash

def run():
    db = SessionLocal()
    admin_user = db.query(User).filter_by(name="admin").first()
    if admin_user:
        admin_user.role = "admin"
        admin_user.password_hash = get_password_hash("admin")
        print("El usuario 'admin' ya existía. Se han actualizado sus credenciales a admin/admin.")
    else:
        nuevo_admin = User(name="admin", password_hash=get_password_hash("admin"), role="admin")
        db.add(nuevo_admin)
        print("Usuario 'admin' creado con éxito como Administrador.")

    db.commit()
    db.close()

if __name__ == "__main__":
    run()
