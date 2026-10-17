"""Unit tests for the pure context geometry resolver."""

from __future__ import annotations

import math

from apps.cells.context import NeighborResolver


def make_resolver(**overrides) -> NeighborResolver:
    """Build a resolver over a unit-sized cell.

    Args:
        overrides: Field values replacing the defaults.

    Returns:
        A configured :class:`NeighborResolver`.
    """
    defaults = {
        "shape": "circle",
        "radius_mode": "percent",
        "radius_pct": 0,
        "cell_width": 1.0,
        "cell_height": 1.0,
    }
    defaults.update(overrides)
    return NeighborResolver(**defaults)


def test_min_mode_has_no_neighbour():
    """The minimum radius (the figure matching the cell) fits no neighbour."""
    for shape in ("rectangle", "circle"):
        resolver = make_resolver(shape=shape, radius_mode="min")
        assert resolver.resolve(row=3, col=3, grid_rows=8, grid_cols=8) == []


def test_min_mode_radius_is_half_the_cell():
    """At the minimum the reference radius is half the smaller cell edge."""
    square = make_resolver(shape="rectangle", radius_mode="min")
    circle = make_resolver(shape="circle", radius_mode="min")
    assert math.isclose(square.effective_radius(), 0.5)
    assert math.isclose(circle.effective_radius(), 0.5)


def test_zero_percent_figure_is_the_cell_itself():
    """At 0% the figure is the cell rectangle whatever the shape is."""
    for shape in ("rectangle", "circle"):
        resolver = make_resolver(shape=shape, radius_pct=0)
        kind, half_w, half_h = resolver.figure_geometry()
        assert kind == "rectangle"
        assert math.isclose(half_w, 0.5)
        assert math.isclose(half_h, 0.5)
        assert resolver.resolve(row=3, col=3, grid_rows=8, grid_cols=8) == []


def test_percent_radius_scales_with_the_cell():
    """The radius grows from min/2 at 0% to 1.5x min at 100%."""
    resolver = make_resolver(cell_width=40.0, cell_height=20.0, radius_pct=100)
    # min cell side is 20px, so 100% -> 1.5 * 20 = 30px.
    assert math.isclose(resolver.effective_radius(), 30.0)

    resolver = make_resolver(cell_width=40.0, cell_height=20.0, radius_pct=0)
    assert math.isclose(resolver.effective_radius(), 10.0)


def test_rectangle_square_side_matches_the_spec():
    """The square half-side equals the radius at every percentage."""
    near_zero = make_resolver(shape="rectangle", radius_pct=1)
    # Unit cell: R = 1 * (0.5 + 1/100) = 0.51.
    assert math.isclose(near_zero.figure_geometry()[1], 0.51)

    full = make_resolver(shape="rectangle", radius_pct=100)
    kind, half_w, half_h = full.figure_geometry()
    assert kind == "rectangle"
    # Unit cell: side = 2 * 1.5 = 3 cells at 100%.
    assert math.isclose(half_w, 1.5)
    assert math.isclose(half_h, 1.5)
    assert math.isclose(half_w * 2, 3.0)


def test_circle_radius_matches_the_spec():
    """The circle radius equals the reference radius."""
    resolver = make_resolver(shape="circle", radius_pct=100)
    kind, half_w, half_h = resolver.figure_geometry()
    assert kind == "circle"
    assert math.isclose(half_w, 1.5)
    assert math.isclose(half_h, 1.5)


def test_percent_reaches_orthogonal_but_not_diagonal():
    """A circle at 10 percent reaches orthogonal but not diagonal cells."""
    resolver = make_resolver(shape="circle", radius_pct=10)
    assert math.isclose(resolver.effective_radius(), 0.6)
    result = resolver.resolve(row=3, col=3, grid_rows=7, grid_cols=7)
    assert result == [(2, 3), (3, 2), (3, 4), (4, 3)]


def test_percent_grows_linearly_to_max():
    """The percent radius spans the full range up to the maximum."""
    resolver = make_resolver(shape="circle", radius_pct=100)
    assert math.isclose(resolver.effective_radius(), 1.5)


def test_max_mode_covers_the_full_ring():
    """The maximum radius covers the full 3x3 ring."""
    resolver = make_resolver(shape="rectangle", radius_mode="max")
    result = resolver.resolve(row=3, col=3, grid_rows=8, grid_cols=8)
    assert math.isclose(resolver.effective_radius(), 1.5)
    assert len(result) == 8
    assert (3, 3) not in result


def test_partial_circle_includes_diagonal_at_mid_range():
    """A larger circle also reaches the diagonal neighbours."""
    resolver = make_resolver(shape="circle", radius_pct=50)
    result = resolver.resolve(row=3, col=3, grid_rows=7, grid_cols=7)
    assert (2, 2) in result
    assert (2, 3) in result
    assert len(result) == 8


def test_neighbours_are_clipped_at_grid_edges():
    """Cells outside the grid are never returned."""
    resolver = make_resolver(shape="rectangle", radius_mode="max")
    result = resolver.resolve(row=0, col=0, grid_rows=5, grid_cols=5)
    assert result == [(0, 1), (1, 0), (1, 1)]


def test_results_are_sorted_and_exclude_self():
    """The resolver returns a sorted, deduplicated list without the origin."""
    resolver = make_resolver(shape="circle", radius_mode="max")
    result = resolver.resolve(row=2, col=2, grid_rows=6, grid_cols=6)
    assert (2, 2) not in result
    assert result == sorted(set(result))


def test_shape_params_describe_the_figure():
    """The client receives the figure kind, half-extents and centre."""
    resolver = make_resolver(shape="circle", radius_mode="max")
    params = resolver.shape_params(row=4, col=7)
    assert params["kind"] == "circle"
    assert math.isclose(params["half_width"], 1.5)
    assert math.isclose(params["half_height"], 1.5)
    assert params["center_row"] == 4
    assert params["center_col"] == 7


def test_non_square_cell_uses_the_smaller_edge():
    """A rectangular cell sizes the figure from its shorter edge."""
    resolver = make_resolver(
        shape="rectangle",
        radius_pct=100,
        cell_width=100.0,
        cell_height=40.0,
    )
    # min edge 40px -> radius 60px -> square side 120px.
    kind, half_w, half_h = resolver.figure_geometry()
    assert kind == "rectangle"
    assert math.isclose(half_w, 60.0)
    assert math.isclose(half_h, 60.0)
    assert math.isclose(half_w * 2, 3.0 * 40.0)
