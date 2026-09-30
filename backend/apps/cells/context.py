"""Pure geometry helpers computing the read-only context around a cell.

The context is the set of neighbouring cells whose rasters are shown to the
player when they unlock a cell. Its shape and size are driven by the session
configuration:

* ``context_shape`` chooses a rectangle or a circle.
* ``context_radius_mode`` decides how ``context_radius_pct`` is interpreted:

  - ``percent``: a literal percentage of the maximum neighbour extent.
  - ``min``: the smallest figure that still contains the immediate neighbours
    (a described circle for a circle, or the direct 8-neighbourhood for a
    rectangle).
  - ``max``: a figure that always fully includes one adjacent cell.

The module deliberately has no Django imports so it can be unit tested in
isolation and reused by future grid types.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class NeighborResolver:
    """Resolve which cells belong to a context zone.

    Attributes:
        shape: Either ``"rectangle"`` or ``"circle"``.
        radius_mode: One of ``"percent"``, ``"min"`` or ``"max"``.
        radius_pct: Radius value in the range ``0..100``.
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
        cell_aspect: float = 1.0,
    ) -> list[tuple[int, int]]:
        """Return the neighbour coordinates covered by the context zone.

        Args:
            row: Row index of the unlocked cell.
            col: Column index of the unlocked cell.
            grid_rows: Total number of rows in the grid.
            grid_cols: Total number of columns in the grid.
            cell_aspect: Height-to-width ratio of a cell, used for circles.

        Returns:
            A sorted list of ``(row, col)`` neighbours excluding the cell
            itself.
        """
        radius = self.effective_radius()
        found: set[tuple[int, int]] = set()

        reach = max(1, math.ceil(radius) + 1)
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
                if self._contains(dr, dc, radius, cell_aspect):
                    found.add((candidate_row, candidate_col))

        return sorted(found)

    def effective_radius(self) -> float:
        """Translate the configured radius into a distance in cell units.

        Returns:
            The radius measured in cells.
        """
        if self.radius_mode == "min":
            return math.sqrt(2) if self.shape == "circle" else 1.0
        if self.radius_mode == "max":
            return 2.0 if self.shape == "rectangle" else math.sqrt(5)
        # Percent interpolates from empty (0) to the max figure (100).
        span = 2.0 if self.shape == "rectangle" else math.sqrt(5)
        return max(0.0, self.radius_pct / 100.0 * span)

    def _contains(
        self, dr: int, dc: int, radius: float, cell_aspect: float
    ) -> bool:
        """Return whether a neighbour offset lies inside the context zone.

        Rectangles use the Chebyshev (box) metric so the zone is an
        axis-aligned square; circles use the Euclidean metric.

        Args:
            dr: Row offset relative to the unlocked cell.
            dc: Column offset relative to the unlocked cell.
            radius: Effective radius measured in cells.
            cell_aspect: Height-to-width ratio of a cell.

        Returns:
            True when the neighbour participates in the context.
        """
        if radius <= 0:
            return False
        if self.shape == "rectangle":
            return max(abs(dr), abs(dc)) <= radius + 1e-9
        distance = math.hypot(float(dc), float(dr) * cell_aspect)
        return distance <= radius + 1e-9
