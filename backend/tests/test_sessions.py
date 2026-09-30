"""Integration tests for session start and cell distribution."""

from __future__ import annotations

import pytest

from apps.common.enums import CellStatus, SessionStatus
from apps.common.errors import ConflictError, ValidationError
from apps.sessions.models import GameSession, SessionPlayer
from apps.sessions.services import start_session


@pytest.fixture
def make_session(db):
    """Factory that creates a draft session with the given parameters.

    Args:
        db: Pytest-django database fixture.

    Returns:
        A callable producing a :class:`GameSession`.
    """

    def _factory(**overrides) -> GameSession:
        defaults = {
            "name": "Test session",
            "owner_id": 1,
            "canvas_width": 400,
            "canvas_height": 400,
            "grid_cols": 4,
            "grid_rows": 4,
            "players_count": 2,
            "interval_seconds": 60,
            "unlock_quota": 1,
            "context_shape": "rectangle",
            "context_radius_mode": "min",
            "context_radius_pct": 0,
            "distribution_strategy": "random",
            "is_public": False,
        }
        defaults.update(overrides)
        return GameSession.objects.create(**defaults)

    return _factory


@pytest.mark.django_db
def test_start_distributes_every_cell(make_session, django_user_model):
    """Starting a 4x4 session with 2 players creates 16 owned cells."""
    owner = django_user_model.objects.create_user("owner", "pw12345678")
    player_a = django_user_model.objects.create_user("alice", "pw12345678")
    player_b = django_user_model.objects.create_user("bob", "pw12345678")

    session = make_session(owner_id=owner.id, grid_rows=4, grid_cols=4)
    for user in (player_a, player_b):
        SessionPlayer.objects.create(session=session, user=user)

    start_session(session)

    session.refresh_from_db()
    assert session.status == SessionStatus.ACTIVE
    assert session.cells.count() == 16

    owners = set(session.cells.values_list("owner_id", flat=True))
    assert owners == {player_a.id, player_b.id}
    assert session.cells.filter(status=CellStatus.EMPTY).count() == 16
    assert session.iterations.count() == 1


@pytest.mark.django_db
def test_start_requires_matching_player_count(make_session, django_user_model):
    """A draft with fewer players than configured cannot start."""
    owner = django_user_model.objects.create_user("owner", "pw12345678")
    player = django_user_model.objects.create_user("alice", "pw12345678")

    session = make_session(owner_id=owner.id, players_count=3)
    SessionPlayer.objects.create(session=session, user=player)

    with pytest.raises(ValidationError) as excinfo:
        start_session(session)

    assert "1 of 3 required" in str(excinfo.value)
    assert excinfo.value.details == {"joined": 1, "required": 3}


@pytest.mark.django_db
def test_start_rejects_non_draft_session(make_session, django_user_model):
    """Only drafts may be started."""
    owner = django_user_model.objects.create_user("owner", "pw12345678")
    session = make_session(owner_id=owner.id, status=SessionStatus.ACTIVE)

    with pytest.raises(ConflictError):
        start_session(session)
