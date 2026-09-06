"""Tests del dashboard y alertas críticas."""

import pytest
from src.models.models import CriticalAlert


@pytest.mark.api
class TestDashboard:
    def test_dashboard_structure(self, client, db, seed):
        res = client.get("/dashboard/")
        assert res.status_code == 200
        data = res.json()
        assert "normal_animals" in data
        assert "observation_animals" in data
        assert "alerts" in data
        assert "critical_alerts" in data

    def test_dashboard_lists_kira(self, client, seed):
        res = client.get("/dashboard/")
        data = res.json()
        all_animals = data["normal_animals"] + data["observation_animals"]
        assert any(a["name"] == "Kira" for a in all_animals)

    def test_critical_alerts_in_dashboard(self, client, seed, db):
        alert = CriticalAlert(animal_id=seed["animal"].id, keyword_detected="sangre")
        db.add(alert)
        db.commit()
        res = client.get("/dashboard/")
        critical = res.json()["critical_alerts"]
        assert len(critical) >= 1
        assert critical[0]["keyword_detected"] == "sangre"
        assert "Palabra crítica" in critical[0]["message"]

    def test_resolve_critical_alert(self, client, seed, db):
        alert = CriticalAlert(animal_id=seed["animal"].id, keyword_detected="vomito")
        db.add(alert)
        db.commit()
        res = client.patch(f"/dashboard/critical-alerts/{alert.id}/resolve")
        assert res.status_code == 200
        db.refresh(alert)
        assert alert.is_resolved is True

    def test_resolve_alert_not_found(self, client, db, seed):
        res = client.patch("/dashboard/critical-alerts/99999/resolve")
        assert res.status_code == 404

    def test_new_vaccine_replaces_expired_alert(self, client, seed, db):
        from datetime import timedelta
        from src.models.models import Vaccine, VaccineCatalog, HealthRecord
        from src.timezone_ar import today_ar

        today = today_ar()
        catalog = VaccineCatalog(name="Antirrábica Alerta")
        db.add(catalog)
        db.flush()
        health = db.query(HealthRecord).filter(HealthRecord.animal_id == seed["animal"].id).first()
        db.add(Vaccine(
            health_record_id=health.id,
            vaccine_id=catalog.id,
            date_administered=today - timedelta(days=400),
            next_due_date=today - timedelta(days=30),
        ))
        db.commit()

        expired = client.get("/dashboard/").json()["alerts"]
        assert any("VENCIDA" in a["message"] for a in expired)

        db.add(Vaccine(
            health_record_id=health.id,
            vaccine_id=catalog.id,
            date_administered=today,
            next_due_date=today + timedelta(days=365),
        ))
        db.commit()

        after = client.get("/dashboard/").json()["alerts"]
        assert not any("VENCIDA" in a["message"] for a in after)
        assert not any("Vacuna" in a["message"] for a in after)

    def test_new_deworming_replaces_expired_alert(self, client, seed, db):
        from datetime import timedelta
        from src.models.models import Deworming
        from src.timezone_ar import today_ar

        today = today_ar()
        db.add(Deworming(
            animal_id=seed["animal"].id,
            product_id=seed["product_internal"].id,
            date=today - timedelta(days=120),
            next_due_date=today - timedelta(days=20),
        ))
        db.commit()

        expired = client.get("/dashboard/").json()["alerts"]
        assert any("VENCIDA" in a["message"] for a in expired)

        db.add(Deworming(
            animal_id=seed["animal"].id,
            product_id=seed["product_internal"].id,
            date=today,
            next_due_date=today + timedelta(days=90),
        ))
        db.commit()

        after = client.get("/dashboard/").json()["alerts"]
        assert not any("VENCIDA" in a["message"] for a in after)
        assert not any("Desparasitación" in a["message"] for a in after)


@pytest.mark.api
class TestDictionary:
    def test_dictionary_endpoint(self, client, seed, auth_headers):
        res = client.get("/dashboard/dictionary", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert any(d["name"] == "Comida" for d in data)
        assert "variants" in data[0]
