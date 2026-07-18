"""Tests de endpoints de animales e historial."""

import pytest


@pytest.mark.api
class TestAnimalsList:
    def test_list_animals(self, client, seed):
        res = client.get("/animals/")
        assert res.status_code == 200
        animals = res.json()
        assert any(a["name"] == "Kira" for a in animals)

    def test_get_animal(self, client, seed):
        res = client.get(f"/animals/{seed['animal'].id}")
        assert res.status_code == 200
        assert res.json()["name"] == "Kira"

    def test_get_animal_not_found(self, client, db, seed):
        res = client.get("/animals/99999")
        assert res.status_code == 404


@pytest.mark.api
class TestAnimalHistory:
    def test_history_includes_reports(self, client, seed, sample_report):
        res = client.get(f"/animals/{seed['animal'].id}/history")
        assert res.status_code == 200
        data = res.json()
        assert data["animal"]["name"] == "Kira"
        assert len(data["reports"]) >= 1
        assert data["reports"][0]["transcript"] is not None

    def test_history_not_found(self, client, db, seed):
        res = client.get("/animals/99999/history")
        assert res.status_code == 404


@pytest.mark.api
class TestVaccines:
    def test_add_and_list_vaccine(self, client, auth_headers, seed, db):
        from src.models.models import VaccineCatalog
        vc = VaccineCatalog(name="Séxtuple Test")
        db.add(vc)
        db.commit()
        payload = {
            "vaccine_id": vc.id,
            "date_administered": "2025-01-15",
            "next_due_date": "2026-01-15",
            "lot_number": "LOT-1",
            "veterinarian_id": seed["vet"].id,
        }
        res = client.post(
            f"/animals/{seed['animal'].id}/vaccines",
            json=payload,
            headers=auth_headers,
        )
        assert res.status_code == 200
        res2 = client.get(f"/animals/{seed['animal'].id}/vaccines")
        assert res2.status_code == 200
        vaccines = res2.json()
        assert len(vaccines) >= 1
        assert vaccines[0]["veterinarian_id"] == seed["vet"].id


@pytest.mark.api
class TestDewormings:
    @pytest.mark.parametrize("endpoint,product_key", [
        ("internal_dewormings", "product_internal"),
        ("external_dewormings", "product_external"),
    ])
    def test_add_deworming(self, client, auth_headers, seed, endpoint, product_key):
        payload = {
            "date": "2025-03-01",
            "product_id": seed[product_key].id,
            "next_due_date": "2025-09-01",
        }
        res = client.post(
            f"/animals/{seed['animal'].id}/{endpoint}",
            json=payload,
            headers=auth_headers,
        )
        assert res.status_code == 200
        res2 = client.get(f"/animals/{seed['animal'].id}/{endpoint}")
        assert res2.status_code == 200
        assert len(res2.json()) >= 1


@pytest.mark.api
class TestHealthRecord:
    def test_get_or_create_health_record(self, client, seed):
        res = client.get(f"/animals/{seed['animal'].id}/health_record")
        assert res.status_code == 200
        assert res.json()["animal_id"] == seed["animal"].id


@pytest.mark.api
class TestVaccinesFrontendPayload:
    """Simula el payload del frontend (IDs string / veterinario vacío)."""

    def test_add_vaccine_with_empty_vet_and_string_ids(self, client, auth_headers, seed, db):
        from src.models.models import VaccineCatalog, Vaccine
        vc = VaccineCatalog(name="Antirrábica Payload")
        db.add(vc)
        db.commit()

        payload = {
            "vaccine_id": str(vc.id),
            "date_administered": "",
            "next_due_date": "",
            "lot_number": "",
            "veterinarian_id": "",
        }
        res = client.post(
            f"/animals/{seed['animal'].id}/vaccines",
            json=payload,
            headers=auth_headers,
        )
        assert res.status_code == 200, res.text

        saved = db.query(Vaccine).filter(Vaccine.vaccine_id == vc.id).all()
        assert len(saved) == 1
        assert saved[0].veterinarian_id is None
        assert saved[0].date_administered is not None

        listed = client.get(f"/animals/{seed['animal'].id}/vaccines").json()
        assert any(v["vaccine_id"] == vc.id for v in listed)


@pytest.mark.api
class TestLabResultsPersistence:
    def test_add_and_list_lab_result(self, client, auth_headers, seed, db):
        from src.models.models import LaboratoryCatalog, LabResult
        lab_cat = LaboratoryCatalog(name="Hemograma Persist")
        db.add(lab_cat)
        db.commit()

        payload = {
            "laboratory_id": str(lab_cat.id),
            "date": "2025-06-01",
            "document_url": "https://example.com/lab.pdf",
        }
        res = client.post(
            f"/animals/{seed['animal'].id}/lab_results",
            json=payload,
            headers=auth_headers,
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["document_url"] == "https://example.com/lab.pdf"
        assert body["laboratory"]["name"] == "Hemograma Persist"

        in_db = db.query(LabResult).filter(LabResult.animal_id == seed["animal"].id).all()
        assert len(in_db) >= 1

        listed = client.get(f"/animals/{seed['animal'].id}/lab_results").json()
        assert any(l["laboratory_id"] == lab_cat.id for l in listed)


@pytest.mark.api
class TestMedicationsPersistence:
    def test_add_and_list_medication(self, client, auth_headers, seed, db):
        from src.models.models import AnimalMedication
        payload = {
            "medication_name": "Amoxicilina",
            "dosage": "1 comprimido",
            "frequency": "cada 12 hs",
            "is_current": True,
            "amount_per_day": None,
            "duration_days": 7,
            "is_forever": False,
            "schedules": ["08:00", "20:00"],
        }
        res = client.post(
            f"/animals/{seed['animal'].id}/medications",
            json=payload,
            headers=auth_headers,
        )
        assert res.status_code == 200, res.text

        saved = db.query(AnimalMedication).filter(AnimalMedication.animal_id == seed["animal"].id).all()
        assert len(saved) == 1

        listed = client.get(
            f"/animals/{seed['animal'].id}/medications",
            headers=auth_headers,
        ).json()
        assert listed[0]["medication_name"] == "Amoxicilina"
        assert listed[0]["schedules"] == ["08:00", "20:00"]
