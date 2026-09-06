"""Comparación de peso en reportes (evento Peso) e historial con fechas."""

from __future__ import annotations

import re
from typing import Optional

from sqlalchemy.orm import Session

from src.timezone_ar import now_ar, serialize_ar_datetime

WEIGHT_TOLERANCE_RATIO = 0.10
WEIGHT_TOLERANCE_ABS_KG = 0.5


def parse_weight_kg(value) -> Optional[float]:
    if value is None:
        return None
    text = str(value).strip().lower().replace(",", ".")
    if not text:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)", text)
    if not match:
        return None
    try:
        kg = float(match.group(1))
    except ValueError:
        return None
    return kg if kg > 0 else None


def is_weight_approximately_equal(current_kg: float, reference_kg: float) -> bool:
    if reference_kg <= 0:
        return True
    diff = abs(current_kg - reference_kg)
    if diff <= WEIGHT_TOLERANCE_ABS_KG:
        return True
    return diff / reference_kg <= WEIGHT_TOLERANCE_RATIO


def weight_change_color(current_kg: float, reference_kg: Optional[float]) -> str:
    """Verde si está cerca del peso de referencia; rojo si varió mucho."""
    if reference_kg is None:
        return "green"
    return "green" if is_weight_approximately_equal(current_kg, reference_kg) else "red"


def record_weight(
    db: Session,
    animal_id: int,
    kg,
    source: str = "ficha",
    report_id: Optional[int] = None,
    recorded_at=None,
):
    """Guarda un peso con fecha. Ignora duplicados del mismo día y valor."""
    from src.models.models import Animal, WeightRecord

    parsed = parse_weight_kg(kg)
    if parsed is None:
        return None
    when = recorded_at or now_ar()
    last = (
        db.query(WeightRecord)
        .filter(WeightRecord.animal_id == animal_id)
        .order_by(WeightRecord.recorded_at.desc())
        .first()
    )
    if (
        last
        and abs(last.kg - parsed) < 0.01
        and last.recorded_at.date() == when.date()
    ):
        return last

    row = WeightRecord(
        animal_id=animal_id,
        kg=parsed,
        recorded_at=when,
        source=source if source in ("ficha", "reporte") else "ficha",
        report_id=report_id,
    )
    db.add(row)
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if animal is not None:
        animal.weight_kg = parsed
    return row


def list_weight_history(db: Session, animal_id: int) -> list[dict]:
    """Historial: registros guardados + eventos Peso de reportes aún no copiados."""
    from src.models.models import Animal, EventType, Report, ReportEvent, WeightRecord

    items: list[dict] = []
    seen_report_ids: set[int] = set()

    rows = (
        db.query(WeightRecord)
        .filter(WeightRecord.animal_id == animal_id)
        .order_by(WeightRecord.recorded_at.desc())
        .all()
    )
    for row in rows:
        if row.report_id:
            seen_report_ids.add(row.report_id)
        items.append({
            "id": row.id,
            "kg": row.kg,
            "recorded_at": serialize_ar_datetime(row.recorded_at),
            "source": row.source or "ficha",
            "report_id": row.report_id,
        })

    peso_type = db.query(EventType).filter(EventType.name.ilike("peso")).first()
    if peso_type:
        events = (
            db.query(ReportEvent, Report)
            .join(Report, ReportEvent.report_id == Report.id)
            .filter(
                Report.animal_id == animal_id,
                ReportEvent.event_type_id == peso_type.id,
            )
            .order_by(Report.created_at.desc())
            .all()
        )
        for event, report in events:
            if report.id in seen_report_ids:
                continue
            kg = parse_weight_kg(event.value)
            if kg is None:
                continue
            items.append({
                "id": None,
                "kg": kg,
                "recorded_at": serialize_ar_datetime(report.created_at),
                "source": "reporte",
                "report_id": report.id,
            })

    items.sort(key=lambda x: x["recorded_at"] or "", reverse=True)

    if not items:
        animal = db.query(Animal).filter(Animal.id == animal_id).first()
        if animal and animal.weight_kg:
            items.append({
                "id": None,
                "kg": animal.weight_kg,
                "recorded_at": None,
                "source": "ficha",
                "report_id": None,
            })
    return items
