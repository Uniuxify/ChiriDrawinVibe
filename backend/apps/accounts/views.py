"""Authentication views: register, login, refresh and current user."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db.models import Count
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.serializers import (
    LoginSerializer,
    RegisterSerializer,
    UserSerializer,
)
from apps.common.errors import NotFoundError, PermissionDeniedError
from apps.common.permissions import IsAdmin

User = get_user_model()


def _token_pair(user) -> dict[str, str]:
    """Build an access/refresh token pair for a user.

    Args:
        user: The authenticated user instance.

    Returns:
        Mapping with ``access`` and ``refresh`` tokens.
    """
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


class RegisterView(APIView):
    """Create a new regular user and return tokens."""

    permission_classes = (AllowAny,)

    def post(self, request: Request) -> Response:
        """Register a new user.

        Args:
            request: Request carrying ``username`` and ``password``.

        Returns:
            The created user and its token pair.
        """
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {"user": UserSerializer(user).data, "tokens": _token_pair(user)},
            status=201,
        )


class LoginView(APIView):
    """Authenticate a user by username and password."""

    permission_classes = (AllowAny,)

    def post(self, request: Request) -> Response:
        """Log in with credentials.

        Args:
            request: Request carrying ``username`` and ``password``.

        Returns:
            The authenticated user and its token pair.
        """
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        return Response(
            {"user": UserSerializer(user).data, "tokens": _token_pair(user)}
        )


class MeView(APIView):
    """Return the currently authenticated user."""

    def get(self, request: Request) -> Response:
        """Return the caller's profile.

        Args:
            request: The current request.

        Returns:
            Serialized current user.
        """
        return Response(UserSerializer(request.user).data)


class UserListView(APIView):
    """List every user together with session statistics (admin only)."""

    permission_classes = (IsAdmin,)

    def get(self, request: Request) -> Response:
        """Return users with their session counts.

        Args:
            request: The current request.

        Returns:
            A list of users with registration dates and the number of
            sessions they own and participate in.
        """
        users = User.objects.annotate(
            owned_sessions_count=Count("owned_sessions", distinct=True),
            player_sessions_count=Count("session_participations", distinct=True),
        ).order_by("username")

        return Response(
            [
                {
                    "id": user.id,
                    "username": user.username,
                    "is_admin": user.is_admin,
                    "created_at": user.created_at.isoformat(),
                    "owned_sessions_count": user.owned_sessions_count,
                    "player_sessions_count": user.player_sessions_count,
                }
                for user in users
            ]
        )


class UserDetailView(APIView):
    """Delete a user account (admin only)."""

    permission_classes = (IsAdmin,)

    def delete(self, request: Request, user_id: int) -> Response:
        """Delete the target user.

        Args:
            request: The current request.
            user_id: Identifier of the user to delete.

        Returns:
            An empty 204 response.

        Raises:
            NotFoundError: If no such user exists.
            PermissionDeniedError: If the target is an administrator or the
                caller tries to delete their own account.
        """
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist as exc:
            raise NotFoundError("User not found.") from exc

        if user.is_admin:
            raise PermissionDeniedError("Administrators cannot be deleted.")
        if user.id == request.user.id:
            raise PermissionDeniedError("You cannot delete your own account.")

        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
