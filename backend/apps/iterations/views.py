"""Views exposing the current iteration of a session."""

from __future__ import annotations

from django.utils import timezone
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.enums import IterationState
from apps.common.errors import NotFoundError
from apps.sessions.models import GameSession


class CurrentIterationView(APIView):
    """Return the active iteration and the caller's remaining quota."""

    def get(self, request: Request, session_id: int) -> Response:
        """Return iteration state relevant to the caller.

        Args:
            request: The current request.
            session_id: Session primary key.

        Returns:
            The iteration index and timing plus the caller's quota usage.

        Raises:
            NotFoundError: If the session or a visible iteration is missing.
        """
        session = GameSession.objects.filter(id=session_id).first()
        if session is None:
            raise NotFoundError("Session not found.")

        iteration = (
            session.iterations.filter(state=IterationState.ACTIVE).first()
            or session.iterations.order_by("-index").first()
        )
        if iteration is None:
            raise NotFoundError("The session has no iteration yet.")

        progress = iteration.progress.filter(user=request.user).first()
        filled = progress.filled_count if progress else 0
        now = timezone.now()

        return Response(
            {
                "index": iteration.index,
                "state": iteration.state,
                "interval_seconds": session.interval_seconds,
                "unlock_quota": session.unlock_quota,
                "filled_count": filled,
                "remaining": max(0, session.unlock_quota - filled),
                "timer_started": iteration.timer_started_at is not None,
                "ends_at": (
                    iteration.ends_at.isoformat() if iteration.ends_at else None
                ),
                "seconds_left": (
                    max(0, int((iteration.ends_at - now).total_seconds()))
                    if iteration.ends_at
                    else None
                ),
            }
        )
