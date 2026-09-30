"""Application configuration for the common app."""

from __future__ import annotations

from django.apps import AppConfig


class CommonConfig(AppConfig):
    """Configuration for shared utilities."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.common"
