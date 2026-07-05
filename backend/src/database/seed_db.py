from src.database.session import SessionLocal
from src.models.models import EventType, Species, User

def seed():
    db = SessionLocal()
    try:
        # Check if already seeded
        if db.query(EventType).first():
            print("La base de datos ya contiene datos iniciales.")
            return

        # 1. Especies
        species = [
            Species(name="Perro"),
            Species(name="Gato"),
            Species(name="Loro"),
            Species(name="Conejo"),
            Species(name="Tortuga")
        ]
        db.add_all(species)

        # 2. Usuarios
        users = [
            User(name="Cathy", role="admin", password_hash="dummy_hash"),
            User(name="Mariela", role="user", password_hash="dummy_hash"),
            User(name="Nico", role="user", password_hash="dummy_hash")
        ]
        db.add_all(users)

        # 3. Tipos de Eventos
        event_types = [
            EventType(name="Comió"),
            EventType(name="Tomó agua"),
            EventType(name="Pis"),
            EventType(name="Caca"),
            EventType(name="Vómito"),
            EventType(name="Conducta")
        ]
        db.add_all(event_types)

        db.commit()
        print("Datos iniciales cargados con éxito (Especies, Usuarios, Eventos).")
    except Exception as e:
        db.rollback()
        print(f"Error al cargar datos: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed()
