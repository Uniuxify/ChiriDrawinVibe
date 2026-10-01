"""Pure geometry helpers computing the read-only context around a cell.

The context is a figure centred on the unlocked cell. Geometry is measured in
pixels, using the real cell size ``w × h`` (canvas size divided by the grid):

* the reference radius is ``R = min(w, h) * (0.5 + pct / 100)``, so it grows
  from ``min(w, h) / 2`` at ``0%`` to ``1.5 * min(w, h)`` at ``100%``;
* a ``circle`` context has radius ``R``;
* a ``rectangle`` context is a square whose half-side equals ``R`` (its
  inscribed circle has radius ``R``), so at ``0%`` its side is ``min(w, h)``
  and at ``100%`` it is ``3 * min(w, h)``;
* at exactly ``0%`` the figure is the cell itself, whatever the configured
  shape is, and ``R`` is ignored.

``R`` is the minimum distance from the centre to the corresponding face of a
neighbouring cell, taken over the four axis directions. A neighbour takes part
in the context as soon as its rectangle *intersects* the figure, which is what
makes partially visible cells possible.

The module deliberately has no Django imports so it can be unit tested in
isolation and reused by future grid types.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

SQUARE = "rectangle"
CIRCLE = "circle"

_EPSILON = 1e-9


@dataclass(frozen=True)
class NeighborResolver:
    """Resolve which cells are covered by the context figure.

    Attributes:
        shape: Either ``"rectangle"`` or ``"circle"``.
        radius_mode: One of ``"percent"``, ``"min"`` or ``"max"``.
        radius_pct: Radius value in the range 0..100.
        cell_width: Width of a single cell in pixels.
        cell_height: Height of a single cell in pixels.
    """

    shape: str
    radius_mode: str
    radius_pct: int
    cell_width: float = 1.0
    cell_height: float = 1.0

    @property
    def min_cell_side(self) -> float:
        """Return the smaller edge of a cell.

        Returns:
            ``min(cell_width, cell_height)`` in pixels.
        """
        return min(self.cell_width, self.cell_height)

    def resolve(
        self,
        row: int,
        col: int,
        grid_rows: int,
        grid_cols: int,
    ) -> list[tuple[int, int]]:
        """Return every neighbour whose cell overlaps the context figure.

        Cells merely touching the figure boundary are not included, which is
        what makes ``0%`` produce zero neighbours.

        Args:
            row: Row index of the unlocked cell.
            col: Column index of the unlocked cell.
            grid_rows: Total number of rows in the grid.
            grid_cols: Total number of columns in the grid.

        Returns:
            A sorted list of ``(row, col)`` neighbours excluding the cell
            itself.
        """
        kind, half_w, half_h = self.figure_geometry()
        reach_row = int(math.ceil(half_h / self.cell_height)) + 1
        reach_col = int(math.ceil(half_w / self.cell_width)) + 1
        found: set[tuple[int, int]] = set()

        for dr in range(-reach_row, reach_row + 1):
            for dc in range(-reach_col, reach_col + 1):
                if dr == 0 and dc == 0:
                    continue
                candidate_row = row + dr
                candidate_col = col + dc
                if not 0 <= candidate_row < grid_rows:
                    continue
                if not 0 <= candidate_col < grid_cols:
                    continue
                if self._intersects(dr, dc, kind, half_w, half_h):
                    found.add((candidate_row, candidate_col))

        return sorted(found)

    def effective_radius(self) -> float:
        """Return the reference radius of the context figure.

        Returns:
            ``min(cell_width, cell_height) * (0.5 + pct / 100)`` in pixels.
        """
        return self.min_cell_side * (0.5 + self._percent() / 100.0)

    def figure_geometry(self) -> tuple[str, float, float]:
        """Describe the figure to draw, centred on the edited cell.

        Returns:
            A tuple ``(kind, half_width, half_height)`` in pixels. At ``0%``
            the figure is the cell itself, so ``kind`` is ``"rectangle"`` and
            the half-extents are half the cell size.
        """
        if self._percent() <= 0:
            return SQUARE, self.cell_width / 2, self.cell_height / 2

        radius = self.effective_radius()
        kind = SQUARE if self.shape == SQUARE else CIRCLE
        return kind, radius, radius

    def shape_params(self, row: int, col: int) -> dict:
        """Return the context figure description for the client.

        Args:
            row: Row index of the unlocked cell.
            col: Column index of the unlocked cell.

        Returns:
            A mapping with the figure kind, its half-extents in pixels and
            the centre of the figure in grid coordinates.
        """
        kind, half_w, half_h = self.figure_geometry()
        return {
            "kind": kind,
            "half_width": half_w,
            "half_height": half_h,
            "center_row": row,
            "center_col": col,
        }

    def _percent(self) -> float:
        """Return the effective radius percentage for any radius mode.

        Returns:
            ``0`` for ``min``, ``100`` for ``max`` and the clamped percentage
            otherwise.
        """
        if self.radius_mode == "min":
            return 0.0
        if self.radius_mode == "max":
            return 100.0
        return max(0.0, min(100.0, float(self.radius_pct)))

    def _intersects(
        self,
        dr: int,
        dc: int,
        kind: str,
        half_w: float,
        half_h: float,
    ) -> bool:
        """Return whether the cell overlaps the interior of the figure.

        Offsets are converted to pixels so a rectangle cell behaves like a
        rectangle and the figure keeps its real proportions.

        Args:
            dr: Row offset relative to the unlocked cell.
            dc: Column offset relative to the unlocked cell.
            kind: ``"rectangle"`` or ``"circle"``.
            half_w: Half width of the figure in pixels.
            half_h: Half height of the figure in pixels.

        Returns:
            True when the neighbour cell overlaps the figure's interior.
        """
        # Distance from the figure centre to the closest point of the cell.
        dx = max(0.0, (abs(dc) - 0.5) * self.cell_width)
        dy = max(0.0, (abs(dr) - 0.5) * self.cell_height)

        if kind == SQUARE:
            return dx < half_w - _EPSILON and dy < half_h - _EPSILON
        return math.hypot(dx, dy) < half_w - _EPSILON