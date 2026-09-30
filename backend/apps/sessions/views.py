"""Views for session CRUD, players, lifecycle and state polling."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.enums import CellStatus, SessionStatus
from apps.common.errors import ConflictError, NotFoundError, PermissionDeniedError
from apps.common.permissions import IsAdmin
from apps.sessions.models import GameSession, SessionPlayer
from apps.sessions.serializers import (
    AddPlayerSerializer,
    SessionCreateSerializer,
    SessionSerializer,
    SessionUpdateSerializer,
)
from apps.sessions.services import finish_session, start_session

User = get_user_model()

LOCKED_WHEN_ACTIVE = {
    "canvas_width",
    "canvas_height",
    "grid_cols",
    "grid_rows",
    "players_count",
    "distribution_strategy",
    "context_shape",
    "context_radius_mode",
}


def _get_session(session_id: int, user) -> GameSession:
    """Fetch a session visible to the given user.

    Args:
        session_id: Session primary key.
        user: Requesting user.

    Returns:
        The session instance.

    Raises:
        NotFoundError: If the session is not visible to the user.
    """
    try:
        session = GameSession.objects.prefetch_related("players__user").get(
            pk=session_id
        )
    except GameSession.DoesNotExist as exc:
        raise NotFoundError("Session not found.") from exc

    is_owner = session.owner_id == user.id
    is_player = session.players.filter(user=user).exists()
    is_public_finished = session.is_public and session.status == SessionStatus.FINISHED
    if not (is_owner or is_player or is_public_finished):
        raise NotFoundError("Session not found.")
    return session


def _require_owner(session: GameSession, user) -> None:
    """Ensure the user owns the session.

    Args:
        session: The session being modified.
        user: Requesting user.

    Raises:
        PermissionDeniedError: If the user is not the owner.
    """
    if session.owner_id != user.id:
        raise PermissionDeniedError("Only the session owner may perform this action.")


class MySessionsView(APIView):
    """List sessions relevant to the caller in two buckets."""

    def get(self, request: Request) -> Response:
        """Return grouped session lists for the caller.

        Args:
            request: The current request.

        Returns:
            A response with ``active`` and ``finished`` session lists.
        """
        user = request.user
        sessions = (
            GameSession.objects.filter(owner=user)
            | GameSession.objects.filter(players__user=user)
        ).distinct().prefetch_related("players__user")

        active = [s for s in sessions if s.status == SessionStatus.ACTIVE]
        finished = [s for s in sessions if s.status == SessionStatus.FINISHED]
        drafts = [s for s in sessions if s.status == SessionStatus.DRAFT]

        return Response(
            {
                "drafts": SessionSerializer(drafts, many=True).data,
                "active": SessionSerializer(active, many=True).data,
                "finished": SessionSerializer(finished, many=True).data,
            }
        )


class PublicFinishedSessionsView(APIView):
    """List public finished sessions for anonymous viewers."""

    permission_classes = ()

    def get(self, request: Request) -> Response:
        """Return public finished sessions.

        Args:
            request: The current request.

        Returns:
            A response with serialized public sessions.
        """
        sessions = GameSession.objects.filter(
            is_public=True, status=SessionStatus.FINISHED
        )
        return Response(SessionSerializer(sessions, many=True).data)


class SessionCreateView(APIView):
    """Create a new session draft (admin only)."""

    def post(self, request: Request) -> Response:
        """Create a session owned by the caller.

        Args:
            request: The current request.

        Returns:
            The serialized created session.
        """
        if not request.user.is_admin:
            raise PermissionDeniedError("Only administrators may create sessions.")

        serializer = SessionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session = serializer.save(owner=request.user)
        return Response(SessionSerializer(session).data, status=status.HTTP_201_CREATED)


class SessionDetailView(APIView):
    """Retrieve and update a single session."""

    def get(self, request: Request, session_id: int) -> Response:
        """Return a session visible to the caller.

        Args:
            request: The current request.
            session_id: Session primary key.

        Returns:
            The serialized session.
        """
        session = _get_session(session_id, request.user)
        return Response(SessionSerializer(session).data)

    def patch(self, request: Request, session_id: int) -> Response:
        """Update a session, enforcing lifecycle field restrictions.

        Args:
            request: The current request.
            session_id: Session primary key.

        Returns:
            The serialized updated session.
        """
        session = _get_session(session_id, request.user)
        _require_owner(session, request.user)

        if session.status == SessionStatus.FINISHED:
            raise ConflictError("Finished sessions cannot be modified.")

        if session.status == SessionStatus.ACTIVE:
            forbidden = LOCKED_WHEN_ACTIVE.intersection(request.data.keys())
            if forbidden:
                raise ConflictError(
                    "These fields are locked once a session is active.",
                    details={"fields": sorted(forbidden)},
                )

        serializer = SessionUpdateSerializer(session, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        session.refresh_from_db()
        session.touch()
        session.save(update_fields=["version"])
        return Response(SessionSerializer(session).data)


class SessionPlayerView(APIView):
    """Add or remove players of a session."""

    def post(self, request: Request, session_id: int) -> Response:
        """Add a registered user to the session by username.

        Args:
            request: The current request.
            session_id: Session primary key.

        Returns:
            The serialized session after the change.
        """
        session = _get_session(session_id, request.user)
        _require_owner(session, request.user)
        if session.status == SessionStatus.FINISHED:
            raise ConflictError("Finished sessions cannot be modified.")

        serializer = AddPlayerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data["username"]
        user = User.objects.get(username__iexact=username)

        if session.players.filter(user=user).exists():
            raise ConflictError("The user is already a participant.")

        SessionPlayer.objects.create(session=session, user=user)
        session.touch()
        session.save(update_fields=["version"])
        return Response(SessionSerializer(session).data)

    def delete(self, request: Request, session_id: int, user_id: int) -> Response:
        """Remove a player from the session.

        Args:
            request: The current request.
            session_id: Session primary key.
            user_id: Identifier of the player to remove.

        Returns:
            The serialized session after the change.
        """
        session = _get_session(session_id, request.user)
        _require_owner(session, request.user)
        if session.status == SessionStatus.FINISHED:
            raise ConflictError("Finished sessions cannot be modified.")

        player = session.players.filter(user_id=user_id).first()
        if player is None:
            raise NotFoundError("Player not found in this session.")

        if session.status == SessionStatus.ACTIVE:
            player.is_active = False
            player.save(update_fields=["is_active"])
            session.cells.filter(owner_id=user_id, status=CellStatus.EMPTY).update(
                is_orphan=True, status=CellStatus.ORPHAN
            )
        else:
            player.delete()

        session.touch()
        session.save(update_fields=["version"])
        return Response(SessionSerializer(session).data)


class JoinSessionView(APIView):
    """Let a user join a draft session using its join code."""

    def post(self, request: Request) -> Response:
        """Join a session by code.

        Args:
            request: Request carrying ``join_code``.

        Returns:
            The serialized session after joining.
        """
        code = str(request.data.get("join_code", "")).strip().upper()
        session = GameSession.objects.filter(join_code=code).first()
        if session is None:
            raise NotFoundError("No session matches this join code.")
        if session.status != SessionStatus.DRAFT:
            raise ConflictError("You can only join sessions in draft status.")
        if session.players.filter(user=request.user).exists():
            raise ConflictError("You have already joined this session.")

        SessionPlayer.objects.create(session=session, user=request.user)
        session.touch()
        session.save(update_fields=["version"])
        session.refresh_from_db()
        return Response(SessionSerializer(session).data)


class StartSessionView(APIView):
    """Start a draft session (owner only)."""

    permission_classes = (IsAdmin,)

    def post(self, request: Request, session_id: int) -> Response:
        """Start the session and distribute cells.

        Args:
            request: The current request.
            session_id: Session primary key.

        Returns:
            The serialized started session.
        """
        session = _get_session(session_id, request.user)
        _require_owner(session, request.user)
        session = start_session(session)
        return Response(SessionSerializer(session).data)


class FinishSessionView(APIView):
    """Finish an active session early (owner only)."""

    permission_classes = (IsAdmin,)

    def post(self, request: Request, session_id: int) -> Response:
        """Finish the session.

        Args:
            request: The current request.
            session_id: Session primary key.

        Returns:
            The serialized finished session.
        """
        session = _get_session(session_id, request.user)
        _require_owner(session, request.user)
        session = finish_session(session)
        return Response(SessionSerializer(session).data)


class SessionStateView(APIView):
    """Expose a polling-friendly snapshot of the session state."""

    def get(self, request: Request, session_id: int) -> Response:
        """Return the session state and a redacted cell summary.

        Args:
            request: The current request.
            session_id: Session primary key.

        Returns:
            A response with version, status and per-cell visibility.
        """
        session = _get_session(session_id, request.user)
        cells = session.cells.all()
        total = cells.count()
        filled = cells.filter(status=CellStatus.FILLED).count()

        cells_payload = [
            {
                "id": str(cell.id),
                "row": cell.row,
                "col": cell.col,
                "status": cell.status,
                "owner_id": cell.owner_id,
                "is_mine": cell.owner_id == request.user.id,
                "has_comment": bool(cell.comment),
            }
            for cell in cells
        ]

        return Response(
            {
                "version": session.version,
                "status": session.status,
                "progress": {
                    "filled": filled,
                    "total": total,
                    "percent": round(filled / total * 100, 2) if total else 0.0,
                },
                "cells": cells_payload,
            }
        )
