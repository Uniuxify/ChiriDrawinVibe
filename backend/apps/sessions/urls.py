"""URL routes for sessions, players and lifecycle actions."""

from __future__ import annotations

from django.urls import path

from apps.sessions.views import (
    FinishSessionView,
    JoinSessionView,
    MySessionsView,
    PublicFinishedSessionsView,
    SessionCreateView,
    SessionDetailView,
    SessionPlayerView,
    SessionStateView,
    StartSessionView,
)

urlpatterns = [
    path("sessions/mine", MySessionsView.as_view(), name="sessions-mine"),
    path(
        "sessions/public/finished",
        PublicFinishedSessionsView.as_view(),
        name="sessions-public-finished",
    ),
    path("sessions", SessionCreateView.as_view(), name="sessions-create"),
    path("sessions/join", JoinSessionView.as_view(), name="sessions-join"),
    path(
        "sessions/<int:session_id>",
        SessionDetailView.as_view(),
        name="session-detail",
    ),
    path(
        "sessions/<int:session_id>/players",
        SessionPlayerView.as_view(),
        name="session-players",
    ),
    path(
        "sessions/<int:session_id>/players/<int:user_id>",
        SessionPlayerView.as_view(),
        name="session-player-detail",
    ),
    path(
        "sessions/<int:session_id>/start",
        StartSessionView.as_view(),
        name="session-start",
    ),
    path(
        "sessions/<int:session_id>/finish",
        FinishSessionView.as_view(),
        name="session-finish",
    ),
    path(
        "sessions/<int:session_id>/state",
        SessionStateView.as_view(),
        name="session-state",
    ),
]
