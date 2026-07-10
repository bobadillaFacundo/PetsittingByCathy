"""Fixtures compartidas: SQLite en memoria + seed de datos."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from src.database.session import Base, get_db
from src.main import app
from src.auth import get_password_hash
from src.models.models import (
    User, Species, Breed, Animal, TagSet, ColorRule, EventType,
    Veterinarian, VeterinaryProduct, HealthRecord, Report, ReportEvent,
)
from src.services.tag_helpers import set_tag_variants, set_color_keywords


# StaticPool: una sola conexión compartida (requerido para :memory: con TestClient)
engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def db():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def seed(db):
    """Datos base reutilizables en tests de API e integración."""
    admin = User(
        name="testadmin",
        role="admin",
        password_hash=get_password_hash("testpass123"),
        is_active=True,
    )
    cuidador = User(
        name="cuidador",
        role="user",
        password_hash=get_password_hash("userpass123"),
        is_active=True,
    )
    db.add_all([admin, cuidador])
    db.flush()

    species = Species(name="Perro")
    db.add(species)
    db.flush()

    breed = Breed(name="Caniche", species_id=species.id)
    db.add(breed)
    db.flush()

    vet = Veterinarian(name="Dr. Test", phone="123", email="vet@test.com")
    db.add(vet)
    db.flush()

    animal = Animal(
        name="Kira",
        species_id=species.id,
        breed_id=breed.id,
        veterinarian_id=vet.id,
        is_active=True,
        is_daycare=True,
        severity="normal",
    )
    db.add(animal)
    db.flush()

    db.add(HealthRecord(animal_id=animal.id))
    db.flush()

    comida = TagSet(name="Comida")
    agua = TagSet(name="Agua")
    pis = TagSet(name="Pis")
    caca = TagSet(name="Caca")
    db.add_all([comida, agua, pis, caca])
    db.flush()
    set_tag_variants(db, comida, ["comió", "morfó", "comio"])
    set_tag_variants(db, agua, ["tomó", "bebió", "agua"])
    set_tag_variants(db, pis, ["meó", "orina", "pis"])
    set_tag_variants(db, caca, ["cagó", "heces", "caca"])

    red_exact = ColorRule(color="red", match_type="exact")
    red_partial = ColorRule(color="red", match_type="partial")
    yellow_exact = ColorRule(color="yellow", match_type="exact")
    db.add_all([red_exact, red_partial, yellow_exact])
    db.flush()
    set_color_keywords(db, red_exact, ["no", "nada", "ninguno"])
    set_color_keywords(db, red_partial, ["sangre", "vomito", "diarrea", "líquido"])
    set_color_keywords(db, yellow_exact, ["poco", "blanda", "mitad"])

    for ename in ["Comida", "Agua", "Caca", "Enfermedad"]:
        db.add(EventType(name=ename))
    db.flush()

    prod_int = VeterinaryProduct(name="Drontal", type="INTERNAL")
    prod_ext = VeterinaryProduct(name="Bravecto", type="EXTERNAL")
    db.add_all([prod_int, prod_ext])
    db.commit()

    return {
        "admin": admin,
        "cuidador": cuidador,
        "species": species,
        "breed": breed,
        "vet": vet,
        "animal": animal,
        "tag_comida": comida,
        "product_internal": prod_int,
        "product_external": prod_ext,
    }


@pytest.fixture()
def auth_headers(client, seed):
    res = client.post(
        "/auth/login",
        data={"username": "testadmin", "password": "testpass123"},
    )
    assert res.status_code == 200
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def user_headers(client, seed):
    res = client.post(
        "/auth/login",
        data={"username": "cuidador", "password": "userpass123"},
    )
    assert res.status_code == 200
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def sample_report(db, seed):
    report = Report(
        user_id=seed["admin"].id,
        animal_id=seed["animal"].id,
        audio_transcript="Kira comió todo y está bien.",
    )
    db.add(report)
    db.flush()
    et = db.query(EventType).filter(EventType.name == "Comida").first()
    db.add(ReportEvent(report_id=report.id, event_type_id=et.id, value="todo"))
    db.commit()
    db.refresh(report)
    return report
