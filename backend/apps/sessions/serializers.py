"""Serializers for session CRUD, players and state polling."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.sessions.models import GameSession, SessionPlayer
from apps.sessions.validation import validate_session_config

User = get_user_model()


class SessionPlayerSerializer(serializers.ModelSerializer):
    """Representation of a session participant."""

    user_id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = SessionPlayer
        fields = ("user_id", "username", "joined_at", "is_active", "is_original")
        read_only_fields = fields


class SessionSerializer(serializers.ModelSerializer):
    """Full representation of a session for owners and admins."""

    players = SessionPlayerSerializer(many=True, read_only=True)

    class Meta:
        model = GameSession
        fields = (
            "id",
            "name",
            "status",
            "owner",
            "join_code",
            "canvas_width",
            "canvas_height",
            "grid_cols",
            "grid_rows",
            "players_count",
            "interval_seconds",
            "unlock_quota",
            "context_shape",
            "context_radius_mode",
            "context_radius_pct",
            "distribution_strategy",
            "is_public",
            "version",
            "allow_image_upload",
            "created_at",
            "started_at",
            "finished_at",
            "players",
        )
        read_only_fields = (
            "id",
            "owner",
            "status",
            "join_code",
            "version",
            "created_at",
            "started_at",
            "finished_at",
            "players",
        )


class SessionCreateSerializer(serializers.ModelSerializer):
    """Validate creation of a session draft."""

    class Meta:
        model = GameSession
        fields = (
            "name",
            "canvas_width",
            "canvas_height",
            "grid_cols",
            "grid_rows",
            "players_count",
            "interval_seconds",
            "unlock_quota",
            "context_shape",
            "context_radius_mode",
            "context_radius_pct",
            "distribution_strategy",
            "is_public",
        )

    def validate(self, attrs: dict) -> dict:
        """Validate session parameters against configured limits.

        Args:
            attrs: Validated field values.

        Returns:
            The validated attributes.
        """
        validate_session_config(attrs)
        return attrs


class SessionUpdateSerializer(serializers.ModelSerializer):
    """Validate edits allowed while a session is a draft or active."""

    class Meta:
        model = GameSession
        fields = (
            "name",
            "canvas_width",
            "canvas_height",
            "grid_cols",
            "grid_rows",
            "players_count",
            "interval_seconds",
            "unlock_quota",
            "context_shape",
            "context_radius_mode",
            "context_radius_pct",
            "distribution_strategy",
            "is_public",
        )

    def validate(self, attrs: dict) -> dict:
        """Merge existing values and validate the resulting configuration.

        Args:
            attrs: Partially validated field values.

        Returns:
            The validated attributes.
        """
        merged = {
            field: attrs.get(field, getattr(self.instance, field))
            for field in (
                "canvas_width",
                "canvas_height",
                "grid_cols",
                "grid_rows",
                "players_count",
                "interval_seconds",
                "unlock_quota",
                "context_radius_pct",
            )
        }
        validate_session_config(merged)
        return attrs


class AddPlayerSerializer(serializers.Serializer):
    """Validate adding a registered user to a session by username."""

    username = serializers.CharField(max_length=150)

    def validate_username(self, value: str) -> str:
        """Ensure the target user exists.

        Args:
            value: Requested username.

        Returns:
            The validated username.

        Raises:
            serializers.ValidationError: If the user does not exist.
        """
        if not User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("No such user.")
        return value
