"""Models for cells, drawing history, rasters and context snapshots."""

from __future__ import annotations

import uuid

from django.contrib.auth import get_user_model
from django.db import models

from apps.common.enums import CellStatus
from apps.sessions.models import GameSession

User = get_user_model()


class Cell(models.Model):
    """A single drawable cell of the session grid.

    Attributes:
        id: UUID primary key.
        session: Owning session.
        row: Zero-based row index.
        col: Zero-based column index.
        owner: Current owner of the cell.
        original_owner: Owner assigned at distribution time.
        status: Lifecycle state of the cell.
        locked_by: User who currently holds an active unlock.
        unlocked_at: Timestamp of the last unlock.
        first_drawn_at: Timestamp of the first non-empty autosave.
        filled_at: Timestamp when the cell was committed.
        revision: Monotonic revision of the stored history.
        comment: Optional comment attached at commit time.
        is_orphan: Whether the cell belongs to the orphan pool.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        GameSession, on_delete=models.CASCADE, related_name="cells"
    )
    row = models.PositiveIntegerField()
    col = models.PositiveIntegerField()

    owner = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="owned_cells",
    )
    original_owner = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="originally_owned_cells",
    )

    status = models.CharField(
        max_length=16,
        choices=CellStatus.choices,
        default=CellStatus.EMPTY,
        db_index=True,
    )
    locked_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="locked_cells",
    )

    unlocked_at = models.DateTimeField(null=True, blank=True)
    first_drawn_at = models.DateTimeField(null=True, blank=True)
    filled_at = models.DateTimeField(null=True, blank=True)
    revision = models.PositiveIntegerField(default=0)
    comment = models.TextField(blank=True, default="")
    is_orphan = models.BooleanField(default=False)

    class Meta:
        db_table = "cells_cell"
        constraints = [
            models.UniqueConstraint(
                fields=("session", "row", "col"), name="uniq_session_cell_position"
            )
        ]
        ordering = ("row", "col")

    def __str__(self) -> str:
        """Return a readable representation."""
        return f"Cell({self.session_id}, r{self.row}, c{self.col})"


class CellHistory(models.Model):
    """A stored revision of a cell's drawing operations.

    Attributes:
        cell: The owning cell.
        revision: Revision number this payload represents.
        operations: JSON list of drawing operations.
        is_final: Whether this revision was committed.
        size_bytes: Serialized payload size used for limit checks.
        created_at: Creation timestamp.
    """

    cell = models.ForeignKey(
        Cell, on_delete=models.CASCADE, related_name="histories"
    )
    revision = models.PositiveIntegerField()
    operations = models.JSONField(default=list)
    is_final = models.BooleanField(default=False)
    size_bytes = models.PositiveBigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cells_history"
        constraints = [
            models.UniqueConstraint(
                fields=("cell", "revision"), name="uniq_cell_revision"
            )
        ]
        ordering = ("revision",)

    def __str__(self) -> str:
        """Return a readable representation."""
        return f"History(cell={self.cell_id}, rev={self.revision})"


class CellRaster(models.Model):
    """Rendered raster artifact of a committed cell.

    Attributes:
        cell: The rendered cell.
        storage_key: Backend-agnostic location of the image.
        width: Image width in pixels.
        height: Image height in pixels.
        created_at: Creation timestamp.
    """

    cell = models.ForeignKey(
        Cell, on_delete=models.CASCADE, related_name="rasters"
    )
    storage_key = models.CharField(max_length=512)
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cells_raster"
        ordering = ("-created_at",)

    def __str__(self) -> str:
        """Return a readable representation."""
        return f"Raster(cell={self.cell_id})"


class SessionRaster(models.Model):
    """Rendered raster artifact of the assembled session picture.

    Attributes:
        session: The assembled session.
        storage_key: Backend-agnostic location of the image.
        width: Image width in pixels.
        height: Image height in pixels.
        created_at: Creation timestamp.
    """

    session = models.ForeignKey(
        GameSession, on_delete=models.CASCADE, related_name="rasters"
    )
    storage_key = models.CharField(max_length=512)
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cells_session_raster"
        ordering = ("-created_at",)

    def __str__(self) -> str:
        """Return a readable representation."""
        return f"SessionRaster(session={self.session_id})"


class CellContextSnapshot(models.Model):
    """Frozen read-only context captured when a cell is unlocked.

    Attributes:
        cell: The cell the context belongs to.
        neighbor_ids: Ordered list of neighbour cell UUIDs.
        neighbor_rasters: Mapping of neighbour cell UUID to raster key.
        bounds: JSON geometry of the context area.
        created_at: Creation timestamp.
    """

    cell = models.OneToOneField(
        Cell, on_delete=models.CASCADE, related_name="context_snapshot"
    )
    neighbor_ids = models.JSONField(default=list)
    neighbor_rasters = models.JSONField(default=dict)
    bounds = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cells_context_snapshot"

    def __str__(self) -> str:
        """Return a readable representation."""
        return f"Context(cell={self.cell_id})"
