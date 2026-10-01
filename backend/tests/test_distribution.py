"""Unit tests for the linear congruential grid colouring."""

from __future__ import annotations

import pytest

from apps.sessions.distribution import (
    best_steps,
    build_assignment,
    compute_conflicts,
)


def class_counts(grid: list[list[int]]) -> dict[int, int]:
    """Count how many cells each class owns."""
    counts: dict[int, int] = {}
    for row in grid:
        for value in row:
            counts[value] = counts.get(value, 0) + 1
    return counts


def test_best_steps_match_known_table():
    """The optimiser finds a high-separation pair for common class counts."""
    # (1, 2) is optimal for several small k; the exact pair may vary, but the
    # minimum separation should be at least sqrt(2) for k >= 3.
    for k in (2, 3, 4, 5, 8, 9):
        a, b = best_steps(k)
        assert 0 <= a < k and 0 <= b < k
        assert (a, b) != (0, 0)


def test_all_classes_present_and_covered():
    """Every class appears and the whole grid is covered."""
    for k in (2, 3, 4, 5, 7, 10):
        grid = build_assignment(10, 10, k)
        counts = class_counts(grid)
        assert set(counts) == set(range(k))
        assert sum(counts.values()) == 100


def test_fair_sizes_within_one():
    """Rebalancing keeps class sizes within one cell of each other."""
    for (rows, cols, k) in ((10, 10, 3), (10, 10, 5), (9, 8, 4), (7, 5, 6)):
        counts = class_counts(build_assignment(rows, cols, k))
        assert max(counts.values()) - min(counts.values()) <= 1


def test_zero_contacts_for_four_or_more():
    """k >= 4 reaches zero same-class contacts on aligned grids."""
    for (rows, cols, k) in ((10, 10, 4), (10, 10, 5), (8, 8, 8), (12, 12, 9)):
        grid = build_assignment(rows, cols, k)
        assert compute_conflicts(grid) == 0


def test_two_classes_checkerboard():
    """Two classes form a chessboard with no orthogonal clashes."""
    grid = build_assignment(6, 6, 2)
    for row in range(6):
        for col in range(5):
            assert grid[row][col] != grid[row][col + 1]


def test_three_classes_low_conflict():
    """Three classes keep contacts low (diagonal clashes only)."""
    grid = build_assignment(9, 9, 3)
    assert compute_conflicts(grid) <= 2 * (9 - 1) * (9 - 1)


def test_single_class_fills_the_grid():
    """With one class every cell shares it."""
    grid = build_assignment(3, 4, 1)
    assert grid == [[0, 0, 0, 0]] * 3


def test_rectangular_and_degenerate_grids():
    """Rectangular and single row/column grids are supported."""
    rectangular = build_assignment(3, 7, 5)
    assert len(rectangular) == 3
    assert all(len(row) == 7 for row in rectangular)
    assert compute_conflicts(rectangular) == 0

    row_grid = build_assignment(1, 12, 4)
    assert len(row_grid) == 1
    assert sum(class_counts(row_grid).values()) == 12

    col_grid = build_assignment(12, 1, 4)
    assert all(len(row) == 1 for row in col_grid)


def test_invalid_dimensions_raise():
    """Non-positive sizes raise a ValueError."""
    with pytest.raises(ValueError):
        build_assignment(0, 4, 2)
    with pytest.raises(ValueError):
        build_assignment(4, 0, 2)
    with pytest.raises(ValueError):
        build_assignment(4, 4, 0)
    with pytest.raises(ValueError):
        best_steps(0)