"""Tests del helper de recurrencia."""
from datetime import datetime, date

from src.services.recurrence import build_occurrences, exceeds_max


def test_daily_series_inclusive():
    start = datetime(2026, 9, 1, 10, 0)
    end = datetime(2026, 9, 1, 11, 0)
    occ = build_occurrences(start, end, "daily", date(2026, 9, 3))
    assert len(occ) == 3
    assert occ[1] == (datetime(2026, 9, 2, 10, 0), datetime(2026, 9, 2, 11, 0))


def test_weekly_series():
    start = datetime(2026, 9, 7, 9, 0)
    end = datetime(2026, 9, 7, 10, 0)
    occ = build_occurrences(start, end, "weekly", date(2026, 9, 28))
    assert len(occ) == 4
    assert occ[-1][0].date() == date(2026, 9, 28)


def test_monthly_clamps_day():
    start = datetime(2026, 1, 31, 8, 0)
    end = datetime(2026, 1, 31, 9, 0)
    occ = build_occurrences(start, end, "monthly", date(2026, 3, 31))
    assert [o[0].date() for o in occ] == [
        date(2026, 1, 31),
        date(2026, 2, 28),
        date(2026, 3, 31),
    ]


def test_yearly_series():
    start = datetime(2026, 9, 6, 12, 0)
    end = datetime(2026, 9, 6, 13, 0)
    occ = build_occurrences(start, end, "yearly", date(2028, 9, 6))
    assert len(occ) == 3
    assert occ[1][0].year == 2027


def test_none_or_missing_until_is_single():
    start = datetime(2026, 9, 6, 10, 0)
    end = datetime(2026, 9, 6, 11, 0)
    assert len(build_occurrences(start, end, "none", date(2026, 12, 1))) == 1
    assert len(build_occurrences(start, end, "daily", None)) == 1


def test_daily_exceeds_max():
    start = datetime(2026, 1, 1, 10, 0)
    assert exceeds_max(start, "daily", date(2027, 12, 31)) is True
    assert exceeds_max(start, "daily", date(2026, 1, 10)) is False
