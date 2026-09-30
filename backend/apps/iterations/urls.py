"""URL routes for iteration state."""

from __future__ import annotations

from django.urls import path

from apps.iterations.views import CurrentIterationView

urlpatterns = [
    path(
        "sessions/<int:session_id>/iteration/current",
        CurrentIterationView.as_view(),
        name="session-current-iteration",
    ),
]
