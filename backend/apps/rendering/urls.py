"""URL routes for rendering artifacts and result views."""

from __future__ import annotations

from django.urls import path

from apps.rendering.views import SessionResultView, SessionTimelapseView

urlpatterns = [
    path(
        "sessions/<int:session_id>/result",
        SessionResultView.as_view(),
        name="session-result",
    ),
    path(
        "sessions/<int:session_id>/timelapse",
        SessionTimelapseView.as_view(),
        name="session-timelapse",
    ),
]
