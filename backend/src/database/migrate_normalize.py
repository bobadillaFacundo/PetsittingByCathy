"""
Migración de normalización de la BDD.
Ejecutar una vez después de actualizar modelos:

    python -m src.database.migrate_normalize
"""

from sqlalchemy import inspect, text
from src.database.session import engine, SessionLocal, Base, get_ddl_engine
from src.models import models
from src.services.tag_helpers import parse_csv_values, set_tag_variants, set_color_keywords, set_dictionary_synonyms

_ddl_engine = None


def run_ddl(sql: str) -> None:
    """DDL con autocommit en conexión directa (Supabase pooler no soporta ALTER)."""
    global _ddl_engine
    if _ddl_engine is None:
        _ddl_engine = get_ddl_engine()
    with _ddl_engine.connect() as conn:
        conn.execute(text(sql))


def column_exists(inspector, table: str, column: str) -> bool:
    if table not in inspector.get_table_names():
        return False
    return column in {c["name"] for c in inspector.get_columns(table)}


def table_exists(inspector, table: str) -> bool:
    return table in inspector.get_table_names()


def _ensure_schema_migrations_table(inspector) -> None:
    if not table_exists(inspector, "schema_migrations"):
        run_ddl(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "name VARCHAR(255) PRIMARY KEY, "
            "applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
        )


def _migration_applied(db, name: str) -> bool:
    row = db.execute(
        text("SELECT 1 FROM schema_migrations WHERE name = :name"),
        {"name": name},
    ).fetchone()
    return row is not None


def _mark_migration_applied(db, name: str) -> None:
    db.execute(
        text("INSERT INTO schema_migrations (name) VALUES (:name) ON CONFLICT (name) DO NOTHING"),
        {"name": name},
    )
    db.commit()


def _migrate_reservations_for_other_activities(db, inspector) -> None:
    """species_id + animal_id nullable para Otras actividades sin paciente."""
    if not table_exists(inspector, "reservations"):
        return

    _ensure_schema_migrations_table(inspector)
    inspector = inspect(engine)

    if not column_exists(inspector, "reservations", "species_id"):
        print("Agregando reservations.species_id...")
        run_ddl(
            "ALTER TABLE reservations "
            "ADD COLUMN IF NOT EXISTS species_id INTEGER REFERENCES species(id)"
        )
        print("  OK reservations.species_id")

    inspector = inspect(engine)
    nullable = False
    for col in inspector.get_columns("reservations"):
        if col["name"] == "animal_id":
            nullable = col.get("nullable", False)
            break

    if not nullable and not _migration_applied(db, "reservations_nullable_animal"):
        print("Permitiendo animal_id NULL en reservations...")
        run_ddl("ALTER TABLE reservations ALTER COLUMN animal_id DROP NOT NULL")
        _mark_migration_applied(db, "reservations_nullable_animal")
        print("  OK reservations.animal_id nullable")
    elif nullable and not _migration_applied(db, "reservations_nullable_animal"):
        _mark_migration_applied(db, "reservations_nullable_animal")


def migrate():
    print("Creando tablas nuevas si no existen...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    inspector = inspect(engine)

    try:
        # --- 1. TagSet variants CSV -> tag_variants ---
        if column_exists(inspector, "tag_sets", "variants"):
            print("Migrando tag_sets.variants -> tag_variants...")
            rows = db.execute(text("SELECT id, variants FROM tag_sets WHERE variants IS NOT NULL")).fetchall()
            for row_id, variants_csv in rows:
                tag = db.query(models.TagSet).filter(models.TagSet.id == row_id).first()
                if tag and not tag.variants_rel:
                    set_tag_variants(db, tag, parse_csv_values(variants_csv))
            db.commit()
            db.execute(text("ALTER TABLE tag_sets DROP COLUMN IF EXISTS variants"))
            db.commit()
            print("  OK tag_variants")

        # --- 2. ColorRule keywords CSV -> color_rule_keywords ---
        if column_exists(inspector, "color_rules", "keywords"):
            print("Migrando color_rules.keywords -> color_rule_keywords...")
            rows = db.execute(text("SELECT id, keywords FROM color_rules WHERE keywords IS NOT NULL")).fetchall()
            for row_id, keywords_csv in rows:
                rule = db.query(models.ColorRule).filter(models.ColorRule.id == row_id).first()
                if rule and not rule.keywords_rel:
                    set_color_keywords(db, rule, parse_csv_values(keywords_csv))
            db.commit()
            db.execute(text("ALTER TABLE color_rules DROP COLUMN IF EXISTS keywords"))
            db.commit()
            print("  OK color_rule_keywords")

        # --- 3. DataDictionary synonyms CSV -> data_dictionary_synonyms ---
        if column_exists(inspector, "data_dictionary", "synonyms"):
            print("Migrando data_dictionary.synonyms -> data_dictionary_synonyms...")
            rows = db.execute(text("SELECT id, synonyms FROM data_dictionary WHERE synonyms IS NOT NULL")).fetchall()
            for row_id, synonyms_csv in rows:
                entry = db.query(models.DataDictionary).filter(models.DataDictionary.id == row_id).first()
                if entry and not entry.synonyms_rel:
                    set_dictionary_synonyms(db, entry, parse_csv_values(synonyms_csv))
            db.commit()
            db.execute(text("ALTER TABLE data_dictionary DROP COLUMN IF EXISTS synonyms"))
            db.commit()
            print("  OK data_dictionary_synonyms")

        # --- 4. Unificar desparasitaciones ---
        if table_exists(inspector, "dewormings"):
            count = db.query(models.Deworming).count()
            if count == 0:
                if table_exists(inspector, "internal_dewormings"):
                    print("Migrando internal_dewormings -> dewormings...")
                    rows = db.execute(text(
                        "SELECT animal_id, product_id, date, next_due_date FROM internal_dewormings"
                    )).fetchall()
                    for animal_id, product_id, date, next_due in rows:
                        db.add(models.Deworming(
                            animal_id=animal_id, product_id=product_id,
                            date=date, next_due_date=next_due,
                        ))
                    db.commit()
                if table_exists(inspector, "external_dewormings"):
                    print("Migrando external_dewormings -> dewormings...")
                    rows = db.execute(text(
                        "SELECT animal_id, product_id, date, next_due_date FROM external_dewormings"
                    )).fetchall()
                    for animal_id, product_id, date, next_due in rows:
                        db.add(models.Deworming(
                            animal_id=animal_id, product_id=product_id,
                            date=date, next_due_date=next_due,
                        ))
                    db.commit()
                if table_exists(inspector, "internal_dewormings"):
                    db.execute(text("DROP TABLE IF EXISTS internal_dewormings CASCADE"))
                if table_exists(inspector, "external_dewormings"):
                    db.execute(text("DROP TABLE IF EXISTS external_dewormings CASCADE"))
                db.commit()
                print("  OK dewormings")

        # --- 5. Vaccines veterinarian_name -> veterinarian_id ---
        if column_exists(inspector, "vaccines", "veterinarian_name"):
            print("Migrando vaccines.veterinarian_name -> veterinarian_id...")
            rows = db.execute(text(
                "SELECT id, veterinarian_name FROM vaccines WHERE veterinarian_name IS NOT NULL AND veterinarian_name != ''"
            )).fetchall()
            for vac_id, vet_name in rows:
                vet = db.query(models.Veterinarian).filter(models.Veterinarian.name == vet_name).first()
                if not vet:
                    vet = models.Veterinarian(name=vet_name)
                    db.add(vet)
                    db.flush()
                db.execute(text(
                    "UPDATE vaccines SET veterinarian_id = :vid WHERE id = :id"
                ), {"vid": vet.id, "id": vac_id})
            db.commit()
            db.execute(text("ALTER TABLE vaccines DROP COLUMN IF EXISTS veterinarian_name"))
            db.commit()
            print("  OK vaccines.veterinarian_id")
        elif not column_exists(inspector, "vaccines", "veterinarian_id"):
            db.execute(text("ALTER TABLE vaccines ADD COLUMN IF NOT EXISTS veterinarian_id INTEGER REFERENCES veterinarians(id)"))
            db.commit()

        # --- 6. CriticalAlert: quitar message redundante ---
        if column_exists(inspector, "critical_alerts", "message"):
            print("Eliminando critical_alerts.message (redundante)...")
            db.execute(text("ALTER TABLE critical_alerts DROP COLUMN IF EXISTS message"))
            db.commit()
            print("  OK critical_alerts")

        # --- 7. Deduplicar antes de constraints UNIQUE ---
        print("Deduplicando report_events (report_id + event_type_id)...")
        dupes = db.execute(text("""
            SELECT report_id, event_type_id, MIN(id) as keep_id
            FROM report_events
            GROUP BY report_id, event_type_id
            HAVING COUNT(*) > 1
        """)).fetchall()
        for report_id, event_type_id, keep_id in dupes:
            db.execute(text("""
                DELETE FROM report_events
                WHERE report_id = :rid AND event_type_id = :etid AND id != :keep
            """), {"rid": report_id, "etid": event_type_id, "keep": keep_id})
        db.commit()

        # --- 8. Seed color rules si vacío ---
        if db.query(models.ColorRule).count() == 0:
            print("Sembrando reglas de color por defecto...")
            defaults = [
                ("red", "exact", ["no", "nada", "ninguno"]),
                ("red", "partial", ["sangre", "líquido", "diarrea", "vomito"]),
                ("yellow", "exact", ["poco", "un poco", "mitad", "regular", "blanda"]),
                ("yellow", "partial", ["observación", "observacion"]),
            ]
            for color, match_type, keywords in defaults:
                rule = models.ColorRule(color=color, match_type=match_type)
                db.add(rule)
                db.flush()
                set_color_keywords(db, rule, keywords)
            db.commit()

        # --- is_daycare en animals ---
        inspector = inspect(engine)
        if table_exists(inspector, "animals") and not column_exists(inspector, "animals", "is_daycare"):
            print("Agregando animals.is_daycare...")
            db.execute(text("ALTER TABLE animals ADD COLUMN is_daycare BOOLEAN DEFAULT TRUE NOT NULL"))
            db.commit()
            print("  OK animals.is_daycare (existentes = guardería)")

        # --- Perfil físico / rescate / características ---
        inspector = inspect(engine)
        if table_exists(inspector, "animals"):
            animal_cols = {
                "coat_color": "VARCHAR",
                "is_rescue": "BOOLEAN DEFAULT FALSE NOT NULL",
                "age_years": "DOUBLE PRECISION",
                "age_estimate_min": "DOUBLE PRECISION",
                "age_estimate_max": "DOUBLE PRECISION",
                "is_simil_breed": "BOOLEAN DEFAULT FALSE NOT NULL",
                "is_blind": "BOOLEAN DEFAULT FALSE NOT NULL",
                "is_deaf": "BOOLEAN DEFAULT FALSE NOT NULL",
                "no_smell": "BOOLEAN DEFAULT FALSE NOT NULL",
                "has_neurological": "BOOLEAN DEFAULT FALSE NOT NULL",
                "has_involuntary_movements": "BOOLEAN DEFAULT FALSE NOT NULL",
            }
            added = []
            for col, ddl in animal_cols.items():
                if not column_exists(inspector, "animals", col):
                    db.execute(text(f"ALTER TABLE animals ADD COLUMN {col} {ddl}"))
                    added.append(col)
            if added:
                db.commit()
                print(f"  OK animals perfil: {', '.join(added)}")

        # --- Observaciones: report_id, user_id en animal_observations ---
        inspector = inspect(engine)
        if table_exists(inspector, "animal_observations"):
            obs_cols = {
                "report_id": "INTEGER REFERENCES reports(id) ON DELETE CASCADE",
                "user_id": "INTEGER REFERENCES users(id)",
            }
            added_obs = []
            for col, ddl in obs_cols.items():
                if not column_exists(inspector, "animal_observations", col):
                    db.execute(text(f"ALTER TABLE animal_observations ADD COLUMN {col} {ddl}"))
                    added_obs.append(col)
            if added_obs:
                db.commit()
                print(f"  OK animal_observations: {', '.join(added_obs)}")

        # --- Attachments: observation_id (entidad débil de observación) ---
        inspector = inspect(engine)
        if table_exists(inspector, "attachments") and not column_exists(inspector, "attachments", "observation_id"):
            print("Agregando attachments.observation_id...")
            db.execute(text(
                "ALTER TABLE attachments ADD COLUMN observation_id INTEGER "
                "REFERENCES animal_observations(id) ON DELETE CASCADE"
            ))
            db.commit()
            print("  OK attachments.observation_id")

        # --- Reservas: corregir fechas guardadas como UTC naive (una sola vez) ---
        inspector = inspect(engine)
        if table_exists(inspector, "reservations"):
            if not table_exists(inspector, "schema_migrations"):
                db.execute(text(
                    "CREATE TABLE IF NOT EXISTS schema_migrations ("
                    "name VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
                ))
                db.commit()
            already = db.execute(text(
                "SELECT 1 FROM schema_migrations WHERE name = 'reservations_utc_to_ar'"
            )).fetchone()
            if not already:
                print("Corrigiendo reservations: UTC naive -> hora Argentina...")
                db.execute(text("""
                    UPDATE reservations
                    SET start_date = (start_date AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires',
                        end_date = (end_date AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires'
                    WHERE start_date IS NOT NULL AND end_date IS NOT NULL
                """))
                db.execute(text(
                    "INSERT INTO schema_migrations (name) VALUES ('reservations_utc_to_ar')"
                ))
                db.commit()
                print("  OK reservations timezone")

        # --- Reservas: species_id y animal_id opcional (Otras actividades) ---
        inspector = inspect(engine)
        _migrate_reservations_for_other_activities(db, inspector)

        # --- Animales: peso en kg ---
        inspector = inspect(engine)
        if table_exists(inspector, "animals") and not column_exists(inspector, "animals", "weight_kg"):
            print("Agregando animals.weight_kg...")
            run_ddl("ALTER TABLE animals ADD COLUMN IF NOT EXISTS weight_kg DOUBLE PRECISION")
            print("  OK animals.weight_kg")

        from src.services.tag_helpers import ensure_optional_tag_sets
        print("Verificando conjuntos opcionales (Peso)...")
        ensure_optional_tag_sets(db)
        print("  OK conjuntos opcionales")

        print("\nMigración completada. Reinicia el backend.")
    except Exception as e:
        db.rollback()
        print(f"ERROR en migración: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
