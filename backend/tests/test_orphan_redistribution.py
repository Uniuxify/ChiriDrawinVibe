"""Redistribution of the orphan cell pool."""

from __future__ import annotations

import pytest

from apps.common.enums import CellStatus
from apps.sessions.models import GameSession, SessionPlayer
from apps.sessions.services import redistribute_orphan_cells, start_session


@pytest.fixture
def active_session(db, django_user_model):
    """Create a started two-player session with a 2x2 grid.

    Args:
        db: Pytest-django database fixture.
        django_user_model: The configured user model.

    Returns:
        A dict with the session, its owner and the two players.
    """
    owner = django_user_model.objects.create_user("owner", "pw12345678")
    alice = django_user_model.objects.create_user("alice", "pw12345678")
    bob = django_user_model.objects.create_user("bob", "pw12345678")
    session = GameSession.objects.create(
        name="Orphan session",
        owner_id=owner.id,
        canvas_width=400,
        canvas_height=400,
        grid_cols=2,
        grid_rows=2,
        players_count=2,
        interval_seconds=60,
        unlock_quota=5,
        context_shape="rectangle",
        context_radius_mode="max",
        context_radius_pct=100,
        distribution_strategy="random",
        is_public=False,
    )
    SessionPlayer.objects.create(session=session, user=alice)
    SessionPlayer.objects.create(session=session, user=bob)
    start_session(session)
    return {"session": session, "alice": alice, "bob": bob}


def _remove_bob_and_orphan_cells(session, bob):
    """Simulate bob leaving the active session."""
    session.players.filter(user=bob).update(is_active=False)
    session.cells.filter(owner=bob).update(
        is_orphan=True, status=CellStatus.ORPHAN
    )


def test_orphans_wait_until_native_cells_are_filled(active_session):
    """Nothing is redistributed while own cells are still unfinished."""
    session = active_session["session"]
    _remove_bob_and_orphan_cells(session, active_session["bob"])

    assert redistribute_orphan_cells(session) == 0
    assert session.cells.filter(is_orphan=True).count() == 2


def test_orphans_are_dealt_out_after_native_cells(active_session):
    """Once own cells are filled, the pool goes to the remaining player."""
    session = active_session["session"]
    alice = active_session["alice"]
    _remove_bob_and_orphan_cells(session, active_session["bob"])

    session.cells.filter(owner=alice).update(status=CellStatus.FILLED)

    assert redistribute_orphan_cells(session) == 2
    orphans = session.cells.filter(is_orphan=True)
    assert orphans.count() == 0
    reassigned = session.cells.filter(owner=alice, status=CellStatus.EMPTY)
    assert reassigned.count() == 2


def test_redistribution_without_players_is_a_noop(active_session):
    """An empty player list leaves the pool untouched."""
    session = active_session["session"]
    _remove_bob_and_orphan_cells(session, active_session["bob"])
    session.players.update(is_active=False)
    session.cells.filter(owner=active_session["alice"]).update(
        status=CellStatus.FILLED
    )

    assert redistribute_orphan_cells(session) == 0
    assert session.cells.filter(is_orphan=True).count() == 2
