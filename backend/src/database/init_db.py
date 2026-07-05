from src.database.session import engine, Base
from src.models import models

def init_db():
    print("Creando tablas en la base de datos (SQLite)...")
    Base.metadata.create_all(bind=engine)
    print("Tablas creadas exitosamente.")

if __name__ == "__main__":
    init_db()
