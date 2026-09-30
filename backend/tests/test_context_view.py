"""Tests for the read-only context payload of an unlocked cell."""

from __future__ import annotations

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.cells.services import unlock_cell
from apps.cells.views import CellContextView
from apps.sessions.models import GameSession, SessionPlayer
from apps.sessions.services import start_session


@pytest.fixture
def running_session(db, django_user_model):
    """Create a started one-player session with a 2x2 grid.

    Args:
        db: Pytest-django database fixture.
        django_user_model: The configured user model.

    Returns:
        A tuple of the session and its single player.
    """
    owner = django_user_model.objects.create_user("owner", "pw12345678")
    player = django_user_model.objects.create_user("alice", "pw12345678")
    session = GameSession.objects.create(
        name="Context session",
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


def test_context_returns_every_neighbour(running_session):
    """The context endpoint lists filled and empty neighbours of the cell."""
    session, player = running_session
    cell = session.cells.filter(owner=player).first()
    unlock_cell(cell.id, player)

    factory = APIRequestFactory()
    request = factory.get(f"/cells/{cell.id}/context")
    force_authenticate(request, user=player)
    response = CellContextView.as_view()(request, cell_id=cell.id)

    assert response.status_code == 200
    payload = response.data
    assert payload["context"] is not None
    neighbor_ids = {item["cell_id"] for item in payload["neighbors"]}
    assert neighbor_ids == set(payload["context"]["neighbor_ids"])
    assert payload["neighbors"], "the 2x2 grid must expose neighbours"
    for item in payload["neighbors"]:
        assert "status" in item
        assert "comment" in item
        assert "raster" in item
        assert (item["row"], item["col"]) != (cell.row, cell.col)


def test_context_is_empty_without_snapshot(running_session):
    """A cell without a context snapshot returns an empty payload."""
    session, player = running_session
    cell = session.cells.filter(owner=player).first()

    factory = APIRequestFactory()
    request = factory.get(f"/cells/{cell.id}/context")
    force_authenticate(request, user=player)
    response = CellContextView.as_view()(request, cell_id=cell.id)

    assert response.status_code == 200
    assert response.data == {"context": None, "neighbors": []}
