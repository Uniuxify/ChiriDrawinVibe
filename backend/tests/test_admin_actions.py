"""Administrator cell overrides: skip and force fill."""

from __future__ import annotations

import pytest

from apps.cells.services import admin_force_fill_cell, admin_skip_cell, unlock_cell
from apps.common.errors import ConflictError
from apps.sessions.models import GameSession, SessionPlayer
from apps.sessions.services import start_session


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
        name="Admin session",
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
    return {"session": session, "owner": owner, "alice": alice, "bob": bob}


def test_skip_reassigns_unlocked_cell(active_session):
    """A player's unlocked cell moves to the other player and resets."""
    session = active_session["session"]
    alice = active_session["alice"]
    bob = active_session["bob"]

    cell = session.cells.filter(owner=alice).first()
    unlock_cell(cell.id, alice)
    cell.refresh_from_db()
    assert cell.status == "unlocked"

    reassigned = admin_skip_cell(cell.id)
    assert reassigned.owner_id == bob.id
    assert reassigned.status == "empty"
    assert reassigned.locked_by_id is None


def test_skip_of_filled_cell_is_rejected(active_session):
    """Filled cells cannot be handed over."""
    session = active_session["session"]
    alice = active_session["alice"]

    cell = session.cells.filter(owner=alice).first()
    unlock_cell(cell.id, alice)
    admin_force_fill_cell(cell.id)

    with pytest.raises(ConflictError):
        admin_skip_cell(cell.id)


def test_skip_without_other_players_is_rejected(active_session):
    """A cell cannot be skipped when there is nobody to take it."""
    session = active_session["session"]
    alice = active_session["alice"]

    # Remove bob, leaving alice as the only active player.
    session.players.filter(user=active_session["bob"]).update(is_active=False)

    cell = session.cells.filter(owner=alice).first()
    unlock_cell(cell.id, alice)

    with pytest.raises(ConflictError):
        admin_skip_cell(cell.id)


def test_force_fill_marks_cell_filled_and_counts_quota(active_session):
    """Force fill makes the cell filled and consumes the owner's quota."""
    session = active_session["session"]
    alice = active_session["alice"]

    cell = session.cells.filter(owner=alice).first()
    filled = admin_force_fill_cell(cell.id)

    assert filled.status == "filled"
    assert filled.filled_at is not None
    assert filled.locked_by_id is None
    # The blank commit is stored as an explicit empty final revision.
    assert filled.histories.filter(is_final=True).exists()

    iteration = session.iterations.order_by("-index").first()
    progress = iteration.progress.filter(user=alice).first()
    assert progress is not None
    assert progress.filled_count == 1


def test_force_fill_of_filled_cell_is_rejected(active_session):
    """An already filled cell cannot be filled again."""
    session = active_session["session"]
    alice = active_session["alice"]

    cell = session.cells.filter(owner=alice).first()
    admin_force_fill_cell(cell.id)

    with pytest.raises(ConflictError):
        admin_force_fill_cell(cell.id)
