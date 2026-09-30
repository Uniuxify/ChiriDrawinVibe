import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Layer, Line, Rect, Stage } from "react-konva";
import type Konva from "konva";
import type { CellDTO, DrawOperation, SessionDTO } from "../../api/types";
import { autosaveCell, commitCell } from "../../api/cells";

type Tool = "brush" | "eraser";

interface Props {
  cell: CellDTO;
  session: SessionDTO;
  onClose: () => void;
  onCommitted: () => void;
}

interface Stroke {
  points: number[];
  color: string;
  size: number;
  erase: boolean;
}

const PALETTE = [
  "#000000",
  "#ffffff",
  "#f44336",
  "#ff9800",
  "#ffeb3b",
  "#4caf50",
  "#2196f3",
  "#9c27b0",
];

const AUTOSAVE_INTERVAL_MS = 10_000;

/** Draw the rendered strokes described by a history snapshot. */
function strokesFromHistory(
  operations: DrawOperation[],
  cellWidth: number,
  cellHeight: number,
): Stroke[] {
  const result: Stroke[] = [];
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

/**
 * Single-cell drawing editor with brush/eraser, client-side undo/redo,
 * periodic autosave and an irreversible final commit.
 */
export default function CellEditor({
  cell,
  session,
  onClose,
  onCommitted,
}: Props) {
  const cellWidth = session.canvas_width / session.grid_cols;
  const cellHeight = session.canvas_height / session.grid_rows;

  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(4);
  const [comment, setComment] = useState(cell.comment ?? "");
  const [commitOpen, setCommitOpen] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState<DrawOperation[]>([]);
  const [redoStack, setRedoStack] = useState<DrawOperation[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [revision, setRevision] = useState(cell.revision ?? 0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const stageRef = useRef<Konva.Stage>(null);
  const revisionRef = useRef(revision);

  revisionRef.current = revision;

  const undo = useCallback(() => {
    setHistory((current) => {
      if (current.length === 0) return current;
      const last = current[current.length - 1];
      setRedoStack((stack) => [...stack, last]);
      const next = current.slice(0, -1);
      setStrokes(strokesFromHistory(next, cellWidth, cellHeight));
      return next;
    });
  }, [cellHeight, cellWidth]);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const last = stack[stack.length - 1];
      setHistory((current) => {
        const next = [...current, last];
        setStrokes(strokesFromHistory(next, cellWidth, cellHeight));
        return next;
      });
      return stack.slice(0, -1);
    });
  }, [cellHeight, cellWidth]);

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

  /** Persist the current history without changing the drawing buffer. */
  const save = useCallback(async () => {
    if (history.length === 0) return;
    setSaveState("saving");
    try {
      const result = await autosaveCell(
        cell.id,
        history,
        revisionRef.current,
      );
      setRevision(result.revision);
      revisionRef.current = result.revision;
      setSaveState("saved");
      setError(null);
    } catch (err) {
      setSaveState("idle");
      setError(extractMessage(err));
    }
  }, [cell.id, history]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void save();
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [save]);

  function pointerPosition(): { x: number; y: number } | null {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return null;
    return { x: pointer.x, y: pointer.y };
  }

  function handleMouseDown() {
    const point = pointerPosition();
    if (!point) return;
    setIsDrawing(true);
    setStrokes((current) => [
      ...current,
      {
        points: [point.x, point.y],
        color,
        size,
        erase: tool === "eraser",
      },
    ]);
  }

  function handleMouseMove() {
    if (!isDrawing) return;
    const point = pointerPosition();
    if (!point) return;
    setStrokes((current) => {
      if (current.length === 0) return current;
      const next = [...current];
      const last = { ...next[next.length - 1] };
      last.points = [...last.points, point.x, point.y];
      next[next.length - 1] = last;
      return next;
    });
  }

  function handleMouseUp() {
    if (!isDrawing) return;
    setIsDrawing(false);
    const last = strokes[strokes.length - 1];
    if (!last || last.points.length < 4) return;

    const normalized: number[][] = [];
    for (let index = 0; index < last.points.length; index += 2) {
      normalized.push([
        last.points[index] / cellWidth,
        last.points[index + 1] / cellHeight,
      ]);
    }
    const operation: DrawOperation = {
      type: last.erase ? "erase" : "stroke",
      ts: Date.now(),
      color: last.color,
      size: last.size / cellWidth,
      points: normalized,
    };
    setHistory((current) => [...current, operation]);
    setRedoStack([]);
  }

  async function handleCommit() {
    setError(null);
    try {
      await commitCell(
        cell.id,
        history,
        revisionRef.current,
        comment.trim(),
      );
      setCommitOpen(false);
      onCommitted();
    } catch (err) {
      setError(extractMessage(err));
    }
  }

  const canCommit = !error || saveState !== "idle";

  return (
    <Dialog open maxWidth="md" fullWidth onClose={onClose}>
      <DialogTitle>
        Draw in cell ({cell.col}, {cell.row})
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          <Box>
            <ButtonGroup sx={{ mb: 1 }} variant="outlined">
              <Button
                variant={tool === "brush" ? "contained" : "outlined"}
                onClick={() => setTool("brush")}
              >
                Brush
              </Button>
              <Button
                variant={tool === "eraser" ? "contained" : "outlined"}
                onClick={() => setTool("eraser")}
              >
                Eraser
              </Button>
              <Button onClick={undo} disabled={history.length === 0}>
                Undo
              </Button>
              <Button onClick={redo} disabled={redoStack.length === 0}>
                Redo
              </Button>
            </ButtonGroup>

            <Box sx={{ display: "flex", gap: 1, mb: 2, alignItems: "center" }}>
              {PALETTE.map((swatch) => (
                <Tooltip key={swatch} title={swatch}>
                  <IconButton
                    size="small"
                    aria-label={`color ${swatch}`}
                    onClick={() => {
                      setColor(swatch);
                      setTool("brush");
                    }}
                    sx={{
                      width: 28,
                      height: 28,
                      bgcolor: swatch,
                      border:
                        color === swatch
                          ? "3px solid #2196f3"
                          : "1px solid #cccccc",
                    }}
                  />
                </Tooltip>
              ))}
            </Box>

            <TextField
              label="Brush size"
              type="number"
              size="small"
              value={size}
              inputProps={{ min: 1, max: 40 }}
              onChange={(event) => setSize(Number(event.target.value))}
              sx={{ width: 140, mr: 2, mb: 2 }}
            />

            <Stage
              ref={stageRef}
              width={cellWidth}
              height={cellHeight}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleMouseDown}
              onTouchMove={handleMouseMove}
              onTouchEnd={handleMouseUp}
              style={{ border: "1px solid #bdbdbd", background: "#ffffff" }}
            >
              <Layer>
                <Rect
                  x={0}
                  y={0}
                  width={cellWidth}
                  height={cellHeight}
                  fill="#ffffff"
                  listening={false}
                />
                {strokes.map((stroke, index) => (
                  <Line
                    key={index}
                    points={stroke.points}
                    stroke={stroke.erase ? "#ffffff" : stroke.color}
                    strokeWidth={stroke.size}
                    lineCap="round"
                    lineJoin="round"
                    globalCompositeOperation={
                      stroke.erase ? "destination-out" : "source-over"
                    }
                    tension={0.3}
                  />
                ))}
              </Layer>
            </Stage>
          </Box>

          <Box sx={{ flex: 1, minWidth: 240 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <TextField
              label="Comment (optional)"
              multiline
              minRows={3}
              fullWidth
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              helperText="Shown to other players as context."
            />

            <Typography variant="body2" sx={{ mt: 2 }}>
              Operations: {history.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Revision: {revision}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : `Autosaves every ${AUTOSAVE_INTERVAL_MS / 1000}s`}
            </Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => setCommitOpen(true)}
          disabled={!canCommit}
        >
          Confirm
        </Button>
      </DialogActions>

      <Dialog open={commitOpen} onClose={() => setCommitOpen(false)}>
        <DialogTitle>Commit this cell?</DialogTitle>
        <DialogContent>
          <Typography>
            This action is irreversible. The cell becomes read-only after the
            confirmation.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCommitOpen(false)}>Back</Button>
          <Button variant="contained" color="error" onClick={handleCommit}>
            Commit
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

/** Extract a readable message from an API error. */
function extractMessage(err: unknown): string {
  const data = (err as { response?: { data?: { detail?: string } } })?.response
    ?.data;
  return data?.detail ?? "The request failed.";
}