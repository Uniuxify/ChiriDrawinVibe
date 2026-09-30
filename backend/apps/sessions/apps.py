"""Application configuration for the sessions app."""

from __future__ import annotations

from django.apps import AppConfig


class SessionsConfig(AppConfig):
    """Configuration for drawing sessions.

    The explicit ``label`` avoids a clash with ``django.contrib.sessions``,
    whose default label is also ``sessions``.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.sessions"
    label = "game_sessions"
