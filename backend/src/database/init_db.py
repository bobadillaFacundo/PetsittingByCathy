from src.database.session import engine, Base
from src.models import models

def init_db():
    print("Creando tablas en la base de datos (PostgreSQL)...")
    Base.metadata.create_all(bind=engine)
    print("Tablas creadas. Ejecuta: python -m src.database.migrate_normalize")

if __name__ == "__main__":
    init_db()
