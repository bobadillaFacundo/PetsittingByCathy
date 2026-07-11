"""
migrate_to_supabase.py
======================
Script de migración de datos desde la BD local (100.82.178.56)
hacia Supabase.

Pasos que ejecuta:
  1. Crea todas las tablas en Supabase usando los modelos SQLAlchemy
  2. Lee todos los datos de la BD de origen (100.82.178.56)
  3. Los inserta en Supabase respetando el orden de FK

Uso:
  cd backend
  python migrate_to_supabase.py
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv()

# ── Conexiones ──────────────────────────────────────────────────────────────
# SOURCE_DATABASE_URL: URL de la BD de origen (el servidor antiguo)
# Se lee del .env para no hardcodear credenciales en el código.
SOURCE_URL = os.getenv("SOURCE_DATABASE_URL", "")
TARGET_URL = os.getenv("DATABASE_URL", "")

if not SOURCE_URL:
    print("ERROR: SOURCE_DATABASE_URL no está definida en el .env")
    print("       Agregá: SOURCE_DATABASE_URL=postgresql://usuario:pass@host:5432/db")
    sys.exit(1)

if not TARGET_URL:
    print("ERROR: DATABASE_URL no está definida en el .env (debe apuntar a Supabase).")
    sys.exit(1)

if TARGET_URL == SOURCE_URL:
    print("ERROR: SOURCE_DATABASE_URL y DATABASE_URL son iguales. Verificá el .env.")
    sys.exit(1)

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

print(f"[ORIGEN]  {SOURCE_URL[:60]}...")
print(f"[DESTINO] {TARGET_URL[:60]}...")
print()

src_engine = create_engine(SOURCE_URL)
dst_engine = create_engine(TARGET_URL)

SrcSession = sessionmaker(bind=src_engine)
DstSession = sessionmaker(bind=dst_engine)

# ── Paso 1: Crear tablas en Supabase ────────────────────────────────────────
print("━" * 60)
print("PASO 1 — Creando tablas en Supabase...")
print("━" * 60)

from src.database.session import Base
from src.models import models  # importa todos los modelos

Base.metadata.create_all(bind=dst_engine)
print("✓ Tablas creadas (o ya existían).\n")

# ── Paso 2: Migrar tabla a tabla ────────────────────────────────────────────
print("━" * 60)
print("PASO 2 — Migrando datos...")
print("━" * 60)

# Orden respetando dependencias de FK (tablas sin FK primero)
MIGRATION_ORDER = [
    models.DataDictionary,
    models.DataDictionarySynonym,
    models.TagSet,
    models.TagVariant,
    models.ColorRule,
    models.ColorRuleKeyword,
    models.User,
    models.Species,
    models.Veterinarian,
    models.Breed,
    models.Animal,
    models.Reservation,
    models.LaboratoryCatalog,
    models.VaccineCatalog,
    models.DiagnosisCatalog,
    models.MedicationCatalog,
    models.VeterinaryProduct,
    models.EventType,
    models.HealthRecord,
    models.Vaccine,
    models.LabResult,
    models.Deworming,
    models.AnimalDiagnosis,
    models.AnimalMedication,
    models.AnimalObservation,
    models.Report,
    models.ReportEvent,
    models.ReportMedication,
    models.Attachment,
    models.CriticalAlert,
]

src_session = SrcSession()
dst_session = DstSession()

total_rows = 0

try:
    for Model in MIGRATION_ORDER:
        table = Model.__tablename__
        rows = src_session.query(Model).all()

        if not rows:
            print(f"  ○ {table:40s} — (vacía, se omite)")
            continue

        # Convertir a dicts para insertar en destino
        dicts = []
        for row in rows:
            d = {c.name: getattr(row, c.name) for c in Model.__table__.columns}
            dicts.append(d)

        # Limpiar tabla destino y reinsertar
        dst_session.execute(text(f'DELETE FROM "{table}"'))
        dst_session.flush()

        # Insertar en lotes usando connection (SQLAlchemy 2.x compatible)
        with dst_engine.begin() as conn:
            conn.execute(Model.__table__.insert(), dicts)

        # Resetear secuencia (auto-increment) al máximo id actual
        max_id = max(d["id"] for d in dicts)
        try:
            dst_session.execute(
                text(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), {max_id})")
            )
        except Exception:
            pass  # Tabla sin secuencia de id (no debería pasar)

        dst_session.commit()
        print(f"  ✓ {table:40s} — {len(rows):>5} filas migradas")
        total_rows += len(rows)

    print()
    print(f"✓ Migración completada: {total_rows} filas en total.")

except Exception as e:
    dst_session.rollback()
    print(f"\n✗ ERROR durante la migración: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

finally:
    src_session.close()
    dst_session.close()

print()
print("━" * 60)
print("PASO 3 — Verificación rápida de conteo...")
print("━" * 60)

with dst_engine.connect() as conn:
    for Model in MIGRATION_ORDER:
        table = Model.__tablename__
        count = conn.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar()
        if count > 0:
            print(f"  ✓ {table:40s} — {count:>5} filas en Supabase")

print()
print("🎉 ¡Migración a Supabase completada exitosamente!")
