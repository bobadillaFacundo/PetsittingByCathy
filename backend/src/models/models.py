from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float, Text, Date
from sqlalchemy.orm import relationship
from datetime import datetime
from src.database.session import Base

# ----------------- ENTIDADES PRINCIPALES ----------------- #

class DataDictionary(Base):
    """Diccionario de datos para mapeo dinámico de IA."""
    __tablename__ = "data_dictionary"
    id = Column(Integer, primary_key=True, index=True)
    table_name = Column(String, unique=True, index=True, nullable=False) # e.g. "report_events"
    entity_name = Column(String, nullable=False) # e.g. "Eventos Rutinarios"
    synonyms = Column(String, nullable=False) # e.g. "comió, tomó agua, pis, caca"
    fields_config = Column(String, nullable=False) # JSON: [{"name": "value", "type": "string"}]

class TagSet(Base):
    """Conjuntos dinámicos auto-incrementales para la IA (Comida, Enfermedad, Pis, Caca, Agua)."""
    __tablename__ = "tag_sets"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False) # e.g. "Comida"
    variants = Column(Text, nullable=False) # e.g. "comió, morfó, tragó, se alimentó"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    role = Column(String, default="user") # admin, user
    password_hash = Column(String, nullable=False) # Para autenticación
    is_active = Column(Boolean, default=True)

    reports = relationship("Report", back_populates="user")

class Species(Base):
    __tablename__ = "species"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)

    animals = relationship("Animal", back_populates="species")
    breeds = relationship("Breed", back_populates="species")

class Veterinarian(Base):
    __tablename__ = "veterinarians"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)

    animals = relationship("Animal", back_populates="veterinarian")

class Breed(Base):
    __tablename__ = "breeds"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    species_id = Column(Integer, ForeignKey("species.id"), nullable=False)

    species = relationship("Species", back_populates="breeds")
    animals = relationship("Animal", back_populates="breed")

class Animal(Base):
    __tablename__ = "animals"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    species_id = Column(Integer, ForeignKey("species.id"), nullable=False)
    breed_id = Column(Integer, ForeignKey("breeds.id"), nullable=True)
    veterinarian_id = Column(Integer, ForeignKey("veterinarians.id"), nullable=True)
    birth_date = Column(Date, nullable=True)
    sex = Column(String(1), nullable=True) # M, F, U (Unknown)
    is_castrated = Column(Boolean, default=False)
    photo_url = Column(String, nullable=True)
    is_active = Column(Boolean, default=True) # Para filtrado de dashboard
    severity = Column(String, default="normal") # normal, observation, critical

    species = relationship("Species", back_populates="animals")
    breed = relationship("Breed", back_populates="animals")
    veterinarian = relationship("Veterinarian", back_populates="animals")
    reports = relationship("Report", back_populates="animal")
    diagnoses = relationship("AnimalDiagnosis", back_populates="animal")
    medications = relationship("AnimalMedication", back_populates="animal")
    observations = relationship("AnimalObservation", back_populates="animal")
    attachments = relationship("Attachment", back_populates="animal")
    lab_results = relationship("LabResult", back_populates="animal", cascade="all, delete-orphan")
    internal_dewormings = relationship("InternalDeworming", back_populates="animal", cascade="all, delete-orphan")
    external_dewormings = relationship("ExternalDeworming", back_populates="animal", cascade="all, delete-orphan")
    health_record = relationship("HealthRecord", uselist=False, back_populates="animal", cascade="all, delete-orphan")

# ----------------- ENTIDADES DÉBILES (ANIMAL) ----------------- #

class LabResult(Base):
    __tablename__ = "lab_results"
    id = Column(Integer, primary_key=True, index=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    laboratory_id = Column(Integer, ForeignKey("laboratory_catalog.id"), nullable=False)
    date = Column(Date, default=datetime.utcnow, nullable=False)
    document_url = Column(String, nullable=False)

    animal = relationship("Animal", back_populates="lab_results")
    laboratory = relationship("LaboratoryCatalog")

class InternalDeworming(Base):
    __tablename__ = "internal_dewormings"
    id = Column(Integer, primary_key=True, index=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("veterinary_products.id"), nullable=False)
    date = Column(Date, default=datetime.utcnow, nullable=False)
    next_due_date = Column(Date, nullable=True)

    animal = relationship("Animal", back_populates="internal_dewormings")
    product = relationship("VeterinaryProduct")

class ExternalDeworming(Base):
    __tablename__ = "external_dewormings"
    id = Column(Integer, primary_key=True, index=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("veterinary_products.id"), nullable=False)
    date = Column(Date, default=datetime.utcnow, nullable=False)
    next_due_date = Column(Date, nullable=True)

    animal = relationship("Animal", back_populates="external_dewormings")
    product = relationship("VeterinaryProduct")

class HealthRecord(Base):
    __tablename__ = "health_records"
    id = Column(Integer, primary_key=True, index=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), unique=True, nullable=False)
    creation_date = Column(Date, default=datetime.utcnow, nullable=False)
    notes = Column(String, nullable=True)

    animal = relationship("Animal", back_populates="health_record")
    vaccines = relationship("Vaccine", back_populates="health_record", cascade="all, delete-orphan")

class Vaccine(Base):
    __tablename__ = "vaccines"
    id = Column(Integer, primary_key=True, index=True)
    health_record_id = Column(Integer, ForeignKey("health_records.id"), nullable=False)
    vaccine_id = Column(Integer, ForeignKey("vaccine_catalog.id"), nullable=False)
    date_administered = Column(Date, default=datetime.utcnow, nullable=False)
    next_due_date = Column(Date, nullable=True)
    lot_number = Column(String, nullable=True)
    veterinarian_name = Column(String, nullable=True)

    health_record = relationship("HealthRecord", back_populates="vaccines")
    vaccine_catalog = relationship("VaccineCatalog")

# ----------------- CATÁLOGOS NORMALIZADOS ----------------- #

class VeterinaryProduct(Base):
    __tablename__ = "veterinary_products"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False) # 'INTERNAL' or 'EXTERNAL'

class LaboratoryCatalog(Base):
    __tablename__ = "laboratory_catalog"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)

class VaccineCatalog(Base):
    __tablename__ = "vaccine_catalog"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)

class DiagnosisCatalog(Base):
    __tablename__ = "diagnosis_catalog"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)

class MedicationCatalog(Base):
    __tablename__ = "medication_catalog"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    active_principle = Column(String, nullable=True)

class EventType(Base):
    __tablename__ = "event_types"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False) # e.g. comida, agua, pis, caca, vomito, conducta

# ----------------- TABLAS INTERMEDIAS (M:N y Atributos Multivaluados) ----------------- #

class AnimalDiagnosis(Base):
    __tablename__ = "animal_diagnoses"
    id = Column(Integer, primary_key=True, index=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    diagnosis_id = Column(Integer, ForeignKey("diagnosis_catalog.id"), nullable=False)
    date_diagnosed = Column(Date, nullable=True)

    animal = relationship("Animal", back_populates="diagnoses")
    diagnosis = relationship("DiagnosisCatalog")

class AnimalMedication(Base):
    __tablename__ = "animal_medications"
    id = Column(Integer, primary_key=True, index=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    medication_id = Column(Integer, ForeignKey("medication_catalog.id"), nullable=False)
    dosage = Column(String, nullable=False)
    frequency = Column(String, nullable=False) # e.g. "cada 12h"
    is_current = Column(Boolean, default=True)

    animal = relationship("Animal", back_populates="medications")
    medication = relationship("MedicationCatalog")

class AnimalObservation(Base):
    """Observaciones permanentes o alertas del animal"""
    __tablename__ = "animal_observations"
    id = Column(Integer, primary_key=True, index=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    observation = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    animal = relationship("Animal", back_populates="observations")

# ----------------- REPORTES DIARIOS ----------------- #

class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    audio_transcript = Column(Text, nullable=True) # Texto base del cual se extrajo la info
    weight = Column(Float, nullable=True) # El peso es un atributo singular del momento

    user = relationship("User", back_populates="reports")
    animal = relationship("Animal", back_populates="reports")
    events = relationship("ReportEvent", back_populates="report")
    administered_meds = relationship("ReportMedication", back_populates="report")

class ReportEvent(Base):
    """Registra si comió, tomó agua, hizo pis, vómitos, etc. (Normalizado)"""
    __tablename__ = "report_events"
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    event_type_id = Column(Integer, ForeignKey("event_types.id"), nullable=False)
    value = Column(String, nullable=True) # e.g. "blanda" para caca, "2" para vómitos
    severity = Column(Integer, nullable=True) # 1 a 5, opcional

    report = relationship("Report", back_populates="events")
    event_type = relationship("EventType")

class ReportMedication(Base):
    __tablename__ = "report_medications"
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    animal_medication_id = Column(Integer, ForeignKey("animal_medications.id"), nullable=False)
    time_administered = Column(DateTime, default=datetime.utcnow)
    notes = Column(String, nullable=True)

    report = relationship("Report", back_populates="administered_meds")
    animal_medication = relationship("AnimalMedication")

# ----------------- MULTIMEDIA ----------------- #

class Attachment(Base):
    __tablename__ = "attachments"
    id = Column(Integer, primary_key=True, index=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=True)
    file_type = Column(String, nullable=False) # image, video, lab_result, recipe
    file_url = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    animal = relationship("Animal", back_populates="attachments")
