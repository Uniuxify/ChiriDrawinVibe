"""Validation helpers for session configuration."""

from __future__ import annotations

from django.conf import settings

from apps.common.errors import ValidationError


def validate_session_config(data: dict) -> None:
    """Validate canvas, grid and iteration parameters.

    Args:
        data: Mapping of session configuration values.

    Raises:
        ValidationError: If any value falls outside the allowed range.
    """
    width = int(data.get("canvas_width") or 0)
    height = int(data.get("canvas_height") or 0)
    if not settings.MIN_CANVAS_SIZE <= width <= settings.MAX_CANVAS_SIZE:
        raise ValidationError(
            f"canvas_width must be between {settings.MIN_CANVAS_SIZE} and "
            f"{settings.MAX_CANVAS_SIZE}."
        )
    if not settings.MIN_CANVAS_SIZE <= height <= settings.MAX_CANVAS_SIZE:
        raise ValidationError(
            f"canvas_height must be between {settings.MIN_CANVAS_SIZE} and "
            f"{settings.MAX_CANVAS_SIZE}."
        )

    cols = int(data.get("grid_cols") or 0)
    rows = int(data.get("grid_rows") or 0)
    if not settings.MIN_GRID <= cols <= settings.MAX_GRID:
        raise ValidationError(
            f"grid_cols must be between {settings.MIN_GRID} and {settings.MAX_GRID}."
        )
    if not settings.MIN_GRID <= rows <= settings.MAX_GRID:
        raise ValidationError(
            f"grid_rows must be between {settings.MIN_GRID} and {settings.MAX_GRID}."
        )

    players = int(data.get("players_count") or 0)
    if players < 1:
        raise ValidationError("players_count must be at least 1.")
    if players > cols * rows:
        raise ValidationError("players_count cannot exceed the number of cells.")

    interval = int(data.get("interval_seconds") or 0)
    if interval < settings.MIN_INTERVAL_SECONDS:
        raise ValidationError(
            f"interval_seconds must be at least {settings.MIN_INTERVAL_SECONDS}."
        )

    quota = int(data.get("unlock_quota") or 1)
    if quota < 1:
        raise ValidationError("unlock_quota must be at least 1.")

    radius = int(data.get("context_radius_pct") or 0)
    if not 0 <= radius <= 100:
        raise ValidationError("context_radius_pct must be between 0 and 100.")
