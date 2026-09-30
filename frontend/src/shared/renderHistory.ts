/** Shared conversion of normalized drawing history into Konva strokes. */

import type { DrawOperation } from "../api/types";

/** A single stroke prepared for rendering in cell pixel coordinates. */
export interface RenderedStroke {
  points: number[];
  color: string;
  size: number;
  erase: boolean;
}

/**
 * Convert drawing history into strokes positioned in cell pixel space.
 *
 * Args:
 *   operations: Normalized drawing history of a cell.
 *   cellWidth: Cell width in pixels.
 *   cellHeight: Cell height in pixels.
 *
 * Returns:
 *   The strokes in draw order, with `clear` operations already applied.
 */
export function strokesFromHistory(
  operations: DrawOperation[],
  cellWidth: number,
  cellHeight: number,
): RenderedStroke[] {
  const result: RenderedStroke[] = [];
  for (const operation of operations) {
    if (operation.type === "clear") {
      result.length = 0;
      continue;
    }
    if (operation.type !== "stroke" && operation.type !== "erase") {
      continue;
    }
    const points = (operation.points ?? []).flatMap(([x, y]) => [
      x * cellWidth,
      y * cellHeight,
    ]);
    result.push({
      points,
      color: operation.color ?? "#000000",
      size: (operation.size ?? 0.01) * cellWidth,
      erase: operation.type === "erase",
    });
  }
  return result;
}