"""Build SVG markup from a normalized drawing history.

Coordinate model:
    * ``points`` are normalized to ``0..1`` relative to the cell size.
    * ``size`` is the stroke width expressed as a fraction of the cell width.

Supported operations:
    * ``stroke`` - draw a polyline with the brush tool.
    * ``erase`` - draw a polyline in the background colour.
    * ``clear`` - discard all previous operations.
"""

from __future__ import annotations

from html import escape
from typing import Any

DEFAULT_BACKGROUND = "#FFFFFF"


def _points_to_path(points: list[list[float]], width: int, height: int) -> str:
    """Convert normalized points into an SVG path ``d`` attribute.

    Args:
        points: Sequence of ``[x, y]`` pairs normalized to ``0..1``.
        width: Target raster width in pixels.
        height: Target raster height in pixels.

    Returns:
        A path string connecting the points.
    """
    commands: list[str] = []
    for index, point in enumerate(points):
        x = float(point[0]) * width
        y = float(point[1]) * height
        commands.append(f"{'M' if index == 0 else 'L'}{x:.2f},{y:.2f}")
    return " ".join(commands)


def build_svg(
    operations: list[dict[str, Any]],
    width: int,
    height: int,
    background: str = DEFAULT_BACKGROUND,
) -> str:
    """Render a drawing history into SVG markup.

    Args:
        operations: Ordered list of drawing operations.
        width: Output width in pixels.
        height: Output height in pixels.
        background: Background fill colour.

    Returns:
        A complete SVG document as a string.
    """
    elements: list[str] = []

    for operation in operations:
        op_type = str(operation.get("type", ""))

        if op_type == "clear":
            elements = []
            continue

        if op_type not in {"stroke", "erase"}:
            continue

        points = operation.get("points") or []
        if len(points) < 1:
            continue

        path = _points_to_path(points, width, height)
        if not path:
            continue

        if op_type == "erase":
            color = background
        else:
            color = str(operation.get("color") or "#000000FF")

        size = float(operation.get("size") or 0.01)
        stroke_width = max(1.0, size * width)

        elements.append(
            f'<path d="{escape(path)}" fill="none" stroke="{escape(color)}" '
            f'stroke-width="{stroke_width:.2f}" stroke-linecap="round" '
            f'stroke-linejoin="round" />'
        )

    body = "\n  ".join(elements)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">\n'
        f'  <rect x="0" y="0" width="{width}" '
        f'height="{height}" fill="{background}" />\n'
        f"  {body}\n</svg>"
    )
