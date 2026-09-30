"""Application configuration for the rendering app."""

from __future__ import annotations

from django.apps import AppConfig


class RenderingConfig(AppConfig):
    """Configuration for the rendering pipeline."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.rendering"
