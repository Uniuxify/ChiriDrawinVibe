/** Shared API DTOs mirroring the backend /api/v1 payloads. */

export interface TokenPair {
  access: string;
  refresh: string;
}

export interface UserDTO {
  id: number;
  username: string;
  is_admin: boolean;
  created_at: string;
}

export interface AuthResponse {
  user: UserDTO;
  tokens: TokenPair;
}

export type SessionStatus = "draft" | "active" | "finished" | "deleted";
export type ContextShape = "rectangle" | "circle";
export type ContextRadiusMode = "min" | "max" | "percent";
export type DistributionStrategy = "random" | "min_adjacent";

export interface SessionDTO {
  id: number;
  name: string;
  status: SessionStatus;
  owner: number;
  join_code: string;
  canvas_width: number;
  canvas_height: number;
  grid_cols: number;
  grid_rows: number;
  players_count: number;
  interval_seconds: number;
  unlock_quota: number;
  context_shape: ContextShape;
  context_radius_mode: ContextRadiusMode;
  context_radius_pct: number;
  distribution_strategy: DistributionStrategy;
  is_public: boolean;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export type CellStatus = "empty" | "unlocked" | "filled" | "orphan";

export interface CellDTO {
  id: string;
  row: number;
  col: number;
  owner: number | null;
  status: CellStatus;
  locked_by_user_id: number | null;
  comment: string | null;
}

export interface IterationDTO {
  id: number;
  index: number;
  state: string;
  started_at: string;
  finished_at: string | null;
  quota: number;
  quota_used: number;
}

export interface SessionStateDTO {
  session: SessionDTO;
  cells: CellDTO[];
  iteration: IterationDTO | null;
  can_unlock: boolean;
  available_unlocks: number;
  completed_pct: number;
  next_unlock_at: string | null;
}

export interface PublicConfig {
  polling_interval_seconds: number;
  autosave_interval_seconds: number;
  min_canvas_size: number;
  max_canvas_size: number;
  min_grid: number;
  max_grid: number;
  max_ops_per_cell: number;
  max_history_json_bytes: number;
}

/** A single drawing operation in a cell's history. */
export interface DrawOperation {
  type: "stroke" | "erase" | "clear";
  ts: number;
  color?: string;
  size?: number;
  points?: number[][];
}