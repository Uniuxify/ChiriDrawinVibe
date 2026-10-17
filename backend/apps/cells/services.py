"""Domain services for cell unlocking, autosave and commit."""

from __future__ import annotations

import random
import uuid

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.cells.context import NeighborResolver
from apps.cells.models import Cell, CellContextSnapshot, CellHistory
from apps.cells.validation import validate_history
from apps.common.enums import CellStatus, IterationState, SessionStatus
from apps.common.errors import (
    CellContextConflictError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    StaleRevisionError,
)
from apps.iterations.models import Iteration, IterationProgress


def active_iteration(session) -> Iteration:
    """Return the current active iteration of a session.

    Args:
        session: The owning session.

    Returns:
        The active iteration.

    Raises:
        ConflictError: If there is no active iteration.
    """
    iteration = session.iterations.filter(state=IterationState.ACTIVE).first()
    if iteration is None:
        raise ConflictError("The session has no active iteration.")
    return iteration


def progress_for(iteration: Iteration, user) -> IterationProgress:
    """Return the progress row of a player, creating it when missing.

    Args:
        iteration: The current iteration.
        user: The player.

    Returns:
        The player's progress row.
    """
    progress, _ = IterationProgress.objects.get_or_create(
        iteration=iteration, user=user
    )
    return progress


def compute_context_cells(cell: Cell) -> list[Cell]:
    """Return the neighbour cells covered by the context zone.

    Args:
        cell: The cell being unlocked.

    Returns:
        The list of neighbour cells inside the context zone.
    """
    session = cell.session
    resolver = NeighborResolver(
        shape=session.context_shape,
        radius_mode=session.context_radius_mode,
        radius_pct=session.context_radius_pct,
        cell_width=session.canvas_width / session.grid_cols,
        cell_height=session.canvas_height / session.grid_rows,
    )
    coordinates = resolver.resolve(
        cell.row, cell.col, session.grid_rows, session.grid_cols
    )
    if not coordinates:
        return []
    query = Q()
    for row, col in coordinates:
        query |= Q(row=row, col=col)
    return list(session.cells.filter(query))


def _find_context_conflicts(cell: Cell, neighbours: list[Cell]) -> list[Cell]:
    """Return neighbours that block the unlock because they hold a live lock.

    Args:
        cell: The cell being unlocked.
        neighbours: Cells inside the context zone.

    Returns:
        Conflicting unlocked cells, excluding the cell itself.
    """
    return [
        neighbour
        for neighbour in neighbours
        if neighbour.id != cell.id and neighbour.status == CellStatus.UNLOCKED
    ]


def _latest_raster_key(cell: Cell) -> str | None:
    """Return the storage key of the newest raster of a cell.

    Args:
        cell: The rendered cell.

    Returns:
        The storage key, or ``None`` when no raster exists.
    """
    raster = cell.rasters.order_by("-created_at").first()
    return raster.storage_key if raster else None


def _context_bounds(cell: Cell, neighbours: list[Cell]) -> dict:
    """Return the bounding box of the context zone in grid coordinates.

    Args:
        cell: The unlocked cell.
        neighbours: Cells inside the context zone.

    Returns:
        A mapping with the inclusive row and column range.
    """
    rows = [cell.row] + [neighbour.row for neighbour in neighbours]
    cols = [cell.col] + [neighbour.col for neighbour in neighbours]
    return {
        "min_row": min(rows),
        "max_row": max(rows),
        "min_col": min(cols),
        "max_col": max(cols),
    }


@transaction.atomic
def unlock_cell(cell_id: uuid.UUID, user) -> tuple[Cell, CellContextSnapshot]:
    """Unlock a cell for a player after validating all domain rules.

    Args:
        cell_id: Identifier of the cell to unlock.
        user: The player performing the unlock.

    Returns:
        The unlocked cell and its frozen context snapshot.

    Raises:
        NotFoundError: If the cell does not exist.
        PermissionDeniedError: If the cell does not belong to the player.
        ConflictError: If the session is not active or the quota is spent.
        CellContextConflictError: If the context overlaps a locked cell.
    """
    cell = (
        Cell.objects.select_for_update()
        .select_related("session")
        .filter(id=cell_id)
        .first()
    )
    if cell is None:
        raise NotFoundError("Cell not found.")

    session = cell.session
    if session.status != SessionStatus.ACTIVE:
        raise ConflictError("The session is not active.")
    if cell.owner_id != user.id:
        raise PermissionDeniedError("You can only unlock your own cells.")
    if cell.status != CellStatus.EMPTY:
        raise ConflictError("Only empty cells can be unlocked.")
    if session.cells.filter(locked_by=user, status=CellStatus.UNLOCKED).exists():
        raise ConflictError("Confirm your current cell before unlocking another.")

    iteration = active_iteration(session)
    progress = progress_for(iteration, user)
    if progress.filled_count >= session.unlock_quota:
        raise ConflictError("You have exhausted the quota for this iteration.")

    neighbours = compute_context_cells(cell)
    conflicting = _find_context_conflicts(cell, neighbours)
    if conflicting:
        raise CellContextConflictError(
            details={"conflicting_cell_ids": [str(c.id) for c in conflicting]}
        )

    raster_map = {
        str(neighbour.id): _latest_raster_key(neighbour)
        for neighbour in neighbours
        if neighbour.status == CellStatus.FILLED
    }

    snapshot = CellContextSnapshot.objects.create(
        cell=cell,
        neighbor_ids=[str(neighbour.id) for neighbour in neighbours],
        neighbor_rasters=raster_map,
        bounds=_context_bounds(cell, neighbours),
    )

    cell.status = CellStatus.UNLOCKED
    cell.locked_by = user
    cell.unlocked_at = timezone.now()
    cell.save(update_fields=["status", "locked_by", "unlocked_at"])

    session.touch()
    session.save(update_fields=["version"])
    return cell, snapshot


@transaction.atomic
def lock_cell(cell_id: uuid.UUID, user) -> Cell:
    """Release an unlocked cell without committing it.

    Args:
        cell_id: Identifier of the cell to lock.
        user: The player performing the action.

    Returns:
        The released cell.

    Raises:
        NotFoundError: If the cell does not exist.
        PermissionDeniedError: If the cell is not locked by the player.
    """
    cell = Cell.objects.select_for_update().filter(id=cell_id).first()
    if cell is None:
        raise NotFoundError("Cell not found.")
    if cell.locked_by_id != user.id or cell.status != CellStatus.UNLOCKED:
        raise PermissionDeniedError("This cell is not unlocked by you.")

    CellContextSnapshot.objects.filter(cell=cell).delete()
    cell.status = CellStatus.EMPTY
    cell.locked_by = None
    cell.save(update_fields=["status", "locked_by"])
    return cell


def _has_drawing(operations: list[dict]) -> bool:
    """Return whether a history contains any real drawing content.

    Args:
        operations: Validated operations.

    Returns:
        True when at least one stroke with points exists.
    """
    return any(
        operation.get("type") in {"stroke", "erase"} and operation.get("points")
        for operation in operations
    )


def _store_history(cell: Cell, operations: object, is_final: bool) -> int:
    """Validate and persist a history revision for a cell.

    Args:
        cell: The cell being saved.
        operations: Raw operation payload.
        is_final: Whether the revision is the committed one.

    Returns:
        The new revision number.
    """
    validated = validate_history(operations)
    next_revision = cell.revision + 1
    CellHistory.objects.create(
        cell=cell,
        revision=next_revision,
        operations=validated,
        is_final=is_final,
        size_bytes=len(str(validated).encode("utf-8")),
    )
    cell.revision = next_revision
    if cell.first_drawn_at is None and _has_drawing(validated):
        cell.first_drawn_at = timezone.now()
    return next_revision


@transaction.atomic
def autosave_cell(
    cell_id: uuid.UUID, user, operations: object, expected_revision: int
) -> CellHistory:
    """Persist an intermediate drawing history for an unlocked cell.

    Args:
        cell_id: Identifier of the cell.
        user: The player performing the autosave.
        operations: Raw operation list from the client.
        expected_revision: Revision the client believes is current.

    Returns:
        The stored history revision.

    Raises:
        NotFoundError: If the cell does not exist.
        PermissionDeniedError: If the cell is not locked by the player.
        StaleRevisionError: If the client revision is outdated.
    """
    cell = Cell.objects.select_for_update().filter(id=cell_id).first()
    if cell is None:
        raise NotFoundError("Cell not found.")
    if cell.locked_by_id != user.id or cell.status != CellStatus.UNLOCKED:
        raise PermissionDeniedError("This cell is not unlocked by you.")
    if expected_revision != cell.revision:
        raise StaleRevisionError(details={"current_revision": cell.revision})

    revision = _store_history(cell, operations, is_final=False)
    cell.save(update_fields=["revision", "first_drawn_at"])
    return cell.histories.get(revision=revision)


@transaction.atomic
def commit_cell(
    cell_id: uuid.UUID, user, operations: object, expected_revision: int, comment: str
) -> Cell:
    """Finalize the drawing of a cell and release its lock.

    Args:
        cell_id: Identifier of the cell.
        user: The player committing the cell.
        operations: Final operation list from the client.
        expected_revision: Revision the client believes is current.
        comment: Optional free-text comment stored with the cell.

    Returns:
        The committed cell.

    Raises:
        NotFoundError: If the cell does not exist.
        PermissionDeniedError: If the cell is not locked by the player.
        StaleRevisionError: If the client revision is outdated.
    """
    cell = Cell.objects.select_for_update().filter(id=cell_id).first()
    if cell is None:
        raise NotFoundError("Cell not found.")
    if cell.locked_by_id != user.id or cell.status != CellStatus.UNLOCKED:
        raise PermissionDeniedError("This cell is not unlocked by you.")
    if expected_revision != cell.revision:
        raise StaleRevisionError(details={"current_revision": cell.revision})

    _store_history(cell, operations, is_final=True)

    iteration = active_iteration(cell.session)
    progress = progress_for(iteration, user)

    cell.status = CellStatus.FILLED
    cell.locked_by = None
    cell.filled_at = timezone.now()
    cell.comment = comment or ""
    cell.save(
        update_fields=[
            "revision",
            "first_drawn_at",
            "status",
            "locked_by",
            "filled_at",
            "comment",
        ]
    )

    progress.filled_count += 1
    progress.save(update_fields=["filled_count"])
    return cell


@transaction.atomic
def admin_skip_cell(cell_id: uuid.UUID) -> Cell:
    """Hand a stalled cell over to the least-loaded active player.

    Used by the administrator when a player stops drawing: the cell is
    returned to the pool and reassigned to a random player among those
    holding the fewest own cells, so the workload stays balanced.

    Args:
        cell_id: Identifier of the cell to skip.

    Returns:
        The reassigned cell, back in the empty state.

    Raises:
        NotFoundError: If the cell does not exist.
        ConflictError: If the session is not active, the cell is filled or
            orphaned, or there is no other player to take it.
    """
    cell = (
        Cell.objects.select_for_update()
        .select_related("session")
        .filter(id=cell_id)
        .first()
    )
    if cell is None:
        raise NotFoundError("Cell not found.")

    session = cell.session
    if session.status != SessionStatus.ACTIVE:
        raise ConflictError("The session is not active.")
    if cell.status == CellStatus.FILLED:
        raise ConflictError("Filled cells cannot be skipped.")
    if cell.is_orphan:
        raise ConflictError(
            "Orphan cells are redistributed automatically, not skipped."
        )

    candidates = [
        player
        for player in session.players.filter(is_active=True)
        if player.user_id != cell.owner_id
    ]
    if not candidates:
        raise ConflictError("There is no other player to take this cell.")

    counts = {
        player.user_id: session.cells.filter(owner_id=player.user_id).count()
        for player in candidates
    }
    least_loaded = min(counts.values())
    best = [
        player
        for player in candidates
        if counts[player.user_id] == least_loaded
    ]
    target = random.choice(best)

    CellContextSnapshot.objects.filter(cell=cell).delete()
    cell.owner = target.user
    cell.status = CellStatus.EMPTY
    cell.locked_by = None
    cell.unlocked_at = None
    cell.save(update_fields=["owner", "status", "locked_by", "unlocked_at"])

    session.touch()
    session.save(update_fields=["version"])
    return cell


@transaction.atomic
def admin_force_fill_cell(cell_id: uuid.UUID) -> Cell:
    """Count a cell as filled without any drawing (blank commit).

    Used by the administrator to "fill in for" a stuck player: the cell
    becomes filled and white, consumes the owner's quota for the current
    iteration and triggers the usual cell rendering.

    Args:
        cell_id: Identifier of the cell to fill.

    Returns:
        The filled cell.

    Raises:
        NotFoundError: If the cell does not exist.
        ConflictError: If the session is not active or the cell is filled.
    """
    cell = (
        Cell.objects.select_for_update()
        .select_related("session")
        .filter(id=cell_id)
        .first()
    )
    if cell is None:
        raise NotFoundError("Cell not found.")

    session = cell.session
    if session.status != SessionStatus.ACTIVE:
        raise ConflictError("The session is not active.")
    if cell.status == CellStatus.FILLED:
        raise ConflictError("The cell is already filled.")

    # An explicit empty final revision keeps the history unambiguous for
    # viewers and the timelapse player.
    _store_history(cell, [], is_final=True)

    try:
        iteration = active_iteration(session)
        progress = progress_for(iteration, cell.owner)
        progress.filled_count += 1
        progress.save(update_fields=["filled_count"])
    except ConflictError:
        # No active iteration (e.g. interval-less sessions between rounds).
        pass

    cell.status = CellStatus.FILLED
    cell.locked_by = None
    cell.filled_at = timezone.now()
    cell.save(
        update_fields=["revision", "first_drawn_at", "status", "locked_by", "filled_at"]
    )

    session.touch()
    session.save(update_fields=["version"])
    return cell
