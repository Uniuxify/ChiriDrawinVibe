"""Views exposing shared configuration to clients."""

from __future__ import annotations

from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


class PublicConfigView(APIView):
    """Expose non-sensitive runtime configuration to the frontend."""

    permission_classes = (AllowAny,)

    def get(self, request: Request) -> Response:
        """Return public configuration values.

        Args:
            request: The incoming HTTP request.

        Returns:
            A response with polling interval and validation limits.
        """
        return Response(
            {
                "polling_interval_seconds": settings.POLLING_INTERVAL_SECONDS,
                "autosave_interval_seconds": settings.AUTOSAVE_INTERVAL_SECONDS,
                "limits": {
                    "min_canvas_size": settings.MIN_CANVAS_SIZE,
                    "max_canvas_size": settings.MAX_CANVAS_SIZE,
                    "min_grid": settings.MIN_GRID,
                    "max_grid": settings.MAX_GRID,
                    "max_ops_per_cell": settings.MAX_OPS_PER_CELL,
                    "max_history_json_bytes": settings.MAX_HISTORY_JSON_BYTES,
                    "min_interval_seconds": settings.MIN_INTERVAL_SECONDS,
                },
            }
        )
