import { useEffect, useRef, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import { fetchSessionState, fetchSessionTimelapse } from "../../api/sessions";
import type { CellDTO } from "../../api/types";
import { extractApiMessage } from "../../shared/apiError";
import SessionCanvas from "../canvas/SessionCanvas";
import TimelapsePlayer from "./TimelapsePlayer";

/** Delay (ms) between consecutive cells of the Open All cascade. */
const CASCADE_STEP_MS = 60;

/**
 * Anonymous viewer of a single public finished session: the grid starts
 * closed and opens cell by cell on click, or all at once via the cascade.
 */
export default function PublicSessionPage() {
  const { id } = useParams();
  const sessionId = Number(id);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [timelapseOpen, setTimelapseOpen] = useState(false);
  const cascadeTimersRef = useRef<number[]>([]);

  const stateQuery = useQuery({
    queryKey: ["session-state", sessionId],
    queryFn: () => fetchSessionState(sessionId),
    refetchInterval: 5000,
    retry: false,
    enabled: sessionId > 0,
  });

  const timelapseQuery = useQuery({
    queryKey: ["session-timelapse", sessionId],
    queryFn: () => fetchSessionTimelapse(sessionId),
    enabled: timelapseOpen && sessionId > 0,
    staleTime: Infinity,
  });

  // Drop any running cascade when the page unmounts.
  useEffect(
    () => () => {
      for (const timer of cascadeTimersRef.current) window.clearTimeout(timer);
      cascadeTimersRef.current = [];
    },
    [],
  );

  if (!sessionId) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">Unknown session.</Alert>
      </Box>
    );
  }

  if (stateQuery.isLoading) {
    return (
      <CircularProgress sx={{ display: "block", mx: "auto", mt: 8 }} />
    );
  }

  if (stateQuery.isError) {
    return (
      <Box sx={{ p: 4, maxWidth: 640, mx: "auto" }}>
        <Alert severity="error">{extractApiMessage(stateQuery.error)}</Alert>
        <Button component={RouterLink} to="/public" sx={{ mt: 2 }}>
          Back to the gallery
        </Button>
      </Box>
    );
  }

  const state = stateQuery.data;
  if (!state) {
    // isLoading/isError are handled above; this only satisfies the type
    // checker while the first payload is still being prepared.
    return null;
  }
  const session = state.session;
  const cells = state.cells;

  function clearCascadeTimers() {
    for (const timer of cascadeTimersRef.current) window.clearTimeout(timer);
    cascadeTimersRef.current = [];
  }

  /** Reveal a single cell on click. */
  function handleSelect(cell: CellDTO) {
    setRevealed((previous) => {
      if (previous.has(cell.id)) return previous;
      const next = new Set(previous);
      next.add(cell.id);
      return next;
    });
  }

  /** Reveal every remaining cell one by one, top-left to bottom-right. */
  function openAll() {
    clearCascadeTimers();
    const remaining = cells
      .filter((cell) => !revealed.has(cell.id))
      .sort((a, b) => a.row - b.row || a.col - b.col);
    remaining.forEach((cell, index) => {
      const timer = window.setTimeout(() => {
        setRevealed((previous) => {
          const next = new Set(previous);
          next.add(cell.id);
          return next;
        });
      }, index * CASCADE_STEP_MS);
      cascadeTimersRef.current.push(timer);
    });
  }

  /** Close every cell again. */
  function hideAll() {
    clearCascadeTimers();
    setRevealed(new Set());
  }

  const allRevealed = revealed.size >= cells.length;

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          px: 3,
          py: 1.5,
        }}
      >
        <Typography variant="h6" sx={{ flex: 1, minWidth: 0 }}>
          {session.name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {session.grid_cols}×{session.grid_rows}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          onClick={allRevealed ? hideAll : openAll}
          disabled={cells.length === 0}
        >
          {allRevealed ? "Hide" : "Open all"}
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={() => setTimelapseOpen(true)}
        >
          Timelapse
        </Button>
        <Button component={RouterLink} to="/public" size="small">
          Gallery
        </Button>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <SessionCanvas
          session={session}
          cells={cells}
          myUserId={null}
          onSelect={handleSelect}
          revealed={revealed}
        />
      </Box>

      {/* Timelapse replay of the finished picture */}
      <Dialog
        open={timelapseOpen}
        onClose={() => setTimelapseOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Timelapse</DialogTitle>
        <DialogContent sx={{ height: 480 }}>
          {timelapseQuery.isLoading && (
            <Typography sx={{ p: 2 }}>Loading timelapse…</Typography>
          )}
          {timelapseQuery.isError && (
            <Alert severity="error">
              {extractApiMessage(timelapseQuery.error)}
            </Alert>
          )}
          {timelapseQuery.data && (
            <TimelapsePlayer data={timelapseQuery.data} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTimelapseOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
