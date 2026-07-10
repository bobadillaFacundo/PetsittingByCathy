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
