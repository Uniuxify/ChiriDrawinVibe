"""API exception handling and domain error definitions.

Provides a consistent error envelope for the whole API::

    {
        "code": "cell_context_conflict",
        "message": "Human readable message.",
        "details": {...}
    }
"""

from __future__ import annotations

from typing import Any

from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


class DomainError(APIException):
    """Base class for API errors carrying a stable machine-readable code.

    Attributes:
        status_code: HTTP status returned to the client.
        default_code: Stable error code used by the frontend.
        default_detail: Human readable message.
    """

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "domain_error"
    default_detail = "A domain rule was violated."

    def __init__(
        self,
        detail: str | None = None,
        code: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        """Initialize the domain error.

        Args:
            detail: Overrides the default human readable message.
            code: Overrides the default stable error code.
            details: Additional structured payload for the client.
        """
        super().__init__(detail or self.default_detail, code or self.default_code)
        self.error_code = code or self.default_code
        self.details = details or {}


class ValidationError(DomainError):
    """Raised when input or stored data fails validation."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "validation_error"
    default_detail = "Validation failed."


class PermissionDeniedError(DomainError):
    """Raised when the caller lacks permission for an action."""

    status_code = status.HTTP_403_FORBIDDEN
    default_code = "permission_denied"
    default_detail = "You are not allowed to perform this action."


class NotFoundError(DomainError):
    """Raised when a requested entity does not exist."""

    status_code = status.HTTP_404_NOT_FOUND
    default_code = "not_found"
    default_detail = "The requested resource was not found."


class ConflictError(DomainError):
    """Raised when a request conflicts with the current domain state."""

    status_code = status.HTTP_409_CONFLICT
    default_code = "conflict"
    default_detail = "The request conflicts with the current state."


class StaleRevisionError(ConflictError):
    """Raised when an autosave targets an outdated cell revision."""

    default_code = "stale_revision"
    default_detail = "A newer revision of this cell already exists."


class CellContextConflictError(ConflictError):
    """Raised when unlocking a cell conflicts with a locked neighbour."""

    default_code = "cell_context_conflict"
    default_detail = (
        "The cell cannot be unlocked because its context overlaps "
        "another active cell."
    )


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response:
    """Return a response using the unified error envelope.

    Args:
        exc: The exception raised during request handling.
        context: DRF exception handler context.

    Returns:
        A DRF ``Response`` with a normalized error body.
    """
    response = drf_exception_handler(exc, context)

    if isinstance(exc, DomainError):
        payload: dict[str, Any] = {
            "code": exc.error_code,
            "message": str(exc.detail),
            "details": exc.details,
        }
        return Response(payload, status=exc.status_code)

    if response is None:
        return Response(
            {
                "code": "internal_error",
                "message": "An unexpected error occurred.",
                "details": {},
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    detail = response.data
    if isinstance(detail, dict) and "code" in detail:
        return response

    response.data = {
        "code": "validation_error" if response.status_code == 400 else "error",
        "message": _flatten_detail(detail),
        "details": detail if isinstance(detail, dict) else {},
    }
    return response


def _flatten_detail(detail: Any) -> str:
    """Convert an arbitrary DRF error payload into a single message string.

    Args:
        detail: The ``response.data`` produced by DRF.

    Returns:
        A human readable single-line message.
    """
    if isinstance(detail, str):
        return detail
    if isinstance(detail, list) and detail:
        return _flatten_detail(detail[0])
    if isinstance(detail, dict):
        for value in detail.values():
            return _flatten_detail(value)
    return "Request failed."
