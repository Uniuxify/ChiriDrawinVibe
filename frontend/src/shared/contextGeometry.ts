/**
 * Context figure geometry for the session creation form.
 *
 * Mirrors the server-side rules in `backend/apps/cells/context.py`
 * (`NeighborResolver`) so the preview, the neighbour-count line and the
 * slider magnet all agree with what the backend will actually compute.
 *
 * Geometry uses real cell pixels: for a cell `w x h` the reference radius is
 * `R = min(w, h) * (0.5 + pct / 100)`.
 */

/** Context figure shapes supported today. */
export type ContextShapeKind = "rectangle" | "circle";

/** Cell shapes supported today; future grid types extend this union. */
export type CellShapeKind = "rectangle";

/** Real geometry of one grid cell, in pixels. */
export interface CellGeometry {
  width: number;
  height: number;
  shape: CellShapeKind;
}

/** Figure to draw, centred on the cell, in pixels. */
export interface FigureGeometry {
  kind: ContextShapeKind;
  halfWidth: number;
  halfHeight: number;
}

/** A slider position where the neighbour count is about to grow. */
export interface ContextThreshold {
  /** Exact percentage at which the count jumps. */
  pct: number;
  /** Slider value that keeps the previous, smaller count. */
  snapped: number;
  /** Neighbour count while the slider sits on `snapped`. */
  countBefore: number;
}

/** A constant-count range of the slider, as an integer interval. */
export interface CountSegment {
  /** First percentage of the range (inclusive). */
  from: number;
  /** First percentage after the range (exclusive, 100 for the last). */
  to: number;
  /** Neighbouring cells inside the context for this range. */
  count: number;
}

/** Slider step; thresholds are floored onto this grid. */
export const SLIDER_STEP = 1;
/** Live magnet half-width, in slider units. */
export const SNAP_TOLERANCE = 2;

const EPS = 1e-9;
/** Candidate neighbour offsets; reachable cells never exceed one ring today. */
const MAX_OFFSET = 2;

/** Reference radius of the context figure, in pixels. */
export function figureRadius(cell: CellGeometry, pct: number): number {
  return Math.min(cell.width, cell.height) * (0.5 + pct / 100);
}

/**
 * Figure to draw for a percentage.
 *
 * At `0%` the figure is the cell itself, whatever the configured shape is.
 */
export function figureGeometry(
  shape: ContextShapeKind,
  cell: CellGeometry,
  pct: number,
): FigureGeometry {
  if (pct <= 0) {
    return {
      kind: "rectangle",
      halfWidth: cell.width / 2,
      halfHeight: cell.height / 2,
    };
  }
  const radius = figureRadius(cell, pct);
  return { kind: shape, halfWidth: radius, halfHeight: radius };
}

/** Distance from the figure centre to the closest point of a neighbour. */
function neighborDistance(
  cell: CellGeometry,
  dr: number,
  dc: number,
): { dx: number; dy: number } {
  return {
    dx: Math.max(0, (Math.abs(dc) - 0.5) * cell.width),
    dy: Math.max(0, (Math.abs(dr) - 0.5) * cell.height),
  };
}

/** Count the neighbouring cells covered by the figure at a percentage. */
export function neighborCount(
  shape: ContextShapeKind,
  cell: CellGeometry,
  pct: number,
): number {
  const figure = figureGeometry(shape, cell, pct);
  let count = 0;
  for (let dr = -MAX_OFFSET; dr <= MAX_OFFSET; dr += 1) {
    for (let dc = -MAX_OFFSET; dc <= MAX_OFFSET; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const { dx, dy } = neighborDistance(cell, dr, dc);
      if (figure.kind === "rectangle") {
        if (dx < figure.halfWidth - EPS && dy < figure.halfHeight - EPS) {
          count += 1;
        }
      } else if (Math.hypot(dx, dy) < figure.halfWidth - EPS) {
        count += 1;
      }
    }
  }
  return count;
}

/**
 * Percentages where the neighbour count grows.
 *
 * A neighbour joins as soon as `R` exceeds its distance, so the threshold
 * itself still shows the previous count (the backend test is strict). Each
 * threshold is floored onto the slider step so the snapped value keeps that
 * previous count.
 */
export function contextThresholds(
  shape: ContextShapeKind,
  cell: CellGeometry,
): ContextThreshold[] {
  const minSide = Math.min(cell.width, cell.height);
  if (!(minSide > 0)) return [];

  const exact = new Set<number>();
  for (let dr = -MAX_OFFSET; dr <= MAX_OFFSET; dr += 1) {
    for (let dc = -MAX_OFFSET; dc <= MAX_OFFSET; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const { dx, dy } = neighborDistance(cell, dr, dc);
      const distance =
        shape === "rectangle" ? Math.max(dx, dy) : Math.hypot(dx, dy);
      // Invert R = min(w, h) * (0.5 + pct / 100).
      const pct = (distance / minSide - 0.5) * 100;
      // Ignore unreachable thresholds at or beyond the 100% radius.
      if (pct >= -EPS && pct < 100 - EPS) exact.add(pct);
    }
  }

  const bySnapped = new Map<number, number>();
  for (const pct of exact) {
    const snapped = Math.floor(pct / SLIDER_STEP) * SLIDER_STEP;
    const known = bySnapped.get(snapped);
    if (known === undefined || pct < known) bySnapped.set(snapped, pct);
  }

  return [...bySnapped.entries()]
    .map(([snapped, pct]) => ({
      pct,
      snapped,
      countBefore: neighborCount(shape, cell, snapped),
    }))
    .sort((a, b) => a.snapped - b.snapped);
}

/** Group every integer percentage into constant-count ranges. */
export function countSegments(
  shape: ContextShapeKind,
  cell: CellGeometry,
): CountSegment[] {
  const counts: number[] = [];
  for (let pct = 0; pct <= 100; pct += 1) {
    counts.push(neighborCount(shape, cell, pct));
  }

  const segments: CountSegment[] = [];
  let start = 0;
  for (let pct = 1; pct <= 100; pct += 1) {
    if (counts[pct] !== counts[start]) {
      segments.push({ from: start, to: pct, count: counts[start] });
      start = pct;
    }
  }
  segments.push({ from: start, to: 100, count: counts[start] });
  return segments;
}

/**
 * Pull a value onto the nearest threshold inside the magnet band.
 *
 * Values outside every band are returned unchanged, so the slider can always
 * be pulled past a threshold with a small overshoot.
 */
export function snapToThresholds(
  pct: number,
  thresholds: ContextThreshold[],
  tolerance: number = SNAP_TOLERANCE,
): number {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (const threshold of thresholds) {
    const distance = Math.abs(pct - threshold.snapped);
    if (distance <= tolerance && distance < bestDistance) {
      best = threshold.snapped;
      bestDistance = distance;
    }
  }
  return best ?? pct;
}