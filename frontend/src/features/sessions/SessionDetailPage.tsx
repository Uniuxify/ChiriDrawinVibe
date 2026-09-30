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
  fetchSessionState,
  finishSession,
  startSession,
} from "../../api/sessions";
import { unlockCell } from "../../api/cells";
import type { CellDTO } from "../../api/types";
import { extractApiMessage } from "../../shared/apiError";
import { useAuthStore } from "../../store/auth";
import SessionCanvas from "../canvas/SessionCanvas";

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
  const [finishedDismissed, setFinishedDismissed] = useState(false);
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

  function openEditor(cellId: string) {
    navigate(`/sessions/${sessionId}/cells/${cellId}`);
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
    if (!isMine) return;

    if (
      cell.status === "unlocked" &&
      cell.locked_by_user_id === myUserId
    ) {
      openEditor(cell.id);
      return;
    }

    if (cell.status === "empty") {
      if (!canUnlock) {
        setError("You cannot unlock a cell right now.");
        return;
      }
      setPendingCell(cell);
      setConfirmOpen(true);
    }
  }

  async function confirmUnlock() {
    if (pendingCell == null) return;
    await unlockMut.mutateAsync(pendingCell.id);
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
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
      <Box sx={{ display: "flex", gap: 3, alignItems: "center", mb: 2 }}>
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
        {session.status === "draft" && isAdmin && (
          <Button
            variant="contained"
            onClick={() => startMut.mutate()}
            disabled={startMut.isPending}
          >
            Start session
          </Button>
        )}
        {session.status === "active" && isAdmin && (
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

      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        <SessionCanvas
          session={session}
          cells={cells}
          myUserId={myUserId}
          onSelect={handleSelect}
          revealed={revealed}
          isAdminMode={adminMode && isAdmin}
        />
        <Box sx={{ minWidth: 240 }}>
          <Typography variant="subtitle1">Session info</Typography>
          <Typography variant="body2" color="text.secondary">
            Grid: {session.grid_cols}×{session.grid_rows}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Players: {joinedCount} / {session.players_count} joined
          </Typography>
          {joinedCount > 0 && (
            <Typography variant="body2" color="text.secondary">
              {joinedPlayers.map((player) => player.username).join(", ")}
            </Typography>
          )}
          {session.status === "draft" && joinedCount < session.players_count && (
            <Typography variant="body2" color="warning.main">
              Not enough players joined to start the session.
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