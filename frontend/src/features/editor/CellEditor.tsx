import { useEffect, useRef, useState } from "react";
import {
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
import { Circle, Line, Rect, Stage, Layer } from "react-konva";
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

/**
 * Single-cell drawing editor with brush/eraser, undo-redo, autosave and a
 * final irreversible commit.
 */
export default function CellEditor({ cell, session, onClose, onCommitted }: Props) {
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(4);
  const [comment, setComment] = useState("");
  const [commitOpen, setCommitOpen] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState<DrawOperation[]>([]);
  const [redoStack, setRedoStack] = useState<DrawOperation[]>([]);
  const [lines, setLines] = useState<
    Array<{ points: number[]; color: string; size: number; erase: boolean }>
  >([]);

  const stageRef = useRef<Konva.Stage>(null);
  const cellW = session.canvas_width / session.grid_cols;
  const cellH = session.canvas_height / session.grid_rows;

  // Undo/redo keyboard shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Autosave the intermediate history on the configured interval.
  useEffect(() => {
    const timer = setInterval(() => {
      if (history.length > 0) {
        void autosaveCell(cell.id, history);
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [history, cell.id]);

  function pushOp(op: DrawOperation) {
    setHistory((h) => [...h, op]);
    setRedoStack([]);
  }

  function undo() {
    setHistory((h) => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      setRedoStack((r) => [...r, last]);
      rebuild(h.slice(0, -1));
      return h.slice(0, -1);
    });
  }

  function redo() {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const last = r[r.length - 1];
      setHistory((h) => {
        const next = [...h, last];
        rebuild(next);
        return next;
      });
      return r.slice(0, -1);
    });
  }

  /** Recompute the visible strokes from a history snapshot. */
  function rebuild(ops: DrawOperation[]) {
    const result: typeof lines = [];
    for (const op of ops) {
      if (op.type === "clear") {
        result.length = 0;
        continue;
      }
      if (op.type === "stroke" || op.type === "erase") {
        result.push({
          points: (op.points ?? []).flatMap(([x, y]) => [
            x * cellW,
            y * cellH,
          ]),
          color: op.color ?? "#000000",
          size: (op.size ?? 0.01) * cellW,
          erase: op.type === "erase",
        });
      }
    }
    setLines(result);
  }

  function getRelativePointerPosition(): { x: number; y: number } | null {
    const stage = stageRef.current;
    if (!stage) return null;
    const p = stage.getPointerPosition();
    if (!p) return null;
    return { x: p.x / cellW, y: p.y / cellH };
  }

  function handleMouseDown() {
    const p = getRelativePointerPosition();
    if (!p) return;
    setIsDrawing(true);
    setLines((l) => [
      ...l,
      {
        points: [p.x * cellW, p.y * cellH],
        color,
        size,
        erase: tool === "eraser",
      },
    ]);
  }

  function handleMouseMove() {
    if (!isDrawing) return;
    const p = getRelativePointerPosition();
    if (!p) return;
    setLines((l) => {
      const next = [...l];
      const current = { ...next[next.length - 1] };
      current.points = [...current.points, p.x * cellW, p.y * cellH];
      next[next.length - 1] = current;
      return next;
    });
  }

  function handleMouseUp() {
    if (!isDrawing) return;
    setIsDrawing(false);
    const last = lines[lines.length - 1];
    if (!last) return;
    // Convert pixel points back to normalized coordinates.
    const normalized: number[][] = [];
    for (let i = 0; i < last.points.length; i += 2) {
      normalized.push([last.points[i] / cellW, last.points[i + 1] / cellH]);
    }
    pushOp({
      type: last.erase ? "erase" : "stroke",
      ts: Date.now(),
      color: last.color,
      size: last.size / cellW,
      points: normalized,
    });
  }

  async function handleCommit() {
    await autosaveCell(cell.id, history);
    await commitCell(cell.id, history, comment.trim() || undefined);
    onCommitted();
  }

  return (
    <Dialog open maxWidth="md" fullWidth onClose={onClose}>
      <DialogTitle>
        Draw in cell ({cell.col}, {cell.row})
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          <Box>
            <ButtonGroup sx={{ mb: 1 }}>
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

            <Box sx={{ display: "flex", gap: 1, mb: 1, alignItems: "center" }}>
              {PALETTE.map((c) => (
                <Tooltip key={c} title={c}>
                  <IconButton
                    size="small"
                    onClick={() => {
                      setColor(c);
                      setTool("brush");
                    }}
                    sx={{
                      width: 28,
                      height: 28,
                      bgcolor: c,
                      border:
                        color === c ? "3px solid #2196f3" : "1px solid #ccc",
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
              onChange={(e) => setSize(Number(e.target.value))}
              sx={{ width: 140, mr: 2 }}
            />

            <Stage
              ref={stageRef}
              width={cellW}
              height={cellH}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onTouchStart={handleMouseDown}
              onTouchMove={handleMouseMove}
              onTouchEnd={handleMouseUp}
              style={{ border: "1px solid #bdbdbd", background: "#ffffff" }}
            >
              <Layer>
                <Rect
                  x={0}
                  y={0}
                  width={cellW}
                  height={cellH}
                  fill="#ffffff"
                  listening={false}
                />
                {lines.map((line, i) => (
                  <Line
                    key={i}
                    points={line.points}
                    stroke={line.erase ? "#ffffff" : line.color}
                    strokeWidth={line.size}
                    lineCap="round"
                    lineJoin="round"
                    globalCompositeOperation={
                      line.erase ? "destination-out" : "source-over"
                    }
                    tension={0.3}
                  />
                ))}
                <Circle x={0} y={0} radius={0} fill="transparent" />
              </Layer>
            </Stage>
          </Box>

          <Box sx={{ flex: 1, minWidth: 240 }}>
            <Typography variant="subtitle2">Context</Typography>
            <Typography variant="body2" color="text.secondary">
              The read-only zone around this cell is shown on the session
              canvas behind this dialog.
            </Typography>

            <TextField
              label="Comment (optional)"
              multiline
              minRows={3}
              fullWidth
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              sx={{ mt: 2 }}
            />
            <Typography variant="caption" color="text.secondary">
              {history.length} operations
            </Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => setCommitOpen(true)}>
          Confirm
        </Button>
      </DialogActions>

      <Dialog open={commitOpen} onClose={() => setCommitOpen(false)}>
        <DialogTitle>Commit this cell?</DialogTitle>
        <DialogContent>
          <Typography>
            This action is irreversible. The cell will become read-only after
            confirmation.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCommitOpen(false)}>Back</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleCommit}
          >
            Commit
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}