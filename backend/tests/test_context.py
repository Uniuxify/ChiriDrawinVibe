"""Unit tests for the pure context geometry resolver."""

from __future__ import annotations

from apps.cells.context import NeighborResolver


def test_min_rectangle_returns_eight_neighbours():
    """A minimum rectangle covers the direct 8-neighbourhood."""
    resolver = NeighborResolver(shape="rectangle", radius_mode="min", radius_pct=0)
    result = resolver.resolve(row=3, col=3, grid_rows=8, grid_cols=8)
    assert len(result) == 8
    assert (3, 3) not in result


def test_zero_percent_radius_yields_no_neighbours():
    """A zero percent radius resolves to an empty context."""
    resolver = NeighborResolver(shape="rectangle", radius_mode="percent", radius_pct=0)
    assert resolver.resolve(row=4, col=4, grid_rows=9, grid_cols=9) == []


def test_neighbours_are_clipped_at_grid_edges():
    """Cells outside the grid are never returned."""
    resolver = NeighborResolver(shape="rectangle", radius_mode="min", radius_pct=0)
    result = resolver.resolve(row=0, col=0, grid_rows=5, grid_cols=5)
    assert result == [(0, 1), (1, 0), (1, 1)]


def test_results_are_sorted_and_exclude_self():
    """The resolver returns a sorted, deduplicated list without the origin."""
    resolver = NeighborResolver(shape="circle", radius_mode="min", radius_pct=0)
    result = resolver.resolve(row=2, col=2, grid_rows=6, grid_cols=6)
    assert (2, 2) not in result
    assert result == sorted(set(result))
