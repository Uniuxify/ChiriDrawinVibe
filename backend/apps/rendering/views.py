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
    """Return the finished picture plus per-cell rasters for reveal."""

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
            is_owner = session.owner_id == request.user.id
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
