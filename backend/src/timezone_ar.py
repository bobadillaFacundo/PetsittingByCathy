"""Horario oficial de la app: Argentina (America/Argentina/Buenos_Aires)."""
from __future__ import annotations

import os
import time
from datetime import date, datetime
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
