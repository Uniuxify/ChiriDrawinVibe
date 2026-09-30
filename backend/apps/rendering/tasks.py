"""Celery tasks for the rendering pipeline."""

from __future__ import annotations

import logging

from celery import shared_task

from apps.cells.models import Cell
from apps.rendering.service import render_cell, render_session

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def render_cell_task(self, cell_id: str) -> str | None:
    """Render a committed cell into a stored raster.

    Args:
        cell_id: UUID of the cell to render.

    Returns:
        The storage key of the produced raster, or ``None`` if the cell is
        missing.

    Raises:
        self.retry: When rendering fails transiently.
    """
    cell = Cell.objects.filter(id=cell_id).select_related("session").first()
    if cell is None:
        logger.warning("render_cell_task: cell %s not found", cell_id)
        return None

    try:
        raster = render_cell(cell)
    except Exception as exc:
        logger.exception("render_cell_task failed for cell %s", cell_id)
        raise self.retry(exc=exc) from exc
    return raster.storage_key


@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def render_session_task(self, session_id: int) -> str | None:
    """Assemble the full picture of a finished session.

    Args:
        session_id: Primary key of the session to render.

    Returns:
        The storage key of the produced raster, or ``None`` if the session is
        missing.

    Raises:
        self.retry: When rendering fails transiently.
    """
    from apps.sessions.models import GameSession

    session = GameSession.objects.filter(id=session_id).first()
    if session is None:
        logger.warning("render_session_task: session %s not found", session_id)
        return None

    try:
        raster = render_session(session)
    except Exception as exc:
        logger.exception("render_session_task failed for session %s", session_id)
        raise self.retry(exc=exc) from exc
    return raster.storage_key
