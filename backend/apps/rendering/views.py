"""Views returning the assembled session result and per-cell rasters."""

from __future__ import annotations

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cells.serializers import RasterSerializer
from apps.common.enums import CellStatus, SessionStatus
from apps.common.errors import NotFoundError, PermissionDeniedError
from apps.rendering.storage import get_storage
from apps.sessions.models import GameSession


class SessionResultView(APIView):
    """Return the finished picture plus per-cell rasters for reveal.

    Open to anonymous viewers for public finished sessions; private
    results require the owner or a player token.
    """

    permission_classes = ()

    def get(self, request: Request, session_id: int) -> Response:
        """Return the assembled result and the revealable cells.

        Args:
            request: The current request.
            session_id: Session primary key.

        Returns:
            A response with the composite image URL and covered cell tiles.

        Raises:
            NotFoundError: If the session is not visible or not finished.
            PermissionDeniedError: If a viewer is not allowed to see the result.
        """
        session = GameSession.objects.filter(id=session_id).first()
        if session is None:
            raise NotFoundError("Session not found.")
        if session.status != SessionStatus.FINISHED:
            raise NotFoundError("The session result is not available yet.")

        if not session.is_public:
            user_id = getattr(request.user, "id", None)
            is_owner = user_id is not None and session.owner_id == user_id
            is_player = request.user.is_authenticated and session.players.filter(
                user=request.user
            ).exists()
            if not (is_owner or is_player):
                raise PermissionDeniedError("This result is private.")

        session_raster = session.rasters.order_by("-created_at").first()
        storage = get_storage()

        cells = []
        for cell in session.cells.filter(status=CellStatus.FILLED):
            raster = cell.rasters.order_by("-created_at").first()
            if raster is None:
                continue
            cells.append(
                {
                    "cell_id": str(cell.id),
                    "row": cell.row,
                    "col": cell.col,
                    "comment": cell.comment,
                    "raster": RasterSerializer(raster).data,
                }
            )

        return Response(
            {
                "session_id": session.id,
                "name": session.name,
                "canvas_width": session.canvas_width,
                "canvas_height": session.canvas_height,
                "grid_cols": session.grid_cols,
                "grid_rows": session.grid_rows,
                "image_url": (
                    storage.url(session_raster.storage_key)
                    if session_raster
                    else None
                ),
                "cells": cells,
            }
        )


class SessionTimelapseView(APIView):
    """Return the committed drawing histories of every cell, for replay."""

    permission_classes = ()

    def get(self, request: Request, session_id: int) -> Response:
        """Return the per-cell histories ordered along the timeline.

        Only finished sessions expose a timelapse; private ones require the
        owner or a player token, public ones are open to anonymous viewers.

        Args:
            request: The current request.
            session_id: Session primary key.

        Returns:
            A response with the canvas geometry and one event per cell,
            each carrying its committed operations in drawing order.

        Raises:
            NotFoundError: If the session is not visible or not finished.
            PermissionDeniedError: If a viewer is not allowed to see it.
        """
        session = GameSession.objects.filter(id=session_id).first()
        if session is None:
            raise NotFoundError("Session not found.")
        if session.status != SessionStatus.FINISHED:
            raise NotFoundError("The timelapse is not available yet.")

        user_id = getattr(request.user, "id", None)
        if not session.is_public:
            is_owner = user_id is not None and session.owner_id == user_id
            is_player = request.user.is_authenticated and session.players.filter(
                user=request.user
            ).exists()
            if not (is_owner or is_player):
                raise PermissionDeniedError("This timelapse is private.")

        cells = session.cells.filter(status=CellStatus.FILLED).prefetch_related(
            "histories"
        )
        events = []
        for cell in cells:
            history = (
                cell.histories.filter(is_final=True).order_by("-revision").first()
                or cell.histories.order_by("-revision").first()
            )
            if history is None:
                continue
            operations = history.operations or []
            first_ts = operations[0].get("ts") if operations else None
            events.append(
                {
                    "cell_id": str(cell.id),
                    "row": cell.row,
                    "col": cell.col,
                    "filled_at": cell.filled_at.isoformat() if cell.filled_at else None,
                    "first_ts": first_ts,
                    "operations": operations,
                }
            )

        # Replay order: cells whose first stroke came earlier go first; fall
        # back to the commit time when the history carries no timestamps.
        def sort_key(event: dict):
            if event["first_ts"] is not None:
                return (0, event["first_ts"], event["row"], event["col"])
            return (1, event["filled_at"] or "", event["row"], event["col"])

        events.sort(key=sort_key)

        return Response(
            {
                "session_id": session.id,
                "name": session.name,
                "canvas_width": session.canvas_width,
                "canvas_height": session.canvas_height,
                "grid_cols": session.grid_cols,
                "grid_rows": session.grid_rows,
                "cell_width": session.canvas_width / session.grid_cols,
                "cell_height": session.canvas_height / session.grid_rows,
                "events": events,
            }
        )
