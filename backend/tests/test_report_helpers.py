"""Tests para report_helpers: severidad, alertas críticas."""

import pytest
from src.models.models import Animal, Report, ColorRule, CriticalAlert
from src.services.tag_helpers import set_color_keywords
from src.services.report_helpers import (
    calculate_severity_from_inserts,
    create_critical_alerts_for_report,
    resolve_critical_alert,
    format_critical_alert_message,
)


def _event(etype, value):
    return {"table_name": "ReportEvent", "fields": {"event_type_name": etype, "value": value}}


@pytest.mark.unit
class TestCalculateSeverity:
    @pytest.mark.parametrize("inserts,expected", [
        ([], "normal"),
        ([_event("Comida", "todo")], "normal"),
        ([_event("Comida", "poco")], "observation"),
        ([_event("Caca", "blanda")], "observation"),
        ([_event("Comida", "mitad")], "observation"),
        ([_event("Comida", "no")], "critical"),
        ([_event("Comida", "nada")], "critical"),
        ([_event("Caca", "sangre")], "critical"),
        ([_event("Caca", "diarrea")], "critical"),
        ([_event("Enfermedad", "vómito")], "critical"),
        ([_event("Medicación", "antibiótico")], "critical"),
        ([_event("Comida", "poco"), _event("Caca", "sangre")], "critical"),
        ([_event("Agua", "regular")], "normal"),
        ([_event("Caca", "observación")], "observation"),
        ([_event("Comida", "herida")], "critical"),
        ([_event("Comida", "vomit")], "critical"),
    ])
    def test_severity(self, inserts, expected):
        assert calculate_severity_from_inserts(inserts) == expected


@pytest.mark.unit
class TestCriticalAlerts:
    def _seed_red_rules(self, db):
        exact = ColorRule(color="red", match_type="exact")
        partial = ColorRule(color="red", match_type="partial")
        db.add_all([exact, partial])
        db.flush()
        set_color_keywords(db, exact, ["no", "nada"])
        set_color_keywords(db, partial, ["sangre", "vomito"])

    def test_create_alerts_on_sangre(self, db, seed):
        self._seed_red_rules(db)
        animal = seed["animal"]
        report = Report(user_id=seed["admin"].id, animal_id=animal.id, audio_transcript="sangre en caca")
        db.add(report)
        db.flush()
        alerts = create_critical_alerts_for_report(
            db, animal, report.id, "sangre en caca", ["sangre"]
        )
        db.commit()
        assert len(alerts) >= 1
        assert animal.severity == "critical"
        assert any(a.keyword_detected == "sangre" for a in alerts)

    def test_no_alert_on_normal(self, db, seed):
        self._seed_red_rules(db)
        animal = seed["animal"]
        report = Report(user_id=seed["admin"].id, animal_id=animal.id, audio_transcript="todo bien")
        db.add(report)
        db.flush()
        alerts = create_critical_alerts_for_report(db, animal, report.id, "todo bien", ["todo"])
        assert len(alerts) == 0

    def test_resolve_alert(self, db, seed):
        alert = CriticalAlert(animal_id=seed["animal"].id, keyword_detected="sangre")
        db.add(alert)
        db.commit()
        resolved = resolve_critical_alert(db, alert.id)
        assert resolved is not None
        assert resolved.is_resolved is True
        assert resolved.resolved_at is not None

    def test_resolve_missing(self, db):
        assert resolve_critical_alert(db, 99999) is None

    def test_format_message(self):
        msg = format_critical_alert_message("vomito")
        assert "vomito" in msg
        assert "Palabra crítica" in msg
