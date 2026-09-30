"""Authentication views: register, login, refresh and current user."""

from __future__ import annotations

from django.contrib.auth import get_user_model
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
