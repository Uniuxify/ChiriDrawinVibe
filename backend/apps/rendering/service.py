"""High-level rendering service for cells and whole sessions."""

from __future__ import annotations

import logging
from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.db import transaction

from apps.cells.models import Cell, CellRaster, SessionRaster
from apps.rendering.raster import rasterize
from apps.rendering.storage import get_storage
from apps.rendering.svg import build_svg

logger = logging.getLogger(__name__)

EMPTY_CELL_COLOR = "#FFFFFF"


def cell_pixel_size(cell: Cell) -> tuple[int, int]:
    """Compute the pixel dimensions of a single cell.

    Args:
        cell: The cell being rendered.

    Returns:
        A ``(width, height)`` tuple derived from the session canvas.
    """
    session = cell.session
    width = max(1, session.canvas_width // session.grid_cols)
    height = max(1, session.canvas_height // session.grid_rows)
    return width, height


def render_cell(cell: Cell) -> CellRaster:
    """Render the committed history of a cell into a stored raster.

    Args:
        cell: The cell whose final history should be rendered.

    Returns:
        The persisted :class:`CellRaster` row.

    Raises:
        ValueError: If the cell has no final history revision.
    """
    final = cell.histories.filter(is_final=True).order_by("-revision").first()
    if final is None:
        raise ValueError(f"Cell {cell.id} has no final history to render.")

    width, height = cell_pixel_size(cell)
    operations = final.operations or []
    svg = build_svg(operations, width, height)
    png = rasterize(svg, operations, width, height)

    key = f"sessions/{cell.session_id}/cells/{cell.id}/r{final.revision}.png"
    get_storage().put(key, png)

    with transaction.atomic():
        CellRaster.objects.filter(cell=cell).delete()
        raster = CellRaster.objects.create(
            cell=cell, storage_key=key, width=width, height=height
        )
    return raster


def render_session(session) -> SessionRaster:
    """Assemble the full picture from committed cell rasters.

    Args:
        session: The session to assemble.

    Returns:
        The persisted :class:`SessionRaster` row.
    """
    from PIL import Image

    width = session.canvas_width
    height = session.canvas_height
    canvas = Image.new("RGBA", (width, height), (255, 255, 255, 255))

    for cell in session.cells.select_related("session").all():
        if cell.status != "filled":
            continue
        cell_width, cell_height = cell_pixel_size(cell)
        raster = cell.rasters.order_by("-created_at").first()
        if raster is None:
            continue
        cell_image = _load_cell_image(raster, cell_width, cell_height)
        position = (cell.col * cell_width, cell.row * cell_height)
        canvas.paste(cell_image, position)

    buffer = BytesIO()
    canvas.convert("RGB").save(buffer, format="PNG")
    key = f"sessions/{session.id}/result.png"
    get_storage().put(key, buffer.getvalue())

    with transaction.atomic():
        SessionRaster.objects.filter(session=session).delete()
        raster = SessionRaster.objects.create(
            session=session, storage_key=key, width=width, height=height
        )
    return raster


def _load_cell_image(raster: CellRaster, width: int, height: int):
    """Load a stored cell raster and resize it to the cell dimensions.

    Args:
        raster: The stored raster metadata.
        width: Target width in pixels.
        height: Target height in pixels.

    Returns:
        A Pillow image resized to the requested dimensions.
    """
    from PIL import Image

    path = Path(settings.MEDIA_ROOT) / raster.storage_key
    if path.exists():
        image = Image.open(path).convert("RGBA")
    else:
        image = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    if image.size != (width, height):
        image = image.resize((width, height))
    return image
