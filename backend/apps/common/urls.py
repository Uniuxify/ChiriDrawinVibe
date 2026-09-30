"""Public configuration endpoints."""

from __future__ import annotations

from django.urls import path

from apps.common.views import PublicConfigView

urlpatterns = [
    path("config", PublicConfigView.as_view(), name="public-config"),
]
