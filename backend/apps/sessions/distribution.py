"""Grid colouring that spreads players using a linear congruential formula.

Assign each cell one of ``k`` classes with the formula ``(a * x + b * y) mod k``
(``x`` = row, ``y`` = column). The steps ``(a, b)`` are chosen to push cells of
the same class as far apart as possible, which keeps neighbouring cells (the
8-cell Moore neighbourhood) from sharing an owner.

Why this works:

* The king graph over the plane is 4-colourable, so ``k >= 4`` can reach zero
  same-class contacts. The optimal linear step ``(1, 2)`` for example keeps
  every neighbour vector out of the kernel of ``(a, b)`` mod ``k`` for
  ``k >= 4``.
* ``k == 2`` yields a chessboard and ``k == 3`` diagonal bands; both cannot
  reach zero contacts but stay low.

The step pair is found by a full search over ``(a, b)`` limited to coprime
triples ``gcd(a, b, k) == 1`` (so all ``k`` classes are reachable), maximising
the smallest squared distance between cells of one class. Session player caps
keep ``k`` small enough for this to stay cheap.

The module is free of Django imports so it can be unit tested and reused.
"""

from __future__ import annotations

from math import gcd

#: Neighbour offsets of the 8-cell Moore neighbourhood.
NEIGHBOUR_OFFSETS = (
    (-1, -1),
    (-1, 0),
    (-1, 1),
    (0, -1),
    (0, 1),
    (1, -1),
    (1, 0),
    (1, 1),
)

#: Cache of the best (a, b) steps per class count, filled lazily.
_STEP_CACHE: dict[int, tuple[int, int]] = {}


def best_steps(classes: int) -> tuple[int, int]:
    """Return the ``(a, b)`` steps that best separate one class's cells.

    The search only keeps coprime step pairs (so every one of the ``classes``
    colours is reachable) and maximises the minimum squared Euclidean distance
    between two cells that share a colour.

    Args:
        classes: Number of colours.

    Returns:
        The pair ``(a, b)`` with the largest minimum separation.

    Raises:
        ValueError: If ``classes`` is not positive.
    """
    if classes <= 0:
        raise ValueError("classes must be positive")
    cached = _STEP_CACHE.get(classes)
    if cached is not None:
        return cached

    best = (1, 0)
    best_distance = -1
    span = 2 * classes
    for a in range(classes):
        for b in range(classes):
            if a == 0 and b == 0:
                continue
            if gcd(gcd(a, b), classes) != 1:
                continue
            min_sq = _min_class_distance_sq(a, b, classes, span)
            if min_sq > best_distance:
                best_distance = min_sq
                best = (a, b)

    _STEP_CACHE[classes] = best
    return best


def _min_class_distance_sq(a: int, b: int, classes: int, span: int) -> int:
    """Return the smallest squared offset inside a colour's lattice.

    Args:
        a: Row step.
        b: Column step.
        classes: Number of colours.
        span: Offset range to inspect on each axis.

    Returns:
        The minimum ``dx**2 + dy**2`` over non-zero vectors whose colour is 0.
    """
    best = span * span * 2 + 1
    for dx in range(-span, span + 1):
        for dy in range(-span, span + 1):
            if dx == 0 and dy == 0:
                continue
            if (a * dx + b * dy) % classes == 0:
                distance = dx * dx + dy * dy
                if distance < best:
                    best = distance
    return best


def build_assignment(rows: int, cols: int, classes: int) -> list[list[int]]:
    """Assign a class (0..classes-1) to every cell of a rows x cols grid.

    Cells are coloured with ``(a * row + b * col) mod classes`` and then
    lightly rebalanced so class sizes differ by at most one wherever possible.

    Args:
        rows: Number of grid rows.
        cols: Number of grid columns.
        classes: Number of classes (players) to spread across the grid.

    Returns:
        A ``rows`` x ``cols`` matrix of class indices.

    Raises:
        ValueError: If any dimension is not positive.
    """
    if rows <= 0 or cols <= 0:
        raise ValueError("rows and cols must be positive")
    if classes <= 0:
        raise ValueError("classes must be positive")

    a, b = best_steps(classes)
    grid = [
        [(a * row + b * col) % classes for col in range(cols)]
        for row in range(rows)
    ]

    if classes > 1:
        _balance_classes(grid, classes)
    return grid


def compute_conflicts(grid: list[list[int]]) -> int:
    """Count ordered same-class neighbour pairs (each contact counted twice).

    Args:
        grid: The class matrix produced by :func:`build_assignment`.

    Returns:
        The total number of neighbouring cell pairs sharing a class.
    """
    rows = len(grid)
    cols = len(grid[0]) if rows else 0
    total = 0
    for row in range(rows):
        for col in range(cols):
            value = grid[row][col]
            for d_row, d_col in NEIGHBOUR_OFFSETS:
                n_row = row + d_row
                n_col = col + d_col
                if 0 <= n_row < rows and 0 <= n_col < cols:
                    if grid[n_row][n_col] == value:
                        total += 1
    return total


def _balance_classes(grid: list[list[int]], classes: int) -> None:
    """Rebalance class counts in place, preferring low-conflict moves.

    Args:
        grid: The class matrix to adjust.
        classes: Total number of classes used in ``grid``.
    """
    rows = len(grid)
    cols = len(grid[0]) if rows else 0
    total = rows * cols
    target = total // classes
    remainder = total - target * classes
    # The first ``remainder`` classes end up one cell larger.
    wanted = {
        index: target + (1 if index < remainder else 0) for index in range(classes)
    }

    counts = {index: 0 for index in range(classes)}
    for row in range(rows):
        for col in range(cols):
            counts[grid[row][col]] += 1

    # Move surplus cells to the classes that are short.
    for short_class in range(classes):
        while counts[short_class] < wanted[short_class]:
            best: tuple[int, int] | None = None
            best_score: tuple[int, int] | None = None
            for row in range(rows):
                for col in range(cols):
                    source = grid[row][col]
                    if source == short_class:
                        continue
                    if counts[source] <= wanted[source]:
                        continue
                    own = _same_class_neighbours(grid, row, col, source)
                    gain = _same_class_neighbours(grid, row, col, short_class)
                    score = (own, gain)
                    if best_score is None or score < best_score:
                        best_score = score
                        best = (row, col)
            if best is None:
                break
            row, col = best
            source = grid[row][col]
            counts[source] -= 1
            counts[short_class] += 1
            grid[row][col] = short_class


def _same_class_neighbours(
    grid: list[list[int]], row: int, col: int, value: int
) -> int:
    """Count neighbours of a cell that already hold a given class.

    Args:
        grid: The class matrix.
        row: Row index of the cell.
        col: Column index of the cell.
        value: Class to count around the cell.

    Returns:
        The number of neighbouring cells equal to ``value``.
    """
    rows = len(grid)
    cols = len(grid[0]) if rows else 0
    count = 0
    for d_row, d_col in NEIGHBOUR_OFFSETS:
        n_row = row + d_row
        n_col = col + d_col
        if 0 <= n_row < rows and 0 <= n_col < cols:
            if grid[n_row][n_col] == value:
                count += 1
    return count
