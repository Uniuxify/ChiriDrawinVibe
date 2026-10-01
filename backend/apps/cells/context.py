"""Pure geometry helpers computing the read-only context around a cell.

The context is a figure inscribed in a circle of radius ``context_radius``
centred on the unlocked cell. The radius is measured in cells:

* ``rectangle`` draws an axis-aligned square whose half-diagonal is the
  radius, so ``R = sqrt(2) / 2`` makes the square coincide with the cell;
* ``circle`` draws a circle of that radius, so ``R = 0.5`` fits inside the
  cell.

``min`` is the largest radius that still touches no neighbouring cell,
``max`` is ``1.5`` (the far edge of an adjacent cell), and ``percent``
interpolates between them.

A neighbour participates in the context as soon as its rectangle *intersects*
the figure, which is what makes partially visible cells possible.

The module deliberately has no Django imports so it can be unit tested in
isolation and reused by future grid types.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

SQUARE = "rectangle"
CIRCLE = "circle"

#: Radius of the circle in which the context figure is inscribed.
MIN_RADIUS_SQUARE = math.sqrt(2) / 2
MIN_RADIUS_CIRCLE = 0.5
MAX_RADIUS = 1.5

_EPSILON = 1e-9


@dataclass(frozen=True)
class NeighborResolver:
    """Resolve which cells are covered by the context figure.

    Attributes:
        shape: Either ``"rectangle"`` or ``"circle"``.
        radius_mode: One of ``"percent"``, ``"min"`` or ``"max"``.
        radius_pct: Radius value in the range 0..100.
    """

    shape: str
    radius_mode: str
    radius_pct: int

    def resolve(
        self,
        row: int,
        col: int,
        grid_rows: int,
        grid_cols: int,
    ) -> list[tuple[int, int]]:
        """Return every neighbour whose cell overlaps the context figure.

        Cells merely touching the figure boundary are not included, which is
        what makes ``min`` produce zero neighbours.

        Args:
            row: Row index of the unlocked cell.
            col: Column index of the unlocked cell.
            grid_rows: Total number of rows in the grid.
            grid_cols: Total number of columns in the grid.

        Returns:
            A sorted list of ``(row, col)`` neighbours excluding the cell
            itself.
        """
        radius = self.effective_radius()
        reach = math.ceil(radius) + 1
        found: set[tuple[int, int]] = set()

        for dr in range(-reach, reach + 1):
            for dc in range(-reach, reach + 1):
                if dr == 0 and dc == 0:
                    continue
                candidate_row = row + dr
                candidate_col = col + dc
                if not 0 <= candidate_row < grid_rows:
                    continue
                if not 0 <= candidate_col < grid_cols:
                    continue
                if self._intersects(dr, dc, radius):
                    found.add((candidate_row, candidate_col))

        return sorted(found)

    def effective_radius(self) -> float:
        """Translate the configured radius mode into a radius in cells.

        Returns:
            The radius of the circumscribed circle of the context figure.
        """
        minimum = self.minimum_radius()
        if self.radius_mode == "min":
            return minimum
        if self.radius_mode == "max":
            return MAX_RADIUS
        percent = max(0.0, min(100.0, float(self.radius_pct)))
        return minimum + percent / 100.0 * (MAX_RADIUS - minimum)

    def minimum_radius(self) -> float:
        """Return the largest radius that still touches no neighbour.

        Returns:
            ``sqrt(2) / 2`` for a square (it matches the cell exactly) and
            ``0.5`` for a circle (it is inscribed in the cell).
        """
        return MIN_RADIUS_SQUARE if self.shape == SQUARE else MIN_RADIUS_CIRCLE

    def shape_params(self, row: int, col: int) -> dict:
        """Return the context figure description for the client.

        Args:
            row: Row index of the unlocked cell.
            col: Column index of the unlocked cell.

        Returns:
            A mapping with the figure kind, its radius in cells and the
            centre of the figure in grid coordinates.
        """
        return {
            "kind": self.shape,
            "radius_cells": self.effective_radius(),
            "center_row": row,
            "center_col": col,
        }

    def _intersects(self, dr: int, dc: int, radius: float) -> bool:
        """Return whether the cell overlaps the interior of the figure.

        Offsets are expressed in cells (a cell is a unit square in the
        figure's coordinate space), so a circle stays round and a square
        keeps equal sides regardless of the canvas aspect ratio.

        Args:
            dr: Row offset relative to the unlocked cell.
            dc: Column offset relative to the unlocked cell.
            radius: Radius of the circumscribed circle in cells.

        Returns:
            True when the neighbour cell overlaps the figure's interior.
        """
        if radius <= 0:
            return False

        half = 0.5
        # Distance from the figure centre to the closest point of the cell.
        dx = max(0.0, abs(dc) - half)
        dy = max(0.0, abs(dr) - half)

        if self.shape == SQUARE:
            side = radius / math.sqrt(2)
            return dx < side - _EPSILON and dy < side - _EPSILON
        return math.hypot(dx, dy) < radius - _EPSILON
