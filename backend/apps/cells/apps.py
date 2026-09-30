"""Application configuration for the cells app."""

from __future__ import annotations

from django.apps import AppConfig


class CellsConfig(AppConfig):
    """Configuration for cells and drawing history."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.cells"
