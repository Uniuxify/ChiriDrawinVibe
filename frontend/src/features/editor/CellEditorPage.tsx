import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import {
  autosaveCell,
  commitCell,
  fetchCellContext,
  fetchCellHistory,
} from "../../api/cells";
import { fetchSessionState } from "../../api/sessions";
import type { DrawOperation } from "../../api/types";
import { extractApiMessage } from "../../shared/apiError";
import { strokesFromHistory } from "../../shared/renderHistory";
import ColorPalette from "./ColorPalette";
import EditorCanvas from "./EditorCanvas";
import EditorToolbar, { type EditorTool } from "./EditorToolbar";
import type { ContextCellView } from "./ContextOverlay";

const AUTOSAVE_INTERVAL_MS = 10_000;

/**
 * Full-page drawing editor for one unlocked cell: read-only context zone in
 * the middle, tools on the left edge, colours on the right edge.
 */
export default function CellEditorPage() {
  const { id, cellId } = useParams();
  const sessionId = Number(id);
  const navigate = useNavigate();

  const [tool, setTool] = useState<EditorTool>("brush");
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(4);
  const [history, setHistory] = useState<DrawOperation[]>([]);
  const [redoStack, setRedoStack] = useState<DrawOperation[]>([]);
  const [comment, setComment] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [commitOpen, setCommitOpen] = useState(false);
  const [hoveredCellId, setHoveredCellId] = useState<string | null>(null);

  const revisionRef = useRef(0);
  const hydratedRef = useRef(false);

  const stateQuery = useQuery({
    queryKey: ["session-state", sessionId],
    queryFn: () => fetchSessionState(sessionId),
    enabled: sessionId > 0 && Boolean(cellId),
  });

  const contextQuery = useQuery({
    queryKey: ["cell-context", cellId],
    queryFn: () => fetchCellContext(cellId!),
    enabled: Boolean(cellId),
    retry: false,
  });

  const ownHistoryQuery = useQuery({
    queryKey: ["cell-history", cellId],
    queryFn: () => fetchCellHistory(cellId!),
    enabled: Boolean(cellId),
    retry: false,
  });

  const session = stateQuery.data?.session;
  const cell = useMemo(
    () => stateQuery.data?.cells.find((item) => item.id === cellId) ?? null,
    [stateQuery.data, cellId],
  );

  const cellWidth = session ? session.canvas_width / session.grid_cols : 1;
  const cellHeight = session ? session.canvas_height / session.grid_rows : 1;

  // Restore the latest drawing once the stored history arrives.
  useEffect(() => {
    if (hydratedRef.current || ownHistoryQuery.data == null) return;
    hydratedRef.current = true;
    setHistory(ownHistoryQuery.data.operations);
    revisionRef.current = ownHistoryQuery.data.revision;
  }, [ownHistoryQuery.data]);

  const neighbors = contextQuery.data?.neighbors ?? [];
  const filledNeighborIds = useMemo(
    () =>
      neighbors
        .filter((neighbor) => neighbor.status === "filled")
        .map((neighbor) => neighbor.cell_id),
    [neighbors],
  );

  const neighborHistoryQueries = useQueries({
    queries: filledNeighborIds.map((neighborId) => ({
      queryKey: ["cell-history", neighborId],
      queryFn: () => fetchCellHistory(neighborId),
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
    })),
  });

  const contextCells = useMemo<ContextCellView[]>(
    () =>
      neighbors.map((neighbor) => {
        const index = filledNeighborIds.indexOf(neighbor.cell_id);
        const operations =
          index >= 0 ? neighborHistoryQueries[index]?.data?.operations : null;
        return {
          cellId: neighbor.cell_id,
          row: neighbor.row,
          col: neighbor.col,
          status: neighbor.status,
          comment: neighbor.comment,
          strokes: operations
            ? strokesFromHistory(operations, cellWidth, cellHeight)
            : [],
        };
      }),
    [cellHeight, cellWidth, filledNeighborIds, neighborHistoryQueries, neighbors],
  );

  const bounds = contextQuery.data?.context?.bounds;
  const originRow = bounds?.min_row ?? cell?.row ?? 0;
  const originCol = bounds?.min_col ?? cell?.col ?? 0;
  const contextRows = bounds ? bounds.max_row - bounds.min_row + 1 : 1;
  const contextCols = bounds ? bounds.max_col - bounds.min_col + 1 : 1;

  const hoveredComment = useMemo(() => {
    if (!hoveredCellId) return null;
    return (
      neighbors.find((neighbor) => neighbor.cell_id === hoveredCellId)
        ?.comment ?? null
    );
  }, [hoveredCellId, neighbors]);

  const save = useCallback(async () => {
    if (!cellId || history.length === 0) return;
    setSaveState("saving");
    try {
      const result = await autosaveCell(cellId, history, revisionRef.current);
      revisionRef.current = result.revision;
      setSaveState("saved");
    } catch (err) {
      setSaveState("idle");
      setError(extractApiMessage(err, "Could not save the drawing."));
    }
  }, [cellId, history]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void save();
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [save]);

  const undo = useCallback(() => {
    setHistory((current) => {
      if (current.length === 0) return current;
      setRedoStack((stack) => [...stack, current[current.length - 1]]);
      return current.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const last = stack[stack.length - 1];
      setHistory((current) => [...current, last]);
      return stack.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        undo();
      } else if (key === "y") {
        event.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  const commitMutation = useMutation({
    mutationFn: () =>
      commitCell(cellId!, history, revisionRef.current, comment.trim()),
    onSuccess: () => navigate(`/sessions/${sessionId}`),
    onError: (err) => {
      setCommitOpen(false);
      setError(extractApiMessage(err, "Could not commit the cell."));
    },
  });

  if (stateQuery.isLoading || ownHistoryQuery.isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (stateQuery.isError || session == null || cell == null) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          This cell is not available.
          {stateQuery.error != null &&
            ` ${extractApiMessage(stateQuery.error)}`}
        </Alert>
        <Button
          sx={{ mt: 2 }}
          onClick={() => navigate(`/sessions/${sessionId}`)}
        >
          Back to session
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          px: 2,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Button size="small" onClick={() => navigate(`/sessions/${sessionId}`)}>
          ← Back
        </Button>
        <Typography variant="h6" noWrap>
          {session.name}
        </Typography>
        <Chip size="small" label={`cell ${cell.col}, ${cell.row}`} />
        <Box sx={{ flex: 1 }} />
        <Typography variant="body2" color="text.secondary">
          Operations: {history.length} · Revision: {revisionRef.current}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {saveState === "saving"
            ? "Saving…"
            : saveState === "saved"
              ? "Saved"
              : `Autosaves every ${AUTOSAVE_INTERVAL_MS / 1000}s`}
        </Typography>
        <Button
          variant="contained"
          onClick={() => setCommitOpen(true)}
          disabled={commitMutation.isPending}
        >
          Confirm
        </Button>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ m: 1 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
        <EditorToolbar
          tool={tool}
          onToolChange={setTool}
          size={size}
          onSizeChange={setSize}
          canUndo={history.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={undo}
          onRedo={redo}
          onClear={() => {
            setHistory([]);
            setRedoStack([]);
          }}
        />
        <EditorCanvas
          cellWidth={cellWidth}
          cellHeight={cellHeight}
          cellRow={cell.row}
          cellCol={cell.col}
          contextCells={contextCells}
          originRow={originRow}
          originCol={originCol}
          contextRows={contextRows}
          contextCols={contextCols}
          history={history}
          tool={tool}
          color={color}
          size={size}
          onStrokeComplete={(operation) => {
            setHistory((current) => [...current, operation]);
            setRedoStack([]);
            setSaveState("idle");
          }}
          onHoverContext={setHoveredCellId}
        />
        <Box
          sx={{
            width: 260,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            borderLeft: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <ColorPalette color={color} onColorChange={setColor} />
          <Box
            sx={{
              px: 2,
              pb: 2,
              flex: 1,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <TextField
              label="Comment (optional)"
              multiline
              minRows={3}
              fullWidth
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              helperText="Shown to players who unlock a neighbouring cell."
            />
            {hoveredComment && (
              <Alert severity="info" sx={{ mt: 2 }}>
                Neighbour comment: {hoveredComment}
              </Alert>
            )}
            <Box sx={{ flex: 1 }} />
            <Typography variant="caption" color="text.secondary">
              The dashed area is the read-only context zone. Only the bordered
              cell can be drawn.
            </Typography>
          </Box>
        </Box>
      </Box>

      <Dialog open={commitOpen} onClose={() => setCommitOpen(false)}>
        <DialogTitle>Commit this cell?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This action is irreversible. The cell becomes read-only after the
            confirmation.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCommitOpen(false)}>Back</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => commitMutation.mutate()}
            disabled={commitMutation.isPending}
          >
            Commit
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}