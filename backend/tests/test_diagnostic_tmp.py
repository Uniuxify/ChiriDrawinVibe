"""Temporary diagnostic test: does the caller's own filled cell appear?"""

from __future__ import annotations

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.cells.services import commit_cell, unlock_cell
from apps.cells.views import CellContextView, CellHistoryView
from apps.sessions.models import GameSession, SessionPlayer
from apps.sessions.services import start_session

STROKE = {
    "type": "stroke",
    "ts": 1_730_000_000_000,
    "color": "#000000",
    "size": 0.05,
    "points": [[0.1, 0.1], [0.9, 0.9]],
}


@pytest.fixture
def session_2x2(db, django_user_model):
    owner = django_user_model.objects.create_user("owner", "pw12345678")
    player = django_user_model.objects.create_user("alice", "pw12345678")
    session = GameSession.objects.create(
        name="Diag",
        owner_id=owner.id,
        canvas_width=400,
        canvas_height=400,
        grid_cols=2,
        grid_rows=2,
        players_count=1,
        interval_seconds=60,
        unlock_quota=5,
        context_shape="rectangle",
        context_radius_mode="max",
        context_radius_pct=100,
        distribution_strategy="random",
        is_public=False,
    )
    SessionPlayer.objects.create(session=session, user=player)
    start_session(session)
    return session, player


def test_diagnostic(session_2x2):
    session, player = session_2x2
    cells = list(session.cells.filter(owner=player).order_by("row", "col"))
    print("\nOWNED CELLS:", [(str(c.id), c.row, c.col, c.status) for c in cells])

    first = cells[0]
    cell_a, _ = unlock_cell(first.id, player)
    commit_cell(cell_a.id, player, [STROKE], 0, "mine")
    cell_a.refresh_from_db()
    print("AFTER COMMIT A:", cell_a.status, cell_a.owner_id, player.id)

    second = next(c for c in cells if c.id != first.id)
    cell_b, _ = unlock_cell(second.id, player)

    factory = APIRequestFactory()
    request = factory.get(f"/cells/{cell_b.id}/context")
    force_authenticate(request, user=player)
    response = CellContextView.as_view()(request, cell_id=cell_b.id)
    print("CONTEXT STATUS:", response.status_code)
    print("CONTEXT PAYLOAD:", response.data)

    request = factory.get(f"/cells/{cell_a.id}/history")
    force_authenticate(request, user=player)
    history = CellHistoryView.as_view()(request, cell_id=cell_a.id)
    print("HISTORY STATUS:", history.status_code)
    print("HISTORY PAYLOAD:", history.data)