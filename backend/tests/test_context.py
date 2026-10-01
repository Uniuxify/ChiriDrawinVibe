"""Unit tests for the pure context geometry resolver."""

from __future__ import annotations

import math

from apps.cells.context import NeighborResolver


def test_min_rectangle_touches_no_neighbour():
    """A square matching the cell has no room for a neighbour."""
    resolver = NeighborResolver(shape="rectangle", radius_mode="min", radius_pct=0)
    assert resolver.resolve(row=3, col=3, grid_rows=8, grid_cols=8) == []


def test_min_circle_touches_no_neighbour():
    """A circle inscribed in the cell has no room for a neighbour."""
    resolver = NeighborResolver(shape="circle", radius_mode="min", radius_pct=0)
    assert resolver.resolve(row=3, col=3, grid_rows=8, grid_cols=8) == []


def test_min_radius_values():
    """Minimum radii follow the inscribed figure definition."""
    square = NeighborResolver(shape="rectangle", radius_mode="min", radius_pct=0)
    circle = NeighborResolver(shape="circle", radius_mode="min", radius_pct=0)
    assert math.isclose(square.effective_radius(), math.sqrt(2) / 2)
    assert math.isclose(circle.effective_radius(), 0.5)


def test_max_radius_reaches_one_cell_further():
    """The maximum radius covers the full 3x3 ring."""
    resolver = NeighborResolver(shape="rectangle", radius_mode="max", radius_pct=100)
    result = resolver.resolve(row=3, col=3, grid_rows=8, grid_cols=8)
    assert math.isclose(resolver.effective_radius(), 1.5)
    assert len(result) == 8
    assert (3, 3) not in result


def test_percent_reaches_orthogonal_but_not_diagonal():
    """A circle at 10 percent reaches orthogonal but not diagonal cells."""
    resolver = NeighborResolver(shape="circle", radius_mode="percent", radius_pct=10)
    assert math.isclose(resolver.effective_radius(), 0.6)
    result = resolver.resolve(row=3, col=3, grid_rows=7, grid_cols=7)
    assert result == [(2, 3), (3, 2), (3, 4), (4, 3)]


def test_percent_zero_coincides_with_cell():
    """A zero-percent radius makes the figure coincide with the cell."""
    square = NeighborResolver(shape="rectangle", radius_mode="percent", radius_pct=0)
    circle = NeighborResolver(shape="circle", radius_mode="percent", radius_pct=0)
    assert math.isclose(square.effective_radius(), math.sqrt(2) / 2)
    assert math.isclose(circle.effective_radius(), 0.5)
    for resolver in (square, circle):
        assert resolver.resolve(row=3, col=3, grid_rows=8, grid_cols=8) == []


def test_percent_grows_linearly_to_max():
    """The percent radius spans the full range up to the maximum."""
    resolver = NeighborResolver(shape="circle", radius_mode="percent", radius_pct=100)
    assert math.isclose(resolver.effective_radius(), 1.5)


def test_partial_circle_includes_diagonal_at_mid_range():
    """A larger circle also reaches the diagonal neighbours."""
    resolver = NeighborResolver(shape="circle", radius_mode="percent", radius_pct=50)
    result = resolver.resolve(row=3, col=3, grid_rows=7, grid_cols=7)
    assert (2, 2) in result
    assert (2, 3) in result
    assert len(result) == 8


def test_neighbours_are_clipped_at_grid_edges():
    """Cells outside the grid are never returned."""
    resolver = NeighborResolver(shape="rectangle", radius_mode="max", radius_pct=100)
    result = resolver.resolve(row=0, col=0, grid_rows=5, grid_cols=5)
    assert result == [(0, 1), (1, 0), (1, 1)]


def test_results_are_sorted_and_exclude_self():
    """The resolver returns a sorted, deduplicated list without the origin."""
    resolver = NeighborResolver(shape="circle", radius_mode="max", radius_pct=100)
    result = resolver.resolve(row=2, col=2, grid_rows=6, grid_cols=6)
    assert (2, 2) not in result
    assert result == sorted(set(result))


def test_shape_params_describe_the_figure():
    """The client receives the figure kind, radius and centre."""
    resolver = NeighborResolver(shape="circle", radius_mode="max", radius_pct=100)
    params = resolver.shape_params(row=4, col=7)
    assert params["kind"] == "circle"
    assert math.isclose(params["radius_cells"], 1.5)
    assert params["center_row"] == 4
    assert params["center_col"] == 7
