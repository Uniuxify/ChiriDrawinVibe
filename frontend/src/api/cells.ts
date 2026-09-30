/** Cell operations: unlock, lock, autosave, commit and context. */

import { api } from "./client";
import type { DrawOperation } from "./types";

export interface UnlockedCell {
  id: string;
  row: number;
  col: number;
  status: string;
  owner_id: number | null;
  revision: number;
  comment: string | null;
}

export interface UnlockResult {
  cell: UnlockedCell;
  context: Record<string, unknown> | null;
}

export interface AutosaveResult {
  revision: number;
  size_bytes: number;
}

/** Inclusive grid bounds of the read-only context zone. */
export interface ContextBounds {
  min_row: number;
  max_row: number;
  min_col: number;
  max_col: number;
}

/** One cell of the read-only context zone around the unlocked cell. */
export interface ContextNeighbor {
  cell_id: string;
  row: number;
  col: number;
  status: string;
  comment: string | null;
  /** Server-side raster metadata, when the neighbour has been rendered. */
  raster: { url: string; width: number; height: number } | null;
}

export interface ContextPayload {
  context: {
    cell_id: string;
    neighbor_ids: string[];
    bounds: ContextBounds;
  } | null;
  /** Every neighbour of the zone, filled or not. */
  neighbors: ContextNeighbor[];
}

/** Unlock a cell owned by the caller and return its frozen context. */
export async function unlockCell(cellId: string): Promise<UnlockResult> {
  const { data } = await api.post<UnlockResult>(`/cells/${cellId}/unlock`);
  return data;
}

/** Release an unlocked cell without committing it. */
export async function lockCell(cellId: string): Promise<void> {
  await api.post(`/cells/${cellId}/lock`);
}

/** Persist an intermediate history revision. */
export async function autosaveCell(
  cellId: string,
  operations: DrawOperation[],
  revision: number,
): Promise<AutosaveResult> {
  const { data } = await api.post<AutosaveResult>(
    `/cells/${cellId}/autosave`,
    { operations, revision },
  );
  return data;
}

/** Commit the final history of a cell. */
export async function commitCell(
  cellId: string,
  operations: DrawOperation[],
  revision: number,
  comment?: string,
): Promise<void> {
  await api.post(`/cells/${cellId}/commit`, {
    operations,
    revision,
    comment: comment ?? "",
  });
}

export async function fetchCellContext(
  cellId: string,
): Promise<ContextPayload> {
  const { data } = await api.get<ContextPayload>(`/cells/${cellId}/context`);
  return data;
}

/** Administrator override that releases a cell lock back to its owner. */
export async function adminUnlockCell(cellId: string): Promise<void> {
  await api.post(`/cells/${cellId}/admin/unlock`);
}

/** History payload returned for read-only cell rendering. */
export interface CellHistoryPayload {
  operations: DrawOperation[];
  revision: number;
  is_final: boolean;
}

/**
 * Fetch the stored drawing history of a cell.
 *
 * Args:
 *   cellId: Cell UUID as a string.
 *
 * Returns:
 *   The final (or latest) history of the cell.
 */
export async function fetchCellHistory(
  cellId: string,
): Promise<CellHistoryPayload> {
  const { data } = await api.get<CellHistoryPayload>(`/cells/${cellId}/history`);
  return data;
}
