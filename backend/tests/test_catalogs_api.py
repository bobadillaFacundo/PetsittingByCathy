"""Tests de catálogos, tagsets y color rules."""

import pytest
from sqlalchemy.exc import IntegrityError
from src.models.models import Breed, Report, ReportEvent, EventType, LaboratoryCatalog, VaccineCatalog


@pytest.mark.api
class TestColorRules:
    def test_get_color_rules(self, client, seed):
        res = client.get("/catalogs/color-rules")
        assert res.status_code == 200
        rules = res.json()
        assert len(rules) >= 1
        assert "keywords" in rules[0]

    def test_update_color_rule(self, client, auth_headers, seed, db):
        from src.services.tag_helpers import load_color_rules
        rule = load_color_rules(db)[0]
        res = client.put(
            f"/catalogs/color-rules/{rule.id}",
            json={"keywords": "no, nada, test_keyword"},
            headers=auth_headers,
        )
        assert res.status_code == 200
        assert "test_keyword" in res.json()["keywords"]


@pytest.mark.api
class TestTagSets:
    def test_create_tagset(self, client, auth_headers):
        res = client.post(
            "/catalogs/tagsets",
            json={"name": "Conducta", "variants": "jugó, durmió, ladró"},
            headers=auth_headers,
        )
        assert res.status_code == 200
        assert res.json()["name"] == "Conducta"
        assert "jugó" in res.json()["variants_text"]

    def test_list_tagsets(self, client, seed, auth_headers):
        res = client.get("/catalogs/tagsets", headers=auth_headers)
        assert res.status_code == 200
        assert any(t["name"] == "Comida" for t in res.json())

    def test_update_tagset(self, client, auth_headers, seed):
        res = client.put(
            f"/catalogs/tagsets/{seed['tag_comida'].id}",
            json={"variants": "comió, morfó, nuevo_verbo"},
            headers=auth_headers,
        )
        assert res.status_code == 200
        assert "nuevo_verbo" in res.json()["variants_text"]


@pytest.mark.api
class TestSpeciesBreeds:
    def test_list_species(self, client, seed):
        res = client.get("/catalogs/species")
        assert res.status_code == 200
        assert len(res.json()) >= 1


@pytest.mark.unit
class TestUniqueConstraints:
    def test_breed_unique_per_species(self, db, seed):
        dup = Breed(name="Caniche", species_id=seed["species"].id)
        db.add(dup)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_report_event_unique_per_type(self, db, seed, sample_report):
        et = db.query(EventType).filter(EventType.name == "Comida").first()
        dup = ReportEvent(report_id=sample_report.id, event_type_id=et.id, value="otro")
        db.add(dup)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_laboratory_catalog_unique_name(self, db):
        db.add(LaboratoryCatalog(name="Hemograma"))
        db.commit()
        db.add(LaboratoryCatalog(name="Hemograma"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_vaccine_catalog_unique_name(self, db):
        db.add(VaccineCatalog(name="Antirrábica Test"))
        db.commit()
        db.add(VaccineCatalog(name="Antirrábica Test"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
