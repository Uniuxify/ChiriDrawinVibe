"""Tests for session management and account administration."""

from __future__ import annotations

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.views import UserDetailView, UserListView
from apps.sessions.models import GameSession
from apps.sessions.views import SessionCreateView, SessionDetailView

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
