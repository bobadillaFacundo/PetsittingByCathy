"""
Migración de normalización de la BDD.
Ejecutar una vez después de actualizar modelos:

    python -m src.database.migrate_normalize
"""

from sqlalchemy import inspect, text
from src.database.session import engine, SessionLocal, Base
from src.models import models
from src.services.tag_helpers import parse_csv_values, set_tag_variants, set_color_keywords, set_dictionary_synonyms


def column_exists(inspector, table: str, column: str) -> bool:
    if table not in inspector.get_table_names():
        return False
    return column in {c["name"] for c in inspector.get_columns(table)}


def table_exists(inspector, table: str) -> bool:
    return table in inspector.get_table_names()


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

        print("\nMigración completada. Reinicia el backend.")
    except Exception as e:
        db.rollback()
        print(f"ERROR en migración: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
