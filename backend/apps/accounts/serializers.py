"""Serializers for registration, login and user representation."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.common.errors import ValidationError as DomainValidationError

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Read-only representation of a user."""

    class Meta:
        model = User
        fields = ("id", "username", "is_admin", "created_at")
        read_only_fields = fields


class RegisterSerializer(serializers.Serializer):
    """Validate and create a new regular user."""

    username = serializers.CharField(max_length=150)
    password = serializers.CharField(
        write_only=True, min_length=8, trim_whitespace=False
    )

    def validate_username(self, value: str) -> str:
        """Ensure the username is unique.

        Args:
            value: Requested username.

        Returns:
            The validated username.

        Raises:
            serializers.ValidationError: If the username already exists.
        """
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This username is already taken.")
        return value

    def validate_password(self, value: str) -> str:
        """Run Django password validators against the raw password.

        Args:
            value: Raw password.

        Returns:
            The validated password.

        Raises:
            serializers.ValidationError: If the password is too weak.
        """
        try:
            validate_password(value)
        except Exception as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def create(self, validated_data: dict) -> User:
        """Create a non-admin user.

        Args:
            validated_data: Validated input data.

        Returns:
            The created user instance.
        """
        return User.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
            is_admin=False,
        )


class LoginSerializer(serializers.Serializer):
    """Validate login credentials."""

    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs: dict) -> dict:
        """Check the credentials against stored users.

        Args:
            attrs: Validated input data.

        Returns:
            The validated data including the resolved user.

        Raises:
            DomainValidationError: If credentials are invalid or inactive.
        """
        user = User.objects.filter(username__iexact=attrs["username"]).first()
        if user is None or not user.check_password(attrs["password"]):
            raise DomainValidationError(
                "Invalid username or password.", code="invalid_credentials"
            )
        if not user.is_active:
            raise DomainValidationError(
                "This account is disabled.", code="account_disabled"
            )
        attrs["user"] = user
        return attrs
