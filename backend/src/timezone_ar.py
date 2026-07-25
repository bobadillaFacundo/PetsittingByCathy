"""Horario oficial de la app: Argentina (America/Argentina/Buenos_Aires)."""
from __future__ import annotations

import os
import time
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")


def force_process_timezone() -> None:
    """Fija TZ del proceso (Linux/Render). En Windows tzset no existe."""
    os.environ["TZ"] = "America/Argentina/Buenos_Aires"
    if hasattr(time, "tzset"):
        time.tzset()


def now_ar() -> datetime:
    """Ahora en Argentina como datetime naive (compatible con columnas DateTime actuales)."""
    return datetime.now(AR_TZ).replace(tzinfo=None)


def today_ar() -> date:
    return datetime.now(AR_TZ).date()


def to_ar_naive(dt: datetime) -> datetime:
    """Normaliza a datetime naive en hora Argentina (columnas DateTime actuales)."""
    if dt.tzinfo is not None:
        return dt.astimezone(AR_TZ).replace(tzinfo=None)
    return dt


def serialize_ar_datetime(dt: datetime) -> str:
    """ISO 8601 con offset Argentina para respuestas API."""
    aware = dt.replace(tzinfo=AR_TZ) if dt.tzinfo is None else dt.astimezone(AR_TZ)
    return aware.isoformat(timespec="seconds")


def serialize_ar_date(d: date) -> str:
    """Fecha de vencimiento (all-day) al mediodía AR para evitar saltos de día."""
    return serialize_ar_datetime(datetime.combine(d, time(12, 0)))
