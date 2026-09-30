"""Application configuration for the accounts app."""

from __future__ import annotations

from django.apps import AppConfig


class AccountsConfig(AppConfig):
    """Configuration for user accounts."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"
