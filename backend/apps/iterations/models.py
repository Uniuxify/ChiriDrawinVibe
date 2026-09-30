"""Models for session iterations and per-player progress."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import models

from apps.common.enums import IterationState
from apps.sessions.models import GameSession

User = get_user_model()


class Iteration(models.Model):
    """A single unlock/fill round of a session.

    Attributes:
        session: Owning session.
        index: Zero-based ordinal of the iteration.
        state: Current lifecycle state.
        timer_started_at: When the first player exhausted the quota.
        ends_at: Deadline once the timer has started, otherwise null.
        started_at: When the iteration began.
        finished_at: When the iteration completed.
    """

    session = models.ForeignKey(
        GameSession, on_delete=models.CASCADE, related_name="iterations"
    )
    index = models.PositiveIntegerField()
    state = models.CharField(
        max_length=16,
        choices=IterationState.choices,
        default=IterationState.ACTIVE,
        db_index=True,
    )
    timer_started_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "iterations_iteration"
        constraints = [
            models.UniqueConstraint(
                fields=("session", "index"), name="uniq_session_iteration_index"
            )
        ]
        ordering = ("index",)

    def __str__(self) -> str:
        """Return a readable representation."""
        return f"Iteration(session={self.session_id}, index={self.index})"


class IterationProgress(models.Model):
    """Per-player quota progress within an iteration.

    Attributes:
        iteration: The iteration this progress belongs to.
        user: The player.
        filled_count: Number of cells committed in this iteration.
        exhausted_at: When the player used up the whole quota.
    """

    iteration = models.ForeignKey(
        Iteration, on_delete=models.CASCADE, related_name="progress"
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="iteration_progress"
    )
    filled_count = models.PositiveIntegerField(default=0)
    exhausted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "iterations_progress"
        constraints = [
            models.UniqueConstraint(
                fields=("iteration", "user"), name="uniq_iteration_progress"
            )
        ]
        ordering = ("user_id",)

    def __str__(self) -> str:
        """Return a readable representation."""
        return f"Progress(iter={self.iteration_id}, user={self.user_id})"
