"""Tests de reservas / Otras actividades."""

def test_create_other_activity_without_animal(client, seed, auth_headers):
    payload = {
        "animal_id": None,
        "species_id": None,
        "start_date": "2026-07-25T10:00:00-03:00",
        "end_date": "2026-07-25T11:00:00-03:00",
        "status": "Otras actividades",
        "notes": "Limpieza del patio",
    }
    res = client.post("/reservations/", json=payload, headers=auth_headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "Otras actividades"
    assert data["animal_id"] is None
    assert data["notes"] == "Limpieza del patio"


def test_create_other_activity_with_daycare_animal(client, seed, auth_headers, db):
    animal = seed["animal"]
    species = seed["species"]
    payload = {
        "animal_id": animal.id,
        "species_id": species.id,
        "start_date": "2026-07-25T14:00:00-03:00",
        "end_date": "2026-07-25T15:00:00-03:00",
        "status": "Otras actividades",
        "notes": "Control veterinario",
    }
    animal.is_castrated = None
    db.commit()

    res = client.post("/reservations/", json=payload, headers=auth_headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["animal_id"] == animal.id
    assert data["animal"]["name"] == animal.name


def test_other_activity_requires_notes(client, seed, auth_headers):
    payload = {
        "animal_id": None,
        "start_date": "2026-07-25T10:00:00-03:00",
        "end_date": "2026-07-25T11:00:00-03:00",
        "status": "Otras actividades",
        "notes": "   ",
    }
    res = client.post("/reservations/", json=payload, headers=auth_headers)
    assert res.status_code == 400


def test_cannot_change_service_event_type(client, seed, auth_headers):
    create = client.post(
        "/reservations/",
        json={
            "animal_id": seed["animal"].id,
            "start_date": "2026-07-25T10:00:00-03:00",
            "end_date": "2026-07-25T11:00:00-03:00",
            "status": "Llevar a Bañar",
            "notes": "",
        },
        headers=auth_headers,
    )
    assert create.status_code == 200
    res_id = create.json()["id"]

    bad = client.put(
        f"/reservations/{res_id}",
        json={"status": "Llevar Veterinaria"},
        headers=auth_headers,
    )
    assert bad.status_code == 400


def test_create_weekly_series(client, seed, auth_headers, db):
    from src.models.models import Reservation

    res = client.post(
        "/reservations/",
        json={
            "animal_id": None,
            "start_date": "2026-09-07T10:00:00-03:00",
            "end_date": "2026-09-07T11:00:00-03:00",
            "status": "Otras actividades",
            "notes": "Limpieza semanal",
            "recurrence": "weekly",
            "recurrence_until": "2026-09-28",
        },
        headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    first = res.json()
    assert first["series_id"]
    assert first["recurrence"] == "weekly"

    db.expire_all()
    rows = db.query(Reservation).filter(Reservation.series_id == first["series_id"]).all()
    assert len(rows) == 4


def test_delete_following_in_series(client, seed, auth_headers, db):
    from src.models.models import Reservation

    created = client.post(
        "/reservations/",
        json={
            "animal_id": None,
            "start_date": "2026-09-01T10:00:00-03:00",
            "end_date": "2026-09-01T11:00:00-03:00",
            "status": "Otras actividades",
            "notes": "Paseo diario",
            "recurrence": "daily",
            "recurrence_until": "2026-09-05",
        },
        headers=auth_headers,
    ).json()

    db.expire_all()
    rows = (
        db.query(Reservation)
        .filter(Reservation.series_id == created["series_id"])
        .order_by(Reservation.start_date)
        .all()
    )
    assert len(rows) == 5
    middle = rows[2]

    res = client.delete(
        f"/reservations/{middle.id}?scope=following",
        headers=auth_headers,
    )
    assert res.status_code == 204
    db.expire_all()
    left = db.query(Reservation).filter(Reservation.series_id == created["series_id"]).all()
    assert len(left) == 2


def test_recurrence_requires_until(client, seed, auth_headers):
    res = client.post(
        "/reservations/",
        json={
            "animal_id": None,
            "start_date": "2026-09-01T10:00:00-03:00",
            "end_date": "2026-09-01T11:00:00-03:00",
            "status": "Otras actividades",
            "notes": "Sin hasta",
            "recurrence": "monthly",
        },
        headers=auth_headers,
    )
    assert res.status_code == 400
