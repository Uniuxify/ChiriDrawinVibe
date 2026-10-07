import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  LinearProgress,
  Link,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import {
  deleteSession,
  fetchSessionState,
  finishSession,
  markSessionViewed,
  removePlayer,
  setSessionRevealed,
  startSession,
} from "../../api/sessions";
import { unlockCell } from "../../api/cells";
import type { CellDTO } from "../../api/types";
import { extractApiMessage } from "../../shared/apiError";
import { debug } from "../../shared/debug";
import { useAuthStore } from "../../store/auth";
import SessionCanvas from "../canvas/SessionCanvas";

const log = debug("session");

/** Algorithms driving the Open All reveal cascade. */
type RevealAlgorithm = "ordered" | "line" | "diagonal" | "spiral" | "random";

const REVEAL_ALGORITHMS: { value: RevealAlgorithm; label: string }[] = [
  { value: "ordered", label: "Ordered" },
  { value: "line", label: "Line" },
  { value: "diagonal", label: "Diagonal" },
  { value: "spiral", label: "Spiral" },
  { value: "random", label: "Random" },
];

/** Browser-local key holding the last chosen reveal algorithm. */
const REVEAL_ALGO_STORAGE_KEY = "chiridrawin:reveal-algorithm";

/**
 * Read the algorithm remembered by the browser.
 *
 * Defaults to "diagonal" until the user makes their first choice.
 */
function loadStoredAlgorithm(): RevealAlgorithm {
  try {
    const stored = window.localStorage.getItem(REVEAL_ALGO_STORAGE_KEY);
    if (
      stored === "ordered" ||
      stored === "line" ||
      stored === "diagonal" ||
      stored === "spiral" ||
      stored === "random"
    ) {
      return stored;
    }
  } catch {
    // localStorage may be unavailable (privacy mode, SSR).
  }
  return "diagonal";
}

/** Remember the chosen algorithm in the browser. */
function storeAlgorithm(algorithm: RevealAlgorithm): void {
  try {
    window.localStorage.setItem(REVEAL_ALGO_STORAGE_KEY, algorithm);
  } catch {
    // Ignore storage failures; the choice simply stays in-memory.
  }
}

/** Return a shuffled copy of the array (Fisher-Yates). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Active session screen: grid, indicators, admin controls, editor entry. */
export default function SessionDetailPage() {
  const { id } = useParams();
  const sessionId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const myUserId = useAuthStore((s) => s.userId);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const [adminMode, setAdminMode] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [pendingCell, setPendingCell] = useState<CellDTO | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [finishedDismissed, setFinishedDismissed] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [openAllPhase, setOpenAllPhase] = useState<
    "idle" | "cooling" | "instant" | "ready"
  >("idle");
  const [revealAlgorithm, setRevealAlgorithm] =
    useState<RevealAlgorithm>(loadStoredAlgorithm);
  const [revealReady, setRevealReady] = useState(false);
  const revealTimersRef = useRef<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const stateQuery = useQuery({
    queryKey: ["session-state", sessionId],
    queryFn: () => fetchSessionState(sessionId),
    refetchInterval: 5000,
    enabled: sessionId > 0,
  });

  const startMut = useMutation({
    mutationFn: () => startSession(sessionId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["session-state", sessionId] }),
    onError: (e) => setError(extractApiMessage(e)),
  });

  const finishMut = useMutation({
    mutationFn: () => finishSession(sessionId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["session-state", sessionId] }),
    onError: (e) => setError(extractApiMessage(e)),
  });

  const unlockMut = useMutation({
    mutationFn: (cellId: string) => unlockCell(cellId),
    onSuccess: async (result) => {
      setConfirmOpen(false);
      setPendingCell(null);
      await queryClient.invalidateQueries({
        queryKey: ["session-state", sessionId],
      });
      navigate(`/sessions/${sessionId}/cells/${result.cell.id}`);
    },
    onError: (e) => {
      setConfirmOpen(false);
      setError(extractApiMessage(e));
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteSession(sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions", "mine"] });
      navigate("/");
    },
    onError: (e) => {
      setDeleteConfirmOpen(false);
      setError(extractApiMessage(e));
    },
  });

  const removePlayerMut = useMutation({
    mutationFn: (userId: number) => removePlayer(sessionId, userId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["session-state", sessionId] }),
    onError: (e) => setError(extractApiMessage(e)),
  });

  // The finished-result modal must appear only once per player: record the
  // view as soon as it is about to be shown, so the next visit skips it.
  const pendingFinishedModal =
    stateQuery.data != null &&
    stateQuery.data.session.status === "finished" &&
    !stateQuery.data.result_viewed;
  useEffect(() => {
    if (!pendingFinishedModal) return;
    markSessionViewed(sessionId).catch(() => undefined);
  }, [pendingFinishedModal, sessionId]);

  // Hydrate the reveal state from the DB once, before the canvas mounts:
  // when the player left the picture revealed, every cell starts open
  // without the fade animation.
  useLayoutEffect(() => {
    const data = stateQuery.data;
    if (data == null || revealReady) return;
    if (data.session.status === "finished" && data.picture_revealed) {
      setRevealed(new Set(data.cells.map((cell) => cell.id)));
    }
    setRevealReady(true);
  }, [stateQuery.data, revealReady]);

  // Remember that the player has opened the whole picture (idempotent).
  const allRevealedNow =
    stateQuery.data != null &&
    stateQuery.data.session.status === "finished" &&
    stateQuery.data.cells.length > 0 &&
    revealed.size >= stateQuery.data.cells.length;
  useEffect(() => {
    if (!allRevealedNow) return;
    setSessionRevealed(sessionId, true).catch(() => undefined);
  }, [allRevealedNow, sessionId]);

  // Stop any running reveal cascade when the page unmounts.
  useEffect(
    () => () => {
      for (const timer of revealTimersRef.current) window.clearTimeout(timer);
      revealTimersRef.current = [];
    },
    [],
  );

  if (stateQuery.isLoading) {
    return <Typography sx={{ p: 3 }}>Loading session…</Typography>;
  }

  if (stateQuery.isError || stateQuery.data == null) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: ["session-state", sessionId],
                })
              }
            >
              Retry
            </Button>
          }
        >
          Could not load session {sessionId}.{" "}
          {stateQuery.error != null && extractApiMessage(stateQuery.error)}
        </Alert>
        <Button component={RouterLink} to="/" sx={{ mt: 2 }}>
          ← Back to sessions
        </Button>
      </Box>
    );
  }

  const state = stateQuery.data;

  const {
    session,
    cells,
    completed_pct,
    available_unlocks,
    can_unlock: canUnlock,
    next_unlock_at,
    iteration,
  } = state;
  const finished = session.status === "finished";
  const resultViewed = state.result_viewed ?? false;
  const finishedModal =
    finished && !resultViewed && !finishedDismissed && revealed.size === 0;
  const joinedPlayers = session.players ?? [];
  const joinedCount = joinedPlayers.length;
  const isOwner = session.owner === myUserId;

  function openEditor(cellId: string) {
    navigate(`/sessions/${sessionId}/cells/${cellId}`);
  }

  /**
   * Start the session, asking for confirmation first when it is not full yet.
   */
  function handleStart() {
    if (joinedCount < session.players_count) {
      setStartConfirmOpen(true);
      return;
    }
    startMut.mutate();
  }

  function confirmEarlyStart() {
    setStartConfirmOpen(false);
    startMut.mutate();
  }

  /** Drafts are deleted right away; anything else asks for confirmation. */
  function handleDeleteSession() {
    if (session.status === "draft") {
      deleteMut.mutate();
      return;
    }
    setDeleteConfirmOpen(true);
  }

  /** Total cascade time: ~5s for 16 cells, growing logarithmically. */
  function cascadeTotalMs(count: number): number {
    return (5000 * Math.log(Math.max(count, 2))) / Math.log(16);
  }

  function clearRevealTimers() {
    for (const timer of revealTimersRef.current) window.clearTimeout(timer);
    revealTimersRef.current = [];
  }

  /**
   * Group the still-hidden cells for the selected algorithm; all cells
   * inside one group are revealed simultaneously.
   */
  function buildRevealGroups(): string[][] {
    const remaining = cells.filter((cell) => !revealed.has(cell.id));
    if (remaining.length === 0) return [];

    if (revealAlgorithm === "line") {
      // One row at a time, top to bottom; a row opens all at once.
      const rows = new Map<number, CellDTO[]>();
      for (const cell of remaining) {
        rows.set(cell.row, [...(rows.get(cell.row) ?? []), cell]);
      }
      return [...rows.keys()]
        .sort((a, b) => a - b)
        .map((row) =>
          (rows.get(row) ?? [])
            .sort((a, b) => a.col - b.col)
            .map((cell) => cell.id),
        );
    }

    if (revealAlgorithm === "diagonal") {
      // Diagonals starting at the top-left corner, all at once per band.
      const minRow = Math.min(...cells.map((cell) => cell.row));
      const minCol = Math.min(...cells.map((cell) => cell.col));
      const diagonals = new Map<number, CellDTO[]>();
      for (const cell of remaining) {
        const key = cell.row - minRow + (cell.col - minCol);
        diagonals.set(key, [...(diagonals.get(key) ?? []), cell]);
      }
      return [...diagonals.keys()]
        .sort((a, b) => a - b)
        .map((key) => (diagonals.get(key) ?? []).map((cell) => cell.id));
    }

    if (revealAlgorithm === "spiral") {
      // A true grid spiral from the centre outward: right, down, left, up
      // with legs 1, 1, 2, 2, 3, 3… so consecutive cells are neighbours and
      // the path never jumps. Steps outside the grid are skipped; any cell
      // the walk failed to reach is appended at the end as a safety net.
      const minRow = Math.min(...cells.map((cell) => cell.row));
      const maxRow = Math.max(...cells.map((cell) => cell.row));
      const minCol = Math.min(...cells.map((cell) => cell.col));
      const maxCol = Math.max(...cells.map((cell) => cell.col));
      const centreRow = Math.floor((minRow + maxRow) / 2);
      const centreCol = Math.floor((minCol + maxCol) / 2);
      const remainingIds = new Set(remaining.map((cell) => cell.id));
      const idByPosition = new Map(
        cells.map((cell) => [`${cell.row}:${cell.col}`, cell.id]),
      );

      const order: string[] = [];
      const visited = new Set<string>();
      const push = (row: number, col: number) => {
        const key = `${row}:${col}`;
        if (visited.has(key)) return;
        visited.add(key);
        const id = idByPosition.get(key);
        if (id !== undefined && remainingIds.has(id)) order.push(id);
      };

      const directions = [
        [0, 1], // right
        [1, 0], // down
        [0, -1], // left
        [-1, 0], // up
      ];
      const maxMoves = cells.length * 4 + 64;
      let row = centreRow;
      let col = centreCol;
      let legLength = 1;
      let direction = 0;
      let moves = 0;
      push(row, col);
      while (order.length < remaining.length && moves < maxMoves) {
        for (
          let twice = 0;
          twice < 2 && order.length < remaining.length;
          twice += 1
        ) {
          const [dr, dc] = directions[direction % 4];
          for (let step = 0; step < legLength; step += 1) {
            row += dr;
            col += dc;
            moves += 1;
            push(row, col);
          }
          direction += 1;
        }
        legLength += 1;
      }

      if (order.length < remaining.length) {
        const placed = new Set(order);
        for (const cell of remaining) {
          if (!placed.has(cell.id)) order.push(cell.id);
        }
      }
      return order.map((id) => [id]);
    }

    if (revealAlgorithm === "random") {
      // One random cell per step.
      return shuffle(remaining).map((cell) => [cell.id]);
    }

    // Ordered: one cell at a time, row by row.
    return [...remaining]
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .map((cell) => [cell.id]);
  }

  /**
   * Reveal the remaining cells with the selected algorithm: the first group
   * opens right away, the rest are spread evenly across the logarithmic
   * total time; cells of one group open simultaneously.
   */
  function handleOpenAll() {
    const groups = buildRevealGroups();
    if (groups.length === 0) return;
    clearRevealTimers();
    const count = groups.reduce((total, group) => total + group.length, 0);
    const step =
      groups.length > 1 ? cascadeTotalMs(count) / (groups.length - 1) : 0;
    groups.forEach((group, index) => {
      const timer = window.setTimeout(() => {
        setRevealed((prev) => {
          const next = new Set(prev);
          for (const cellId of group) next.add(cellId);
          return next;
        });
      }, step * index);
      revealTimersRef.current.push(timer);
    });
    // The label switches right away; the button stays disabled for half a
    // second before "Open instantly" becomes clickable.
    setOpenAllPhase("instant");
    revealTimersRef.current.push(
      window.setTimeout(() => setOpenAllPhase("ready"), 500),
    );
  }

  /** Reveal every remaining cell at the same time. */
  function handleOpenInstantly() {
    clearRevealTimers();
    setRevealed(new Set(cells.map((cell) => cell.id)));
    setOpenAllPhase("idle");
  }

  /** Hide the picture again; the DB remembers it for the next visit. */
  function handleHidePicture() {
    clearRevealTimers();
    setRevealed(new Set());
    setOpenAllPhase("idle");
    setSessionRevealed(sessionId, false).catch(() => undefined);
  }

  function handleSelect(cell: CellDTO) {
    setError(null);
    if (finished) {
      // Gradual reveal of the final picture, one cell per click.
      setRevealed((prev) => {
        const next = new Set(prev);
        next.add(cell.id);
        return next;
      });
      return;
    }

    const isMine = (cell.owner_id ?? cell.owner) === myUserId;
    log.log("Cell selected", {
      cellId: cell.id,
      row: cell.row,
      col: cell.col,
      status: cell.status,
      owner: cell.owner_id ?? cell.owner,
      locked_by_user_id: cell.locked_by_user_id,
      is_mine: cell.is_mine,
      myUserId,
      finished,
      canUnlock,
    });
    if (!isMine) {
      log.warn("Selected cell is not owned by me; ignoring", {
        cellId: cell.id,
        owner: cell.owner_id ?? cell.owner,
        myUserId,
      });
      return;
    }

    if (
      cell.status === "unlocked" &&
      cell.locked_by_user_id === myUserId
    ) {
      log.log("Opening editor for already-unlocked own cell", cell.id);
      openEditor(cell.id);
      return;
    }

    if (cell.status === "empty") {
      if (!canUnlock) {
        log.warn("Cannot unlock: no unlock available");
        setError("You cannot unlock a cell right now.");
        return;
      }
      log.log("Requesting unlock confirmation", cell.id);
      setPendingCell(cell);
      setConfirmOpen(true);
    }
  }

  async function confirmUnlock() {
    if (pendingCell == null) return;
    await unlockMut.mutateAsync(pendingCell.id);
  }

  return (
    <Box
      sx={{
        p: 2,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          <Button component={RouterLink} to="/" size="small">
            ← Back
          </Button>
          <Typography variant="h5">{session.name}</Typography>
          <Chip label={session.status} size="small" />
          {session.is_public && <Chip label="public" size="small" />}
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          {isOwner && (
            <Button
              variant="outlined"
              color="error"
              onClick={handleDeleteSession}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "Deleting…" : "Delete session"}
            </Button>
          )}
          <Button variant="outlined" onClick={() => setAdminMode((v) => !v)}>
            {adminMode ? "User mode" : "Admin mode"}
          </Button>
        </Box>
      </Box>

      {adminMode && isAdmin && (
        <Typography
          color="error"
          align="center"
          variant="overline"
          sx={{ display: "block", mb: 1 }}
        >
          Administrator Mode
        </Typography>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Indicators */}
      <Box
        sx={{
          display: "flex",
          gap: 3,
          alignItems: "center",
          flexWrap: "wrap",
          mb: 2,
          flexShrink: 0,
        }}
      >
        <Box sx={{ minWidth: 220 }}>
          <Typography variant="body2" color="text.secondary">
            Canvas {completed_pct}% complete
          </Typography>
          <LinearProgress
            variant="determinate"
            value={completed_pct}
            sx={{ mt: 0.5 }}
          />
        </Box>
        <Typography variant="body2">
          Unlocks available: {available_unlocks}
        </Typography>
        {iteration && (
          <Typography variant="body2" color="text.secondary">
            Iteration {iteration.index} · {iteration.quota_used}/
            {iteration.quota}
          </Typography>
        )}
        {next_unlock_at && (
          <Typography variant="body2" color="text.secondary">
            Next unlock: {new Date(next_unlock_at).toLocaleTimeString()}
          </Typography>
        )}
        {session.status === "draft" && isOwner && (
          <Button
            variant="contained"
            onClick={handleStart}
            disabled={startMut.isPending}
          >
            {startMut.isPending ? "Starting…" : "Start session"}
          </Button>
        )}
        {session.status === "active" && isOwner && (
          <Button
            variant="outlined"
            color="error"
            onClick={() => finishMut.mutate()}
            disabled={finishMut.isPending}
          >
            Finish early
          </Button>
        )}
        {/* The algorithm menu always sits in the same spot: before the
            reveal buttons, which swap between Open All and Hide. */}
        {finished && (
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel id="reveal-algo-label">Algorithm</InputLabel>
            <Select
              labelId="reveal-algo-label"
              label="Algorithm"
              value={revealAlgorithm}
              onChange={(event) => {
                const next = event.target.value as RevealAlgorithm;
                setRevealAlgorithm(next);
                storeAlgorithm(next);
              }}
            >
              {REVEAL_ALGORITHMS.map((algorithm) => (
                <MenuItem key={algorithm.value} value={algorithm.value}>
                  {algorithm.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        {finished && !allRevealedNow && (
          <Button
            variant="contained"
            onClick={
              openAllPhase === "instant" || openAllPhase === "ready"
                ? handleOpenInstantly
                : handleOpenAll
            }
            disabled={openAllPhase === "cooling" || openAllPhase === "instant"}
          >
            {openAllPhase === "idle" || openAllPhase === "cooling"
              ? "Open All"
              : "Open instantly"}
          </Button>
        )}
        {finished && allRevealedNow && (
          <Button variant="outlined" onClick={handleHidePicture}>
            Hide picture
          </Button>
        )}
      </Box>

      <Box
        sx={{
          display: "flex",
          gap: 3,
          flex: 1,
          minHeight: 0,
          flexWrap: "nowrap",
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          {revealReady && (
            <SessionCanvas
              session={session}
              cells={cells}
              myUserId={myUserId}
              onSelect={handleSelect}
              revealed={revealed}
              isAdminMode={adminMode && isAdmin}
            />
          )}
        </Box>
        <Box
          sx={{ width: 260, flexShrink: 0, overflowY: "auto", minHeight: 0 }}
        >
          <Typography variant="subtitle1">Session info</Typography>
          <Typography variant="body2" color="text.secondary">
            Grid: {session.grid_cols}×{session.grid_rows}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Players: {joinedCount} joined (max {session.players_count})
          </Typography>
          {joinedCount > 0 && (
            <Box sx={{ mt: 0.5 }}>
              {joinedPlayers.map((player) => (
                <Box
                  key={player.user_id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    {player.username}
                    {!player.is_active && " (removed)"}
                  </Typography>
                  {isOwner && session.status !== "finished" && (
                    <Button
                      size="small"
                      color="error"
                      disabled={removePlayerMut.isPending}
                      onClick={() => removePlayerMut.mutate(player.user_id)}
                    >
                      ✕
                    </Button>
                  )}
                </Box>
              ))}
            </Box>
          )}
          {session.status === "draft" && joinedCount < session.players_count && (
            <Typography variant="body2" color="warning.main">
              Not full yet ({joinedCount} of {session.players_count}) — you can
              start early.
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            Join code: {session.join_code}
          </Typography>
          <Link
            component={RouterLink}
            to="/public"
            variant="body2"
            sx={{ display: "block", mt: 1 }}
          >
            Public gallery
          </Link>
        </Box>
      </Box>

      {/* Confirm unlock dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Unlock this cell?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The cell and its context neighbours will be locked for other
            players. You cannot unlock the next cell until you confirm this
            one.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button
            onClick={confirmUnlock}
            variant="contained"
            disabled={unlockMut.isPending}
          >
            {unlockMut.isPending ? "Unlocking…" : "Unlock"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Early start confirmation */}
      <Dialog
        open={startConfirmOpen}
        onClose={() => setStartConfirmOpen(false)}
      >
        <DialogTitle>Start the session early?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The session is not full yet — {joinedCount} of{" "}
            {session.players_count} players joined. Players who have not joined
            yet will not be able to take part. Are you sure you want to start
            early?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStartConfirmOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={confirmEarlyStart}
            disabled={startMut.isPending}
          >
            {startMut.isPending ? "Starting…" : "Start early"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Session deletion confirmation (never shown for drafts) */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <DialogTitle>Delete this session?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The session and all of its cells will be permanently removed. This
            action is irreversible.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => deleteMut.mutate()}
            disabled={deleteMut.isPending}
          >
            {deleteMut.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Finished modal */}
      <Dialog open={finishedModal} onClose={() => setFinishedDismissed(true)}>
        <DialogTitle>The game is finished!</DialogTitle>
        <DialogContent>
          <DialogContentText>
            All cells are committed. Reveal the picture cell by cell.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => setFinishedDismissed(true)}
          >
            View result
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}