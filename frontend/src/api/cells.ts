/** Cell operations: unlock, lock, autosave, commit, context. */

import { api } from "./client";
import type { DrawOperation } from "./types";

export interface ContextPayload {
  /** Raster or neighbour data for the read-only context zone. */
  neighbors?: Array<{
    row: number;
    col: number;
    image?: string;
    status: string;
    comment?: string | null;
  }>;
}

export async function unlockCell(cellId: string): Promise<void> {
  await api.post(`/cells/${cellId}/unlock`);
}

export async function lockCell(cellId: string): Promise<void> {
  await api.post(`/cells/${cellId}/lock`);
}

export async function autosaveCell(
  cellId: string,
  operations: DrawOperation[],
): Promise<void> {
  await api.post(`/cells/${cellId}/autosave`, { operations });
}

export async function commitCell(
  cellId: string,
  operations: DrawOperation[],
  comment?: string,
): Promise<void> {
  await api.post(`/cells/${cellId}/commit`, { operations, comment });
}

export async function fetchCellContext(cellId: string): Promise<ContextPayload> {
  const { data } = await api.get<ContextPayload>(`/cells/${cellId}/context`);
  return data;
}

export async function adminUnlockCell(cellId: string): Promise<void> {
  await api.post(`/cells/${cellId}/admin/unlock`);
}