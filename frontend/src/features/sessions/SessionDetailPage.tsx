import { useState } from "react";
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
  LinearProgress,
  Link,
  Typography,
} from "@mui/material";
import {
  deleteSession,
  fetchSessionState,
  finishSession,
  removePlayer,
  startSession,
} from "../../api/sessions";
import { unlockCell } from "../../api/cells";
import type { CellDTO } from "../../api/types";
import { extractApiMessage } from "../../shared/apiError";
import { debug } from "../../shared/debug";
import { useAuthStore } from "../../store/auth";
import SessionCanvas from "../canvas/SessionCanvas";

const log = debug("session");

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
  const finishedModal = finished && !finishedDismissed && revealed.size === 0;
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
          <SessionCanvas
            session={session}
            cells={cells}
            myUserId={myUserId}
            onSelect={handleSelect}
            revealed={revealed}
            isAdminMode={adminMode && isAdmin}
          />
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