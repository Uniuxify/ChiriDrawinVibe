"""Convert SVG markup into PNG bytes.

CairoSVG is used when available because it provides accurate SVG rendering.
A very small Pillow-based fallback draws only polylines, which keeps the
pipeline functional on machines without the native Cairo libraries required by
CairoSVG.
"""

from __future__ import annotations

import logging
from io import BytesIO
from typing import Any

logger = logging.getLogger(__name__)


def _rasterize_with_cairosvg(svg: str, width: int, height: int) -> bytes | None:
    """Rasterize SVG using CairoSVG.

    Args:
        svg: Complete SVG document.
        width: Target width in pixels.
        height: Target height in pixels.

    Returns:
        PNG bytes, or ``None`` when CairoSVG is unavailable.
    """
    try:
        import cairosvg
    except Exception:
        logger.warning("CairoSVG is not available; using the fallback renderer.")
        return None

    return cairosvg.svg2png(
        bytestring=svg.encode("utf-8"),
        output_width=width,
        output_height=height,
    )


def _rasterize_with_pillow(
    operations: list[dict[str, Any]], width: int, height: int
) -> bytes:
    """Draw a minimal PNG fallback using Pillow.

    Args:
        operations: Drawing operations in normalized coordinates.
        width: Target width in pixels.
        height: Target height in pixels.

    Returns:
        PNG bytes containing the rendered operations.
    """
    from PIL import Image, ImageDraw

    image = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    draw = ImageDraw.Draw(image)

    for operation in operations:
        op_type = str(operation.get("type", ""))
        if op_type == "clear":
            draw.rectangle([(0, 0), (width, height)], fill=(255, 255, 255, 255))
            continue
        if op_type not in {"stroke", "erase"}:
            continue

        points = operation.get("points") or []
        if len(points) < 2:
            continue

        color = (255, 255, 255, 255) if op_type == "erase" else (0, 0, 0, 255)
        size = float(operation.get("size") or 0.01)
        line_width = max(1, int(size * width))
        coordinates = [
            (float(point[0]) * width, float(point[1]) * height) for point in points
        ]
        draw.line(coordinates, fill=color, width=line_width, joint="curve")

    buffer = BytesIO()
    image.convert("RGB").save(buffer, format="PNG")
    return buffer.getvalue()


def rasterize(
    svg: str,
    operations: list[dict[str, Any]],
    width: int,
    height: int,
) -> bytes:
    """Render a cell or session picture as PNG bytes.

    Args:
        svg: SVG markup built from the drawing history.
        operations: The originating operations, used by the fallback renderer.
        width: Target width in pixels.
        height: Target height in pixels.

    Returns:
        PNG image bytes.
    """
    png = _rasterize_with_cairosvg(svg, width, height)
    if png is not None:
        return png
    return _rasterize_with_pillow(operations, width, height)
