"""Validation of drawing operation histories sent by clients."""

from __future__ import annotations

import json
import re

from django.conf import settings

from apps.common.errors import ValidationError

COLOR_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$")
ALLOWED_TYPES = {"stroke", "erase", "clear"}
ALLOWED_TOOLS = {"brush", "eraser"}
MAX_POINTS_PER_OPERATION = 2000


def validate_history(operations: object) -> list[dict]:
    """Validate and normalize a list of drawing operations.

    Args:
        operations: Raw payload received from the client.

    Returns:
        The validated list of operations.

    Raises:
        ValidationError: If the payload is malformed or exceeds limits.
    """
    if not isinstance(operations, list):
        raise ValidationError("operations must be a list.")

    if len(operations) > settings.MAX_OPS_PER_CELL:
        raise ValidationError(
            f"Too many operations (limit {settings.MAX_OPS_PER_CELL})."
        )

    validated = [
        _validate_operation(operation, index)
        for index, operation in enumerate(operations)
    ]

    serialized = json.dumps(validated)
    if len(serialized.encode("utf-8")) > settings.MAX_HISTORY_JSON_BYTES:
        raise ValidationError("The drawing history is too large to store.")

    return validated


def _validate_operation(operation: object, index: int) -> dict:
    """Validate a single drawing operation.

    Args:
        operation: The raw operation mapping.
        index: Position of the operation used in error messages.

    Returns:
        A normalized operation dictionary.

    Raises:
        ValidationError: If the operation is malformed.
    """
    if not isinstance(operation, dict):
        raise ValidationError(f"Operation {index} is not an object.")

    op_type = operation.get("type")
    if op_type not in ALLOWED_TYPES:
        raise ValidationError(f"Operation {index} has an unsupported type.")

    if op_type == "clear":
        return {"type": "clear"}

    tool = operation.get("tool", "brush")
    if tool not in ALLOWED_TOOLS:
        raise ValidationError(f"Operation {index} uses an unsupported tool.")

    color = operation.get("color", "#000000FF")
    if not isinstance(color, str) or not COLOR_PATTERN.match(color):
        raise ValidationError(f"Operation {index} has an invalid colour.")

    size = operation.get("size", 0.01)
    if not isinstance(size, (int, float)) or not 0 < float(size) <= 1.0:
        raise ValidationError(f"Operation {index} has an invalid size.")

    points = operation.get("points")
    if not isinstance(points, list) or not points:
        raise ValidationError(f"Operation {index} has no points.")
    if len(points) > MAX_POINTS_PER_OPERATION:
        raise ValidationError(f"Operation {index} has too many points.")

    normalized_points: list[list[float]] = []
    for point in points:
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            raise ValidationError(f"Operation {index} has a malformed point.")
        x, y = point
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            raise ValidationError(f"Operation {index} has a non-numeric point.")
        if not 0.0 <= float(x) <= 1.0 or not 0.0 <= float(y) <= 1.0:
            raise ValidationError(f"Operation {index} has out-of-range coordinates.")
        normalized_points.append([float(x), float(y)])

    return {
        "type": op_type,
        "tool": tool,
        "color": color,
        "size": float(size),
        "points": normalized_points,
    }
