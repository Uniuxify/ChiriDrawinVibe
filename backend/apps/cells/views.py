"""Views for unlocking cells, autosave, commit and admin overrides."""

from __future__ import annotations

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cells.models import Cell, CellContextSnapshot
from apps.cells.serializers import (
    AutosaveSerializer,
    CellSerializer,
    CommitSerializer,
    RasterSerializer,
)
from apps.cells.services import (
    autosave_cell,
    commit_cell,
    lock_cell,
    unlock_cell,
)
from apps.common.enums import CellStatus
from apps.common.errors import NotFoundError, PermissionDeniedError
from apps.common.permissions import IsAdmin


class CellUnlockView(APIView):
    """Unlock a cell and return its frozen context."""

    def post(self, request: Request, cell_id) -> Response:
        """Unlock the cell for the caller.

        Args:
            request: The current request.
            cell_id: Cell UUID.

        Returns:
            The unlocked cell and the context snapshot payload.
        """
        cell, snapshot = unlock_cell(cell_id, request.user)
        return Response(
            {
                "cell": CellSerializer(cell).data,
                "context": _context_payload(snapshot),
            }
        )


class CellLockView(APIView):
    """Release an unlocked cell without committing it."""

    def post(self, request: Request, cell_id) -> Response:
        """Release the cell lock.

        Args:
            request: The current request.
            cell_id: Cell UUID.

        Returns:
            The released cell.
        """
        cell = lock_cell(cell_id, request.user)
        return Response(CellSerializer(cell).data)


class CellAutosaveView(APIView):
    """Persist an intermediate drawing history."""

    def post(self, request: Request, cell_id) -> Response:
        """Store an autosaved revision.

        Args:
            request: The current request.
            cell_id: Cell UUID.

        Returns:
            The new revision number and accepted payload size.
        """
        serializer = AutosaveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        history = autosave_cell(
            cell_id,
            request.user,
            serializer.validated_data["operations"],
            serializer.validated_data["revision"],
        )
        return Response(
            {
                "revision": history.revision,
                "size_bytes": history.size_bytes,
            }
        )


class CellCommitView(APIView):
    """Finalize the drawing of a cell."""

    def post(self, request: Request, cell_id) -> Response:
        """Commit the cell and enqueue rendering.

        Args:
            request: The current request.
            cell_id: Cell UUID.

        Returns:
            The committed cell.
        """
        serializer = CommitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cell = commit_cell(
            cell_id,
            request.user,
            serializer.validated_data["operations"],
            serializer.validated_data["revision"],
            serializer.validated_data.get("comment", ""),
        )

        from apps.iterations.services import on_cell_committed

        on_cell_committed(cell)
        return Response(CellSerializer(cell).data)


class CellContextView(APIView):
    """Return the stored context snapshot and neighbour rasters."""

    def get(self, request: Request, cell_id) -> Response:
        """Return the context of a cell known to the caller.

        Args:
            request: The current request.
            cell_id: Cell UUID.

        Returns:
            The context geometry and available neighbour rasters.
        """
        cell = Cell.objects.filter(id=cell_id).select_related("session").first()
        if cell is None:
            raise NotFoundError("Cell not found.")

        is_owner = cell.owner_id == request.user.id
        is_filled = cell.status == CellStatus.FILLED
        if not (is_owner or is_filled):
            raise PermissionDeniedError("The context of this cell is not available.")

        snapshot = CellContextSnapshot.objects.filter(cell=cell).first()
        if snapshot is None:
            return Response({"context": None, "rasters": []})

        rasters = []
        for neighbour in cell.session.cells.filter(
            id__in=snapshot.neighbor_ids, status=CellStatus.FILLED
        ):
            raster = neighbour.rasters.order_by("-created_at").first()
            if raster is not None:
                rasters.append(
                    {
                        "cell_id": str(neighbour.id),
                        "row": neighbour.row,
                        "col": neighbour.col,
                        "raster": RasterSerializer(raster).data,
                    }
                )
        return Response({"context": _context_payload(snapshot), "rasters": rasters})


class CellAdminUnlockView(APIView):
    """Administrator override that releases a cell lock to its owner."""

    permission_classes = (IsAdmin,)

    def post(self, request: Request, cell_id) -> Response:
        """Release the lock of a cell, returning it to the owner.

        Args:
            request: The current request.
            cell_id: Cell UUID.

        Returns:
            The released cell.
        """
        cell = Cell.objects.filter(id=cell_id).first()
        if cell is None:
            raise NotFoundError("Cell not found.")
        if cell.session.owner_id != request.user.id:
            raise PermissionDeniedError("Only the session owner may do this.")

        CellContextSnapshot.objects.filter(cell=cell).delete()
        cell.status = CellStatus.EMPTY
        cell.locked_by = None
        cell.save(update_fields=["status", "locked_by"])
        return Response(CellSerializer(cell).data)


def _context_payload(snapshot: CellContextSnapshot) -> dict:
    """Build a client-facing payload from a context snapshot.

    Args:
        snapshot: The stored context snapshot.

    Returns:
        A mapping with neighbour ids, raster keys and bounds.
    """
    return {
        "cell_id": str(snapshot.cell_id),
        "neighbor_ids": snapshot.neighbor_ids,
        "neighbor_rasters": snapshot.neighbor_rasters,
        "bounds": snapshot.bounds,
    }
