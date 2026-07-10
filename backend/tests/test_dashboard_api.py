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


@pytest.mark.api
class TestDictionary:
    def test_dictionary_endpoint(self, client, seed, auth_headers):
        res = client.get("/dashboard/dictionary", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert any(d["name"] == "Comida" for d in data)
        assert "variants" in data[0]
