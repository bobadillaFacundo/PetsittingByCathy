"""Comparación de peso en reportes (evento Peso)."""

from __future__ import annotations

import re
from typing import Optional

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
