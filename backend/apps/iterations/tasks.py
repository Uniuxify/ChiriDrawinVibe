"""Celery tasks driving iteration timers and auto-commit sweeps."""

from __future__ import annotations

import logging

from celery import shared_task

from apps.common.enums import IterationState, SessionStatus
from apps.iterations.services import force_commit_pending
from apps.sessions.models import GameSession

logger = logging.getLogger(__name__)


@shared_task
def finalize_expired_iterations() -> int:
    """Auto-commit expired unlocked cells across all active sessions.

    Returns:
        The total number of cells that were auto-committed.
    """
    committed_total = 0
    sessions = GameSession.objects.filter(status=SessionStatus.ACTIVE)
    for session in sessions.iterator():
        has_expired = session.iterations.filter(
            state=IterationState.ACTIVE, ends_at__isnull=False
        ).exists()
        if not has_expired:
            continue
        try:
            committed_total += len(force_commit_pending(session))
        except Exception:
            logger.exception("Iteration sweep failed for session %s", session.id)
    return committed_total
