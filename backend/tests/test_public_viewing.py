"""Anonymous viewing of public finished sessions."""

from __future__ import annotations

import pytest
from rest_framework.test import APIRequestFactory

from apps.rendering.views import SessionResultView, SessionTimelapseView
from apps.sessions.models import GameSession, SessionPlayer
from apps.sessions.services import finish_session, start_session
from apps.sessions.views import SessionStateView


@pytest.fixture
def finished_sessions(db, django_user_model):
    """Create a public and a private finished session.

    Args:
        db: Pytest-django database fixture.
        django_user_model: The configured user model.

    Returns:
        A dict with the ``public`` and ``private`` finished sessions.
    """
    owner = django_user_model.objects.create_user("owner", "pw12345678")
    player = django_user_model.objects.create_user("alice", "pw12345678")

    sessions = {}
    for label, is_public in (("public", True), ("private", False)):
        session = GameSession.objects.create(
            name=f"{label} session",
            owner_id=owner.id,
            canvas_width=200,
            canvas_height=200,
            grid_cols=2,
            grid_rows=2,
            players_count=1,
            interval_seconds=60,
            unlock_quota=1,
            context_shape="rectangle",
            context_radius_mode="max",
            context_radius_pct=100,
            distribution_strategy="random",
            is_public=is_public,
        )
        SessionPlayer.objects.create(session=session, user=player)
        start_session(session)
        finish_session(session)
        sessions[label] = session
    return sessions


def test_anonymous_state_of_public_session(finished_sessions):
    """An anonymous viewer reads the state of a public finished session."""
    session = finished_sessions["public"]
    factory = APIRequestFactory()
    request = factory.get(f"/sessions/{session.id}/state")
    response = SessionStateView.as_view()(request, session_id=session.id)

    assert response.status_code == 200
    payload = response.data
    assert payload["session"]["id"] == session.id
    assert payload["status"] == "finished"
    assert len(payload["cells"]) == 4
    assert payload["can_unlock"] is False
    assert payload["available_unlocks"] == 0
    assert payload["result_viewed"] is False
    assert all(item["is_mine"] is False for item in payload["cells"])


def test_anonymous_state_of_private_session_is_hidden(finished_sessions):
    """A private finished session is invisible to anonymous viewers."""
    session = finished_sessions["private"]
    factory = APIRequestFactory()
    request = factory.get(f"/sessions/{session.id}/state")
    response = SessionStateView.as_view()(request, session_id=session.id)

    assert response.status_code == 404


def test_anonymous_result_of_public_session(finished_sessions):
    """An anonymous viewer reads the result of a public finished session."""
    session = finished_sessions["public"]
    factory = APIRequestFactory()
    request = factory.get(f"/sessions/{session.id}/result")
    response = SessionResultView.as_view()(request, session_id=session.id)

    assert response.status_code == 200
    assert response.data["session_id"] == session.id
    assert response.data["grid_cols"] == 2


def test_anonymous_result_of_private_session_is_denied(finished_sessions):
    """A private finished result is not served to anonymous viewers."""
    session = finished_sessions["private"]
    factory = APIRequestFactory()
    request = factory.get(f"/sessions/{session.id}/result")
    response = SessionResultView.as_view()(request, session_id=session.id)

    assert response.status_code == 403


def test_anonymous_timelapse_of_public_session(finished_sessions):
    """An anonymous viewer replays a public finished session."""
    session = finished_sessions["public"]
    factory = APIRequestFactory()
    request = factory.get(f"/sessions/{session.id}/timelapse")
    response = SessionTimelapseView.as_view()(request, session_id=session.id)

    assert response.status_code == 200
    assert response.data["session_id"] == session.id
    assert response.data["cell_width"] == 100.0
    assert isinstance(response.data["events"], list)


def test_anonymous_timelapse_of_private_session_is_denied(finished_sessions):
    """A private timelapse is not served to anonymous viewers."""
    session = finished_sessions["private"]
    factory = APIRequestFactory()
    request = factory.get(f"/sessions/{session.id}/timelapse")
    response = SessionTimelapseView.as_view()(request, session_id=session.id)

    assert response.status_code == 403
