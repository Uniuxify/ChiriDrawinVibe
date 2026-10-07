"""Tests for session management and account administration."""

from __future__ import annotations

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.views import UserDetailView, UserListView
from apps.common.enums import SessionStatus
from apps.sessions.models import GameSession, SessionPlayer, SessionResultView
from apps.sessions.views import (
    MarkResultViewedView,
    SessionCreateView,
    SessionDetailView,
    SessionStateView,
    SetPictureRevealedView,
)

CREATE_PAYLOAD = {
    "name": "New session",
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


def _make_session(owner) -> GameSession:
    """Create a draft session owned by the given user.

    Args:
        owner: The session owner.

    Returns:
        The created draft session.
    """
    return GameSession.objects.create(
        name="Session",
        owner=owner,
        canvas_width=400,
        canvas_height=400,
        grid_cols=4,
        grid_rows=4,
        players_count=2,
        interval_seconds=60,
        unlock_quota=1,
        context_shape="rectangle",
        context_radius_mode="min",
        context_radius_pct=0,
        distribution_strategy="random",
        is_public=False,
    )


@pytest.mark.django_db
def test_non_admin_can_create_session(django_user_model):
    """A regular user may create sessions."""
    user = django_user_model.objects.create_user("alice", "pw12345678")

    factory = APIRequestFactory()
    request = factory.post("/sessions", CREATE_PAYLOAD, format="json")
    force_authenticate(request, user=user)
    response = SessionCreateView.as_view()(request)

    assert response.status_code == 201
    session = GameSession.objects.get(pk=response.data["id"])
    assert session.owner_id == user.id


@pytest.mark.django_db
def test_owner_can_delete_session(django_user_model):
    """The owner deletes their own session; it disappears completely."""
    owner = django_user_model.objects.create_user("owner", "pw12345678")
    session = _make_session(owner)

    factory = APIRequestFactory()
    request = factory.delete(f"/sessions/{session.id}")
    force_authenticate(request, user=owner)
    response = SessionDetailView.as_view()(request, session_id=session.id)

    assert response.status_code == 204
    assert not GameSession.objects.filter(pk=session.id).exists()


@pytest.mark.django_db
def test_non_owner_cannot_delete_session(django_user_model):
    """Only the owner may delete a session."""
    owner = django_user_model.objects.create_user("owner", "pw12345678")
    intruder = django_user_model.objects.create_user("mallory", "pw12345678")
    session = _make_session(owner)

    factory = APIRequestFactory()
    request = factory.delete(f"/sessions/{session.id}")
    force_authenticate(request, user=intruder)
    response = SessionDetailView.as_view()(request, session_id=session.id)

    # The session is not visible to the intruder at all, so it reads as 404
    # and must definitely survive.
    assert response.status_code == 404
    assert GameSession.objects.filter(pk=session.id).exists()


@pytest.mark.django_db
def test_user_list_requires_admin(django_user_model):
    """Regular users cannot read the accounts list."""
    user = django_user_model.objects.create_user("alice", "pw12345678")

    factory = APIRequestFactory()
    request = factory.get("/users")
    force_authenticate(request, user=user)
    response = UserListView.as_view()(request)

    assert response.status_code == 403


@pytest.mark.django_db
def test_user_list_returns_session_counts(django_user_model):
    """The accounts list carries registration dates and session counts."""
    admin = django_user_model.objects.create_superuser("root", "pw12345678")
    owner = django_user_model.objects.create_user("alice", "pw12345678")
    _make_session(owner)

    factory = APIRequestFactory()
    request = factory.get("/users")
    force_authenticate(request, user=admin)
    response = UserListView.as_view()(request)

    assert response.status_code == 200
    rows = {row["username"]: row for row in response.data}
    assert rows["alice"]["owned_sessions_count"] == 1
    assert rows["alice"]["player_sessions_count"] == 0
    assert rows["alice"]["created_at"]


@pytest.mark.django_db
def test_admin_can_delete_regular_user(django_user_model):
    """Administrators may delete non-admin accounts."""
    admin = django_user_model.objects.create_superuser("root", "pw12345678")
    victim = django_user_model.objects.create_user("alice", "pw12345678")

    factory = APIRequestFactory()
    request = factory.delete(f"/users/{victim.id}")
    force_authenticate(request, user=admin)
    response = UserDetailView.as_view()(request, user_id=victim.id)

    assert response.status_code == 204
    assert not django_user_model.objects.filter(pk=victim.id).exists()


@pytest.mark.django_db
def test_admin_cannot_delete_another_admin(django_user_model):
    """Administrator accounts are protected."""
    admin = django_user_model.objects.create_superuser("root", "pw12345678")
    other_admin = django_user_model.objects.create_superuser("root2", "pw12345678")

    factory = APIRequestFactory()
    request = factory.delete(f"/users/{other_admin.id}")
    force_authenticate(request, user=admin)
    response = UserDetailView.as_view()(request, user_id=other_admin.id)

    assert response.status_code == 403
    assert django_user_model.objects.filter(pk=other_admin.id).exists()


@pytest.mark.django_db
def test_admin_cannot_delete_self(django_user_model):
    """Nobody may delete their own account through this endpoint."""
    admin = django_user_model.objects.create_superuser("root", "pw12345678")

    factory = APIRequestFactory()
    request = factory.delete(f"/users/{admin.id}")
    force_authenticate(request, user=admin)
    response = UserDetailView.as_view()(request, user_id=admin.id)

    assert response.status_code == 403
    assert django_user_model.objects.filter(pk=admin.id).exists()


@pytest.mark.django_db
def test_result_viewed_flow(django_user_model):
    """Marking the result as viewed persists and shows up in the state."""
    owner = django_user_model.objects.create_user("owner", "pw12345678")
    player = django_user_model.objects.create_user("alice", "pw12345678")
    session = _make_session(owner)
    session.status = SessionStatus.FINISHED
    session.save(update_fields=["status"])
    SessionPlayer.objects.create(session=session, user=player)

    factory = APIRequestFactory()

    # Before marking, the state reports the result as unseen.
    state_request = factory.get(f"/sessions/{session.id}/state")
    force_authenticate(state_request, user=player)
    state = SessionStateView.as_view()(state_request, session_id=session.id)
    assert state.status_code == 200
    assert state.data["result_viewed"] is False

    # Marking is idempotent.
    for _ in range(2):
        mark_request = factory.post(f"/sessions/{session.id}/viewed")
        force_authenticate(mark_request, user=player)
        response = MarkResultViewedView.as_view()(mark_request, session_id=session.id)
        assert response.status_code == 200
        assert response.data["result_viewed"] is True

    assert SessionResultView.objects.filter(session=session, user=player).count() == 1

    state_request = factory.get(f"/sessions/{session.id}/state")
    force_authenticate(state_request, user=player)
    state = SessionStateView.as_view()(state_request, session_id=session.id)
    assert state.data["result_viewed"] is True

    # Another participant has not seen it yet.
    other = django_user_model.objects.create_user("bob", "pw12345678")
    SessionPlayer.objects.create(session=session, user=other)
    state_request = factory.get(f"/sessions/{session.id}/state")
    force_authenticate(state_request, user=other)
    state = SessionStateView.as_view()(state_request, session_id=session.id)
    assert state.data["result_viewed"] is False


@pytest.mark.django_db
def test_mark_viewed_rejects_unfinished_session(django_user_model):
    """Only finished sessions can be marked as viewed."""
    owner = django_user_model.objects.create_user("owner", "pw12345678")
    session = _make_session(owner)

    factory = APIRequestFactory()
    request = factory.post(f"/sessions/{session.id}/viewed")
    force_authenticate(request, user=owner)
    response = MarkResultViewedView.as_view()(request, session_id=session.id)

    assert response.status_code == 409
    assert not SessionResultView.objects.filter(session=session).exists()


@pytest.mark.django_db
def test_picture_revealed_flow(django_user_model):
    """The reveal flag is stored per player and reported in the state."""
    owner = django_user_model.objects.create_user("owner", "pw12345678")
    player = django_user_model.objects.create_user("alice", "pw12345678")
    other = django_user_model.objects.create_user("bob", "pw12345678")
    session = _make_session(owner)
    session.status = SessionStatus.FINISHED
    session.save(update_fields=["status"])
    SessionPlayer.objects.create(session=session, user=player)
    SessionPlayer.objects.create(session=session, user=other)

    factory = APIRequestFactory()

    def state_for(user):
        request = factory.get(f"/sessions/{session.id}/state")
        force_authenticate(request, user=user)
        return SessionStateView.as_view()(request, session_id=session.id)

    assert state_for(player).data["picture_revealed"] is False

    # Reveal is idempotent.
    for _ in range(2):
        request = factory.post(f"/sessions/{session.id}/reveal", {"revealed": True})
        force_authenticate(request, user=player)
        response = SetPictureRevealedView.as_view()(request, session_id=session.id)
        assert response.status_code == 200
        assert response.data["picture_revealed"] is True

    assert state_for(player).data["picture_revealed"] is True
    # Another player is unaffected.
    assert state_for(other).data["picture_revealed"] is False

    # Hiding persists again.
    request = factory.post(f"/sessions/{session.id}/reveal", {"revealed": False})
    force_authenticate(request, user=player)
    response = SetPictureRevealedView.as_view()(request, session_id=session.id)
    assert response.status_code == 200
    assert state_for(player).data["picture_revealed"] is False


@pytest.mark.django_db
def test_picture_revealed_rejects_unfinished_session(django_user_model):
    """Only finished sessions can toggle the reveal flag."""
    owner = django_user_model.objects.create_user("owner", "pw12345678")
    session = _make_session(owner)

    factory = APIRequestFactory()
    request = factory.post(f"/sessions/{session.id}/reveal", {"revealed": True})
    force_authenticate(request, user=owner)
    response = SetPictureRevealedView.as_view()(request, session_id=session.id)

    assert response.status_code == 409
