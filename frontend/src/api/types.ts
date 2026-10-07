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

/** Admin-facing user row with session statistics. */
export interface UserAdminDTO {
  id: number;
  username: string;
  is_admin: boolean;
  created_at: string;
  owned_sessions_count: number;
  player_sessions_count: number;
}

export type SessionStatus = "draft" | "active" | "finished" | "deleted";
export type ContextShape = "rectangle" | "circle";
export type ContextRadiusMode = "min" | "max" | "percent";
export type DistributionStrategy = "random" | "min_adjacent";

/** A participant of a session as returned by the sessions API. */
export interface SessionPlayerDTO {
  user_id: number;
  username: string;
  joined_at: string;
  is_active: boolean;
  is_original: boolean;
}

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
  /** Participants that have joined the session so far. */
  players?: SessionPlayerDTO[];
}

export type CellStatus = "empty" | "unlocked" | "filled" | "orphan";

export interface CellDTO {
  id: string;
  row: number;
  col: number;
  /** Owner user id, or null for an unassigned cell. */
  owner: number | null;
  /** Mirrors ``owner``; provided by the backend state endpoint. */
  owner_id: number | null;
  /** Whether the requesting user owns this cell. */
  is_mine: boolean;
  status: CellStatus;
  locked_by_user_id: number | null;
  comment: string | null;
  /** Current history revision, needed for autosave/commit requests. */
  revision?: number;
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
  /** Whether the caller has already seen the finished result modal. */
  result_viewed?: boolean;
  /** Whether the whole picture should be shown without the reveal flow. */
  picture_revealed?: boolean;
  version?: number;
  status?: SessionStatus;
  progress?: { filled: number; total: number; percent: number };
}

/** Session lists grouped by lifecycle status. */
export interface MySessionsResponse {
  drafts: SessionDTO[];
  active: SessionDTO[];
  finished: SessionDTO[];
}

/** Flat public configuration consumed by the UI. */
export interface PublicConfig {
  polling_interval_seconds: number;
  autosave_interval_seconds: number;
  min_canvas_size: number;
  max_canvas_size: number;
  min_grid: number;
  max_grid: number;
  max_ops_per_cell: number;
  max_history_json_bytes: number;
  /** Upper bound on players per session. */
  max_players: number;
  /** Minimum visible share (%) of a neighbour cell while drawing. */
  editor_min_context_visible_pct: number;
}

/** Raw `GET /config` payload; limits are grouped under `limits`. */
export interface PublicConfigResponse {
  polling_interval_seconds: number;
  autosave_interval_seconds: number;
  editor_min_context_visible_pct?: number;
  limits: {
    min_canvas_size: number;
    max_canvas_size: number;
    min_grid: number;
    max_grid: number;
    max_ops_per_cell: number;
    max_history_json_bytes: number;
    max_players?: number;
  };
}

/** A single drawing operation in a cell's history. */
export interface DrawOperation {
  type: "stroke" | "erase" | "clear";
  ts: number;
  color?: string;
  size?: number;
  points?: number[][];
}