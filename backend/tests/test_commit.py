"""Tests for cell commit resilience and the session state payload."""

from __future__ import annotations

import pytest
from django.contrib.auth.models import AnonymousUser
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.cells.services import unlock_cell
from apps.cells.views import CellCommitView, CellHistoryView, CellUnlockView
from apps.common.enums import SessionStatus
from apps.rendering import tasks as render_tasks
from apps.sessions.models import GameSession, SessionPlayer
from apps.sessions.services import start_session
from apps.sessions.views import SessionStateView

STROKE_OPERATION = {
    "type": "stroke",
    "ts": 1_730_000_000_000,
    "color": "#000000",
    "size": 0.05,
    "points": [[0.1, 0.1], [0.9, 0.9]],
}


@pytest.fixture
def running_session(db, django_user_model):
    """Create a started one-player session for commit scenarios.

    Args:
        db: Pytest-django database fixture.
        django_user_model: The configured user model.

    Returns:
        A tuple of the session and its single player.
    """
    owner = django_user_model.objects.create_user("owner", "pw12345678")
    player = django_user_model.objects.create_user("alice", "pw12345678")
    session = GameSession.objects.create(
        name="Commit session",
        owner_id=owner.id,
        canvas_width=400,
        canvas_height=400,
        grid_cols=2,
        grid_rows=2,
        players_count=1,
        interval_seconds=60,
        unlock_quota=1,
        context_shape="rectangle",
        context_radius_mode="min",
        context_radius_pct=0,
        distribution_strategy="random",
        is_public=False,
    )
    SessionPlayer.objects.create(session=session, user=player)
    start_session(session)
    return session, player


def _unlock_first_cell(session, player):
    """Unlock the first cell owned by the player.

    Args:
        session: The running session.
        player: The cell owner.

    Returns:
        The unlocked cell.
    """
    cell = session.cells.filter(owner=player).first()
    unlock_cell(cell.id, player)
    return cell


def test_commit_returns_200_when_rendering_fails(running_session, monkeypatch):
    """A broken rasterizer must not turn a successful commit into a 500."""
    session, player = running_session
    cell = _unlock_first_cell(session, player)

    def _boom(*args, **kwargs):
        raise RuntimeError("rasterizer exploded")

    monkeypatch.setattr(render_tasks.render_cell_task, "delay", _boom)

    factory = APIRequestFactory()
    request = factory.post(
        f"/cells/{cell.id}/commit",
        {"operations": [STROKE_OPERATION], "revision": 0, "comment": ""},
        format="json",
    )
    force_authenticate(request, user=player)
    response = CellCommitView.as_view()(request, cell_id=cell.id)

    assert response.status_code == 200
    cell.refresh_from_db()
    assert cell.status == "filled"


def test_state_payload_includes_cell_revision(running_session):
    """The state endpoint exposes revisions so a reopened editor can resume."""
    session, player = running_session
    cell = _unlock_first_cell(session, player)
    cell.revision = 7
    cell.save(update_fields=["revision"])

    factory = APIRequestFactory()
    request = factory.get(f"/sessions/{session.id}/state")
    force_authenticate(request, user=player)
    response = SessionStateView.as_view()(request, session_id=session.id)

    assert response.status_code == 200
    payload = cell_payload(response.data["cells"], cell)
    assert payload is not None
    assert payload["revision"] == 7


def test_unlock_endpoint_reports_revision(running_session):
    """The unlock response carries the revision used by the editor."""
    session, player = running_session
    cell = session.cells.filter(owner=player).first()

    factory = APIRequestFactory()
    request = factory.post(f"/cells/{cell.id}/unlock")
    force_authenticate(request, user=player)
    response = CellUnlockView.as_view()(request, cell_id=cell.id)

    assert response.status_code == 200
    assert response.data["cell"]["revision"] == 0


def test_history_returns_committed_operations(running_session):
    """A player can read the committed history used for rendering."""
    session, player = running_session
    cell = _unlock_first_cell(session, player)

    factory = APIRequestFactory()
    request = factory.post(
        f"/cells/{cell.id}/commit",
        {"operations": [STROKE_OPERATION], "revision": 0, "comment": ""},
        format="json",
    )
    force_authenticate(request, user=player)
    CellCommitView.as_view()(request, cell_id=cell.id)

    request = factory.get(f"/cells/{cell.id}/history")
    force_authenticate(request, user=player)
    response = CellHistoryView.as_view()(request, cell_id=cell.id)

    assert response.status_code == 200
    operations = response.data["operations"]
    assert len(operations) == 1
    assert operations[0]["type"] == "stroke"
    assert operations[0]["points"] == [[0.1, 0.1], [0.9, 0.9]]
    assert response.data["is_final"] is True


def test_history_is_private_for_anonymous_viewers(running_session):
    """Anonymous callers cannot read cells of a private session."""
    session, _ = running_session
    cell = _unlock_first_cell(session, session.players.first().user)

    factory = APIRequestFactory()
    request = factory.get(f"/cells/{cell.id}/history")
    request.user = AnonymousUser()
    response = CellHistoryView.as_view()(request, cell_id=cell.id)

    assert response.status_code == 403


def test_history_is_public_for_finished_public_session(running_session):
    """Spectators may read cells of a public finished session."""
    session, _ = running_session
    cell = _unlock_first_cell(session, session.players.first().user)
    session.is_public = True
    session.status = SessionStatus.FINISHED
    session.save(update_fields=["is_public", "status"])

    factory = APIRequestFactory()
    request = factory.get(f"/cells/{cell.id}/history")
    request.user = AnonymousUser()
    response = CellHistoryView.as_view()(request, cell_id=cell.id)

    assert response.status_code == 200


def cell_payload(cells_payload: list[dict], cell) -> dict | None:
    """Return the serialized cell matching ``cell``.

    Args:
        cells_payload: The ``cells`` list of the state response.
        cell: The cell whose payload is searched.

    Returns:
        The matching payload or ``None``.
    """
    for payload in cells_payload:
        if payload["id"] == str(cell.id):
            return payload
    return None
