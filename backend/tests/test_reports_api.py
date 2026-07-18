"""Tests de endpoints de reportes."""

import io
from unittest.mock import patch, MagicMock

import pytest


@pytest.mark.api
class TestReportsConfirm:
    def test_confirm_report(self, client, auth_headers, seed):
        payload = {
            "user_id": seed["admin"].id,
            "transcript": "Kira comió todo.",
            "extracted_data": [{
                "animal": "Kira",
                "inserts": [{
                    "table_name": "ReportEvent",
                    "fields": {"event_type_name": "Comida", "value": "todo"}
                }]
            }]
        }
        res = client.post("/reports/confirm", json=payload, headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert len(data["saved_reports"]) == 1

    def test_confirm_creates_critical_alert(self, client, auth_headers, seed, db):
        payload = {
            "user_id": seed["admin"].id,
            "transcript": "Kira vomitó con sangre.",
            "extracted_data": [{
                "animal": "Kira",
                "inserts": [{
                    "table_name": "ReportEvent",
                    "fields": {"event_type_name": "Enfermedad", "value": "sangre"}
                }]
            }]
        }
        res = client.post("/reports/confirm", json=payload, headers=auth_headers)
        assert res.status_code == 200
        from src.models.models import CriticalAlert
        alerts = db.query(CriticalAlert).all()
        assert len(alerts) >= 1

    def test_confirm_upserts_duplicate_event_type(self, client, auth_headers, seed, db):
        payload = {
            "user_id": seed["admin"].id,
            "transcript": "Kira comió.",
            "extracted_data": [{
                "animal": "Kira",
                "inserts": [
                    {"table_name": "ReportEvent", "fields": {"event_type_name": "Comida", "value": "poco"}},
                    {"table_name": "ReportEvent", "fields": {"event_type_name": "Comida", "value": "todo"}},
                ]
            }]
        }
        client.post("/reports/confirm", json=payload, headers=auth_headers)
        from src.models.models import ReportEvent
        events = db.query(ReportEvent).all()
        comida_events = [e for e in events if e.value in ("poco", "todo")]
        assert len(comida_events) == 1

    def test_confirm_requires_auth(self, client, seed):
        res = client.post("/reports/confirm", json={"user_id": 1, "transcript": "x", "extracted_data": []})
        assert res.status_code == 401


@pytest.mark.api
class TestReportsEdit:
    @patch("src.routes.report_routes.NLPService.extract_events_from_transcript")
    def test_edit_transcript(self, mock_nlp, client, auth_headers, seed, sample_report):
        mock_nlp.return_value = {
            "cleaned_text": "Kira no comió nada.",
            "data": [{
                "animal": "Kira",
                "severity": "critical",
                "inserts": [{
                    "standard_set": "Comida",
                    "spoken_variant": "comió",
                    "value": "no"
                }]
            }]
        }
        res = client.put(
            f"/reports/{sample_report.id}/edit",
            json={"transcript": "Kira no comió nada."},
            headers=auth_headers,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert "no" in data["transcript"].lower() or "nada" in data["transcript"].lower()

    def test_edit_not_found(self, client, auth_headers):
        res = client.put("/reports/99999/edit", json={"transcript": "x"}, headers=auth_headers)
        assert res.status_code == 404


@pytest.mark.api
class TestReportsPhoto:
    def test_attach_photo(self, client, auth_headers, sample_report):
        fake_image = io.BytesIO(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
        res = client.post(
            f"/reports/{sample_report.id}/attach-photo",
            files={"photo": ("test.jpg", fake_image, "image/jpeg")},
            headers=auth_headers,
        )
        assert res.status_code == 200
        assert "file_url" in res.json()

    def test_attach_photo_invalid_format(self, client, auth_headers, sample_report):
        res = client.post(
            f"/reports/{sample_report.id}/attach-photo",
            files={"photo": ("bad.txt", io.BytesIO(b"text"), "text/plain")},
            headers=auth_headers,
        )
        assert res.status_code == 400


@pytest.mark.api
class TestReportsList:
    def test_get_all_reports(self, client, auth_headers, sample_report):
        res = client.get("/reports/all", headers=auth_headers)
        assert res.status_code == 200
        reports = res.json()
        assert isinstance(reports, list)
        assert any(r["animal_name"] == "Kira" for r in reports)


@pytest.mark.api
class TestReportsDelete:
    def test_delete_report_physically(self, client, auth_headers, seed, sample_report, db):
        from src.models.models import Report, ReportEvent, Attachment
        rid = sample_report.id
        db.add(Attachment(
            animal_id=seed["animal"].id,
            report_id=rid,
            file_type="image",
            file_url="/uploads/photos/fake.jpg",
        ))
        db.commit()

        res = client.delete(f"/reports/{rid}", headers=auth_headers)
        assert res.status_code == 204

        assert db.query(Report).filter(Report.id == rid).first() is None
        assert db.query(ReportEvent).filter(ReportEvent.report_id == rid).count() == 0
        assert db.query(Attachment).filter(Attachment.report_id == rid).count() == 0

    def test_delete_report_not_found(self, client, auth_headers):
        res = client.delete("/reports/99999", headers=auth_headers)
        assert res.status_code == 404

    def test_delete_requires_auth(self, client, sample_report):
        res = client.delete(f"/reports/{sample_report.id}")
        assert res.status_code == 401
