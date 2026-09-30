"""Application configuration for the iterations app."""

from __future__ import annotations

from django.apps import AppConfig


class IterationsConfig(AppConfig):
    """Configuration for session iterations."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.iterations"
