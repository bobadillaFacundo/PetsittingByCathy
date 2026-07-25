"""Tests para weight_helpers."""

import pytest
from src.services.weight_helpers import (
    parse_weight_kg,
    is_weight_approximately_equal,
    weight_change_color,
)


@pytest.mark.unit
class TestParseWeightKg:
    @pytest.mark.parametrize("raw,expected", [
        ("12.5", 12.5),
        ("12,5 kg", 12.5),
        ("pesa 8 kilos", 8.0),
        ("", None),
        (None, None),
        ("sin dato", None),
    ])
    def test_parse(self, raw, expected):
        assert parse_weight_kg(raw) == expected


@pytest.mark.unit
class TestWeightComparison:
    def test_equal_within_tolerance(self):
        assert is_weight_approximately_equal(10.0, 10.5) is True
        assert weight_change_color(10.0, 10.5) == "green"

    def test_large_change_is_red(self):
        assert is_weight_approximately_equal(10.0, 12.0) is False
        assert weight_change_color(10.0, 12.0) == "red"

    def test_no_reference_is_green(self):
        assert weight_change_color(10.0, None) == "green"
