"""Genera fechas de una serie (diaria, semanal, mensual, anual)."""
from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, timedelta

RECURRENCE_NONE = "none"
RECURRENCE_DAILY = "daily"
RECURRENCE_WEEKLY = "weekly"
RECURRENCE_MONTHLY = "monthly"
RECURRENCE_YEARLY = "yearly"

VALID_RECURRENCES = {
    RECURRENCE_NONE,
    RECURRENCE_DAILY,
    RECURRENCE_WEEKLY,
    RECURRENCE_MONTHLY,
    RECURRENCE_YEARLY,
}

MAX_OCCURRENCES = {
    RECURRENCE_DAILY: 366,
    RECURRENCE_WEEKLY: 104,
    RECURRENCE_MONTHLY: 36,
    RECURRENCE_YEARLY: 10,
}


def _add_months(dt: datetime, months: int) -> datetime:
    year = dt.year + (dt.month - 1 + months) // 12
    month = (dt.month - 1 + months) % 12 + 1
    last_day = monthrange(year, month)[1]
    return dt.replace(year=year, month=month, day=min(dt.day, last_day))


def _add_years(dt: datetime, years: int) -> datetime:
    year = dt.year + years
    last_day = monthrange(year, dt.month)[1]
    return dt.replace(year=year, day=min(dt.day, last_day))


def _shift(start: datetime, freq: str, step: int) -> datetime:
    if freq == RECURRENCE_DAILY:
        return start + timedelta(days=step)
    if freq == RECURRENCE_WEEKLY:
        return start + timedelta(weeks=step)
    if freq == RECURRENCE_MONTHLY:
        return _add_months(start, step)
    if freq == RECURRENCE_YEARLY:
        return _add_years(start, step)
    return start


def build_occurrences(
    start: datetime,
    end: datetime,
    recurrence: str | None,
    until: date | None,
) -> list[tuple[datetime, datetime]]:
    """Devuelve pares (inicio, fin) inclusive hasta `until`. Una sola si no hay serie."""
    freq = (recurrence or RECURRENCE_NONE).strip().lower()
    if freq not in VALID_RECURRENCES:
        freq = RECURRENCE_NONE
    if freq == RECURRENCE_NONE or until is None:
        return [(start, end)]

    duration = end - start
    if duration.total_seconds() < 0:
        duration = timedelta(0)

    limit = MAX_OCCURRENCES[freq]
    occurrences: list[tuple[datetime, datetime]] = []
    for step in range(limit + 1):
        occ_start = _shift(start, freq, step)
        if occ_start.date() > until:
            break
        if len(occurrences) >= limit:
            break
        occurrences.append((occ_start, occ_start + duration))

    return occurrences or [(start, end)]


def exceeds_max(start: datetime, recurrence: str, until: date) -> bool:
    freq = (recurrence or RECURRENCE_NONE).strip().lower()
    if freq not in MAX_OCCURRENCES or until is None:
        return False
    limit = MAX_OCCURRENCES[freq]
    next_after_limit = _shift(start, freq, limit)
    return next_after_limit.date() <= until
