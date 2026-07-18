"""Utilidades compartidas para reportes: severidad y alertas críticas."""

from typing import Optional
from sqlalchemy.orm import Session
from src.models.models import CriticalAlert, Animal
from src.services.tag_helpers import load_color_rules, detect_keywords_in_text
from src.timezone_ar import now_ar


def calculate_severity_from_inserts(inserts: list) -> str:
    severity = "normal"
    for insert in inserts:
        if insert.get("table_name") == "ReportEvent":
            etype = insert.get("fields", {}).get("event_type_name", "").lower()
            val = insert.get("fields", {}).get("value", "").lower()
            if any(k in etype for k in ["enfermedad", "medicación", "medicacion"]):
                return "critical"
            if any(k in etype for k in ["observacion", "observación", "nota"]):
                if severity != "critical":
                    severity = "observation"
            if any(k in val for k in ["no", "nada", "sangre", "líquido", "diarrea", "vomit", "herida"]):
                severity = "critical"
            elif any(k in val for k in ["poco", "blanda", "mitad", "observación", "observacion"]):
                if severity != "critical":
                    severity = "observation"
        elif insert.get("table_name") == "AnimalObservation":
            if severity != "critical":
                severity = "observation"
    return severity


def create_critical_alerts_for_report(
    db: Session,
    animal: Animal,
    report_id: int,
    transcript: str,
    event_values: list[str],
) -> list[CriticalAlert]:
    all_text = transcript + " " + " ".join(event_values)
    
    red_rules = load_color_rules(db, color="red")
    yellow_rules = load_color_rules(db, color="yellow")
    
    red_keywords = detect_keywords_in_text(all_text, red_rules)
    yellow_keywords = detect_keywords_in_text(all_text, yellow_rules)
    
    alerts = []
    has_red = False
    
    for kw in red_keywords:
        alert = CriticalAlert(
            animal_id=animal.id,
            report_id=report_id,
            keyword_detected=kw,
            severity="red",
        )
        db.add(alert)
        alerts.append(alert)
        has_red = True
        
    for kw in yellow_keywords:
        # Evitamos duplicar si la misma palabra está en ambas reglas, aunque es raro
        if kw not in red_keywords:
            alert = CriticalAlert(
                animal_id=animal.id,
                report_id=report_id,
                keyword_detected=kw,
                severity="yellow",
            )
            db.add(alert)
            alerts.append(alert)

    if has_red:
        animal.severity = "critical"
    elif alerts and animal.severity != "critical":
        animal.severity = "observation"
        
    return alerts


def resolve_critical_alert(db: Session, alert_id: int) -> Optional[CriticalAlert]:
    alert = db.query(CriticalAlert).filter(CriticalAlert.id == alert_id).first()
    if not alert:
        return None
    alert.is_resolved = True
    alert.resolved_at = now_ar()
    return alert


def format_critical_alert_message(keyword: str) -> str:
    return f'Palabra crítica detectada: "{keyword}"'
