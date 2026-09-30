"""Models describing drawing sessions and their participants."""

from __future__ import annotations

import secrets

from django.contrib.auth import get_user_model
from django.db import models

from apps.common.enums import (
    ContextRadiusMode,
    ContextShape,
    DistributionStrategy,
    SessionStatus,
)

User = get_user_model()


def generate_join_code() -> str:
    """Return a short random join code.

    Returns:
        An 8-character uppercase alphanumeric code.
    """
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(8))


class GameSession(models.Model):
    """A collaborative drawing session.

    Attributes:
        name: Human readable session title.
        status: Current lifecycle state.
        owner: Administrator who created the session.
        join_code: Code players use to join while in draft.
        canvas_width: Total canvas width in pixels.
        canvas_height: Total canvas height in pixels.
        grid_cols: Number of grid columns.
        grid_rows: Number of grid rows.
        players_count: Intended number of players.
        interval_seconds: Unlock interval for an iteration.
        unlock_quota: Cells a player may unlock per iteration.
        context_shape: Geometry of the read-only context.
        context_radius_mode: How the radius is interpreted.
        context_radius_pct: Radius value in percent.
        distribution_strategy: How cells are assigned to players.
        is_public: Whether finished results are public.
        version: Monotonic revision for polling.
        allow_image_upload: Reserved flag for a future feature.
        created_at: Creation timestamp.
        started_at: Timestamp when the session started.
        finished_at: Timestamp when the session finished.
    """

    name = models.CharField(max_length=200)
    status = models.CharField(
        max_length=16,
        choices=SessionStatus.choices,
        default=SessionStatus.DRAFT,
        db_index=True,
    )
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="owned_sessions"
    )
    join_code = models.CharField(max_length=16, unique=True, default=generate_join_code)

    canvas_width = models.PositiveIntegerField()
    canvas_height = models.PositiveIntegerField()
    grid_cols = models.PositiveIntegerField()
    grid_rows = models.PositiveIntegerField()
    players_count = models.PositiveIntegerField()
    interval_seconds = models.PositiveIntegerField()
    unlock_quota = models.PositiveIntegerField(default=1)

    context_shape = models.CharField(
        max_length=16,
        choices=ContextShape.choices,
        default=ContextShape.RECTANGLE,
    )
    context_radius_mode = models.CharField(
        max_length=16,
        choices=ContextRadiusMode.choices,
        default=ContextRadiusMode.MIN,
    )
    context_radius_pct = models.PositiveIntegerField(default=0)

    distribution_strategy = models.CharField(
        max_length=16,
        choices=DistributionStrategy.choices,
        default=DistributionStrategy.RANDOM,
    )
    is_public = models.BooleanField(default=False)
    version = models.PositiveBigIntegerField(default=0)
    allow_image_upload = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "sessions_session"
        ordering = ("-created_at",)

    def __str__(self) -> str:
        """Return the session name for admin displays."""
        return self.name

    def touch(self) -> None:
        """Increment the polling version counter."""
        self.version += 1

    @property
    def total_cells(self) -> int:
        """Return the total number of cells in the grid."""
        return self.grid_cols * self.grid_rows


class SessionPlayer(models.Model):
    """Association between a user and a session.

    Attributes:
        session: The session the user participates in.
        user: The participating user.
        joined_at: Timestamp of joining.
        is_active: Whether the player still participates.
        is_original: Whether the player was assigned at session start.
    """

    session = models.ForeignKey(
        GameSession, on_delete=models.CASCADE, related_name="players"
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="session_participations"
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    is_original = models.BooleanField(default=True)

    class Meta:
        db_table = "sessions_player"
        constraints = [
            models.UniqueConstraint(
                fields=("session", "user"), name="uniq_session_player"
            )
        ]
        ordering = ("joined_at",)

    def __str__(self) -> str:
        """Return a readable representation."""
        return f"{self.user.username} in {self.session.name}"
