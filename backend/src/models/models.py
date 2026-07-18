from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float, Text, Date, UniqueConstraint, Time
from sqlalchemy.orm import relationship
from src.database.session import Base
from src.timezone_ar import now_ar, today_ar

# ----------------- CONFIGURACIÓN IA (1FN normalizada) ----------------- #

class DataDictionary(Base):
    """Diccionario de datos para mapeo dinámico de IA."""
    __tablename__ = "data_dictionary"
    id = Column(Integer, primary_key=True, index=True)
    table_name = Column(String, unique=True, index=True, nullable=False)
    entity_name = Column(String, nullable=False)
    fields_config = Column(String, nullable=False)

    synonyms_rel = relationship("DataDictionarySynonym", back_populates="dictionary", cascade="all, delete-orphan")


class DataDictionarySynonym(Base):
    __tablename__ = "data_dictionary_synonyms"
    id = Column(Integer, primary_key=True, index=True)
    dictionary_id = Column(Integer, ForeignKey("data_dictionary.id"), nullable=False)
    synonym = Column(String, nullable=False, index=True)

    dictionary = relationship("DataDictionary", back_populates="synonyms_rel")

    __table_args__ = (
        UniqueConstraint("dictionary_id", "synonym", name="uq_dict_synonym"),
    )


class TagSet(Base):
    """Conjuntos dinámicos auto-incrementales para la IA."""
    __tablename__ = "tag_sets"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)

    variants_rel = relationship("TagVariant", back_populates="tag_set", cascade="all, delete-orphan")


class TagVariant(Base):
    __tablename__ = "tag_variants"
    id = Column(Integer, primary_key=True, index=True)
    tag_set_id = Column(Integer, ForeignKey("tag_sets.id"), nullable=False)
    variant = Column(String, nullable=False, index=True)

    tag_set = relationship("TagSet", back_populates="variants_rel")

    __table_args__ = (
        UniqueConstraint("tag_set_id", "variant", name="uq_tag_variant"),
    )


class ColorRule(Base):
    """Reglas de color dinámicas para etiquetas."""
    __tablename__ = "color_rules"
    id = Column(Integer, primary_key=True, index=True)
    color = Column(String, index=True, nullable=False)
    match_type = Column(String, nullable=False)

    keywords_rel = relationship("ColorRuleKeyword", back_populates="color_rule", cascade="all, delete-orphan")


class ColorRuleKeyword(Base):
    __tablename__ = "color_rule_keywords"
    id = Column(Integer, primary_key=True, index=True)
    color_rule_id = Column(Integer, ForeignKey("color_rules.id"), nullable=False)
    keyword = Column(String, nullable=False, index=True)

    color_rule = relationship("ColorRule", back_populates="keywords_rel")

    __table_args__ = (
        UniqueConstraint("color_rule_id", "keyword", name="uq_color_rule_keyword"),
    )

# ----------------- ENTIDADES PRINCIPALES ----------------- #

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    role = Column(String, default="user")
    password_hash = Column(String, nullable=False)
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
    vaccines = relationship("Vaccine", back_populates="veterinarian")


class Breed(Base):
    __tablename__ = "breeds"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    species_id = Column(Integer, ForeignKey("species.id"), nullable=False)

    species = relationship("Species", back_populates="breeds")
    animals = relationship("Animal", back_populates="breed")

    __table_args__ = (
        UniqueConstraint("species_id", "name", name="uq_breed_species_name"),
    )


class Animal(Base):
    __tablename__ = "animals"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    species_id = Column(Integer, ForeignKey("species.id"), nullable=False)
    breed_id = Column(Integer, ForeignKey("breeds.id"), nullable=True)
    veterinarian_id = Column(Integer, ForeignKey("veterinarians.id"), nullable=True)
    birth_date = Column(Date, nullable=True)
    sex = Column(String(1), nullable=True)
    is_castrated = Column(Boolean, default=False)
    photo_url = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    is_daycare = Column(Boolean, default=True, nullable=False)
    severity = Column(String, default="normal")
    residence = Column(String, nullable=True)

    # Perfil físico / rescate
    coat_color = Column(String, nullable=True)
    is_rescue = Column(Boolean, default=False, nullable=False)
    age_years = Column(Float, nullable=True)  # edad conocida (no rescate / exacta)
    age_estimate_min = Column(Float, nullable=True)  # rango estimado si rescate
    age_estimate_max = Column(Float, nullable=True)
    is_simil_breed = Column(Boolean, default=False, nullable=False)  # raza = "SÍMIL a …"

    # Características especiales
    is_blind = Column(Boolean, default=False, nullable=False)
    is_deaf = Column(Boolean, default=False, nullable=False)
    no_smell = Column(Boolean, default=False, nullable=False)
    has_neurological = Column(Boolean, default=False, nullable=False)
    has_involuntary_movements = Column(Boolean, default=False, nullable=False)

    species = relationship("Species", back_populates="animals")
    breed = relationship("Breed", back_populates="animals")
    veterinarian = relationship("Veterinarian", back_populates="animals")
    reports = relationship("Report", back_populates="animal")
    diagnoses = relationship("AnimalDiagnosis", back_populates="animal")
    medications = relationship("AnimalMedication", back_populates="animal")
    observations = relationship("AnimalObservation", back_populates="animal")
    attachments = relationship("Attachment", back_populates="animal")
    lab_results = relationship("LabResult", back_populates="animal", cascade="all, delete-orphan")
    dewormings = relationship("Deworming", back_populates="animal", cascade="all, delete-orphan")
    health_record = relationship("HealthRecord", uselist=False, back_populates="animal", cascade="all, delete-orphan")
    reservations = relationship("Reservation", back_populates="animal", cascade="all, delete-orphan")

# ----------------- GESTIÓN DE RESERVAS ----------------- #

class Reservation(Base):
    __tablename__ = "reservations"
    id = Column(Integer, primary_key=True, index=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    status = Column(String, default="Pendiente")
    notes = Column(Text, nullable=True)
    belongings_photos = Column(Text, nullable=True)

    animal = relationship("Animal", back_populates="reservations")

# ----------------- ENTIDADES DÉBILES (ANIMAL) ----------------- #

class LabResult(Base):
    __tablename__ = "lab_results"
    id = Column(Integer, primary_key=True, index=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    laboratory_id = Column(Integer, ForeignKey("laboratory_catalog.id"), nullable=False)
    date = Column(Date, default=today_ar, nullable=False)
    document_url = Column(String, nullable=False)

    animal = relationship("Animal", back_populates="lab_results")
    laboratory = relationship("LaboratoryCatalog")


class Deworming(Base):
    """Desparasitaciones internas y externas unificadas (tipo en veterinary_products.type)."""
    __tablename__ = "dewormings"
    id = Column(Integer, primary_key=True, index=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("veterinary_products.id"), nullable=False)
    date = Column(Date, default=today_ar, nullable=False)
    next_due_date = Column(Date, nullable=True)

    animal = relationship("Animal", back_populates="dewormings")
    product = relationship("VeterinaryProduct", back_populates="dewormings")


class HealthRecord(Base):
    __tablename__ = "health_records"
    id = Column(Integer, primary_key=True, index=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), unique=True, nullable=False)
    creation_date = Column(Date, default=today_ar, nullable=False)
    notes = Column(String, nullable=True)

    animal = relationship("Animal", back_populates="health_record")
    vaccines = relationship("Vaccine", back_populates="health_record", cascade="all, delete-orphan")


class Vaccine(Base):
    __tablename__ = "vaccines"
    id = Column(Integer, primary_key=True, index=True)
    health_record_id = Column(Integer, ForeignKey("health_records.id"), nullable=False)
    vaccine_id = Column(Integer, ForeignKey("vaccine_catalog.id"), nullable=False)
    date_administered = Column(Date, default=today_ar, nullable=False)
    next_due_date = Column(Date, nullable=True)
    lot_number = Column(String, nullable=True)
    veterinarian_id = Column(Integer, ForeignKey("veterinarians.id"), nullable=True)

    health_record = relationship("HealthRecord", back_populates="vaccines")
    vaccine_catalog = relationship("VaccineCatalog")
    veterinarian = relationship("Veterinarian", back_populates="vaccines")

# ----------------- CATÁLOGOS NORMALIZADOS ----------------- #

class VeterinaryProduct(Base):
    __tablename__ = "veterinary_products"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)

    dewormings = relationship("Deworming", back_populates="product")

    __table_args__ = (
        UniqueConstraint("name", "type", name="uq_product_name_type"),
    )


class LaboratoryCatalog(Base):
    __tablename__ = "laboratory_catalog"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)


class VaccineCatalog(Base):
    __tablename__ = "vaccine_catalog"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)


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
    name = Column(String, unique=True, nullable=False)

# ----------------- TABLAS INTERMEDIAS ----------------- #

class AnimalMedicationSchedule(Base):
    __tablename__ = "animal_medication_schedules"
    id = Column(Integer, primary_key=True, index=True)
    animal_medication_id = Column(Integer, ForeignKey("animal_medications.id", ondelete="CASCADE"), nullable=False)
    scheduled_time = Column(Time, nullable=False)

    animal_medication = relationship("AnimalMedication", back_populates="schedules")

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
    frequency = Column(String, nullable=False)
    is_current = Column(Boolean, default=True)
    amount_per_day = Column(String, nullable=True)
    duration_days = Column(Integer, nullable=True)
    is_forever = Column(Boolean, default=False)

    animal = relationship("Animal", back_populates="medications")
    medication = relationship("MedicationCatalog")
    schedules = relationship("AnimalMedicationSchedule", back_populates="animal_medication", cascade="all, delete-orphan")


class AnimalObservation(Base):
    __tablename__ = "animal_observations"
    id = Column(Integer, primary_key=True, index=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    observation = Column(Text, nullable=False)
    created_at = Column(DateTime, default=now_ar)

    animal = relationship("Animal", back_populates="observations")

# ----------------- REPORTES DIARIOS ----------------- #

class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=now_ar, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    audio_transcript = Column(Text, nullable=True)
    weight = Column(Float, nullable=True)

    user = relationship("User", back_populates="reports")
    animal = relationship("Animal", back_populates="reports")
    events = relationship("ReportEvent", back_populates="report")
    administered_meds = relationship("ReportMedication", back_populates="report")
    attachments = relationship("Attachment", back_populates="report")


class ReportEvent(Base):
    __tablename__ = "report_events"
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    event_type_id = Column(Integer, ForeignKey("event_types.id"), nullable=False)
    value = Column(String, nullable=True)
    severity = Column(Integer, nullable=True)

    report = relationship("Report", back_populates="events")
    event_type = relationship("EventType")

    __table_args__ = (
        UniqueConstraint("report_id", "event_type_id", name="uq_report_event_type"),
    )


class ReportMedication(Base):
    __tablename__ = "report_medications"
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    animal_medication_id = Column(Integer, ForeignKey("animal_medications.id"), nullable=False)
    time_administered = Column(DateTime, default=now_ar)
    notes = Column(String, nullable=True)

    report = relationship("Report", back_populates="administered_meds")
    animal_medication = relationship("AnimalMedication")

# ----------------- MULTIMEDIA Y ALERTAS ----------------- #

class Attachment(Base):
    __tablename__ = "attachments"
    id = Column(Integer, primary_key=True, index=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=True)
    file_type = Column(String, nullable=False)
    file_url = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=now_ar)

    animal = relationship("Animal", back_populates="attachments")
    report = relationship("Report", back_populates="attachments")


class CriticalAlert(Base):
    __tablename__ = "critical_alerts"
    id = Column(Integer, primary_key=True, index=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=True)
    keyword_detected = Column(String, nullable=False)
    severity = Column(String, default="red")
    is_resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=now_ar)
    resolved_at = Column(DateTime, nullable=True)

    animal = relationship("Animal")
    report = relationship("Report")
