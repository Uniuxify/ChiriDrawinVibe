"""Validation of drawing operation histories."""

from __future__ import annotations

import pytest

from apps.cells.validation import validate_history
from apps.common.errors import ValidationError


def _stroke(points: list[list[float]]) -> dict:
    """Build a minimal stroke operation.

    Args:
        points: Normalized ``[x, y]`` pairs of the stroke.

    Returns:
        A stroke operation mapping.
    """
    return {
        "type": "stroke",
        "tool": "brush",
        "color": "#000000",
        "size": 0.05,
        "points": points,
    }


def test_points_inside_the_cell_are_accepted() -> None:
    """Coordinates within the unit cell stay valid."""
    operation = _stroke([[0.0, 0.0], [1.0, 1.0]])
    validated = validate_history([operation])
    assert validated[0]["points"] == [[0.0, 0.0], [1.0, 1.0]]


def test_points_in_the_margin_are_accepted() -> None:
    """The infinite drawing plane allows a one-cell margin around the cell."""
    operation = _stroke([[-1.0, -1.0], [2.0, 2.0]])
    assert validate_history([operation])


def test_points_beyond_the_margin_are_rejected() -> None:
    """Coordinates outside the accepted margin are rejected."""
    operation = _stroke([[0.5, 0.5], [2.5, 0.5]])
    with pytest.raises(ValidationError):
        validate_history([operation])
