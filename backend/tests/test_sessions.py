"""Integration tests for session start and cell distribution."""

from __future__ import annotations

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.common.enums import CellStatus, SessionStatus
from apps.common.errors import ConflictError, ValidationError
from apps.sessions.models import GameSession, SessionPlayer
from apps.sessions.services import start_session
from apps.sessions.views import JoinSessionView


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
def test_start_allows_early_start_with_fewer_players(make_session, django_user_model):
    """A draft may start before it is full (fewer than the maximum)."""
    owner = django_user_model.objects.create_user("owner", "pw12345678")
    player = django_user_model.objects.create_user("alice", "pw12345678")

    session = make_session(
        owner_id=owner.id, players_count=3, grid_rows=2, grid_cols=2
    )
    SessionPlayer.objects.create(session=session, user=player)

    start_session(session)

    session.refresh_from_db()
    assert session.status == SessionStatus.ACTIVE
    assert session.cells.count() == 4


@pytest.mark.django_db
def test_start_rejects_too_many_players(make_session, django_user_model):
    """More players than the maximum is reported as an overflow."""
    owner = django_user_model.objects.create_user("owner", "pw12345678")
    users = [
        django_user_model.objects.create_user(name, "pw12345678")
        for name in ("alice", "bob", "carol")
    ]

    session = make_session(owner_id=owner.id, players_count=2)
    for user in users:
        SessionPlayer.objects.create(session=session, user=user)

    with pytest.raises(ValidationError) as excinfo:
        start_session(session)

    assert "more players than allowed" in str(excinfo.value)
    assert excinfo.value.details == {"joined": 3, "max_players": 2}


@pytest.mark.django_db
def test_start_rejects_non_draft_session(make_session, django_user_model):
    """Only drafts may be started."""
    owner = django_user_model.objects.create_user("owner", "pw12345678")
    session = make_session(owner_id=owner.id, status=SessionStatus.ACTIVE)

    with pytest.raises(ConflictError):
        start_session(session)


@pytest.mark.django_db
def test_join_rejected_when_session_is_full(make_session, django_user_model):
    """A player cannot join a session that already reached its maximum."""
    owner = django_user_model.objects.create_user("owner", "pw12345678")
    session = make_session(owner_id=owner.id, players_count=1, join_code="FULL1")
    SessionPlayer.objects.create(
        session=session,
        user=django_user_model.objects.create_user("alice", "pw12345678"),
    )
    newcomer = django_user_model.objects.create_user("carol", "pw12345678")

    factory = APIRequestFactory()
    request = factory.post("/sessions/join", {"join_code": session.join_code})
    force_authenticate(request, user=newcomer)
    response = JoinSessionView.as_view()(request)

    assert response.status_code == 409
    assert "full" in response.data["message"].lower()
    assert response.data["details"]["joined"] == 1
    assert session.players.count() == 1
