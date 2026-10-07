import { useCallback, useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";
import { Group, Layer, Line, Rect, Stage } from "react-konva";
import type Konva from "konva";
import type { DrawOperation } from "../../api/types";
import {
  strokesFromHistory,
  type RenderedStroke,
} from "../../shared/renderHistory";
import ContextOverlay, {
  ContextBoundary,
  type ContextCellView,
  type ContextShapeView,
} from "./ContextOverlay";
import type { EditorTool } from "./EditorToolbar";

interface Props {
  cellWidth: number;
  cellHeight: number;
  /** Grid position of the drawn cell. */
  cellRow: number;
  cellCol: number;
  contextCells: ContextCellView[];
  originRow: number;
  originCol: number;
  contextRows: number;
  contextCols: number;
  /** Figure the context is cropped to, from the backend. */
  contextShape: ContextShapeView | null;
  history: DrawOperation[];
  tool: EditorTool;
  color: string;
  size: number;
  /** Draw the grey dashed context-area outline on the edited cell. */
  showContextArea: boolean;
  onStrokeComplete: (operation: DrawOperation) => void;
  onHoverContext: (cellId: string | null) => void;
}

interface DraftStroke {
  points: number[];
  erase: boolean;
}

/** Lowest normalized coordinate accepted by the API: one cell beyond the edge. */
const COORD_MIN = -1;
/** Highest normalized coordinate accepted by the API: one cell beyond the edge. */
const COORD_MAX = 2;

/**
 * Clamp a normalized coordinate into the range required by the API.
 *
 * The drawing plane is effectively infinite; only a one-cell margin around
 * the cell is kept so the payload stays bounded. Everything outside the cell
 * rectangle is clipped away when rendering.
 */
function clampCoord(value: number): number {
  return Math.min(COORD_MAX, Math.max(COORD_MIN, value));
}

/** Clamp a relative stroke size into the (0, 1] range required by the API. */
function clampSize(value: number): number {
  return Math.min(1, Math.max(0.001, value));
}

/**
 * Interactive drawing surface: read-only context neighbours around the cell
 * plus the player's own cell in the middle.
 */
export default function EditorCanvas({
  cellWidth,
  cellHeight,
  cellRow,
  cellCol,
  contextCells,
  originRow,
  originCol,
  contextRows,
  contextCols,
  contextShape,
  history,
  tool,
  color,
  size,
  showContextArea,
  onStrokeComplete,
  onHoverContext,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [draft, setDraft] = useState<DraftStroke | null>(null);
  const draftRef = useRef<DraftStroke | null>(null);
  const [hoveredCellId, setHoveredCellId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });

  const zoneWidth = contextCols * cellWidth;
  const zoneHeight = contextRows * cellHeight;
  const cellOffsetX = (cellCol - originCol) * cellWidth;
  const cellOffsetY = (cellRow - originRow) * cellHeight;

  // Fit the working area (the editable cell plus its context zone) into the
  // viewport while keeping the edited cell centred. The required extent is
  // measured from the cell centre to the farthest zone edge on each axis, so
  // the whole zone stays visible. There is no upper clamp on purpose: the
  // grey backdrop simply extends beyond the viewport and is clipped by the
  // container.
  const cellCentreX = cellOffsetX + cellWidth / 2;
  const cellCentreY = cellOffsetY + cellHeight / 2;
  const requiredWidth = 2 * Math.max(cellCentreX, zoneWidth - cellCentreX);
  const requiredHeight = 2 * Math.max(cellCentreY, zoneHeight - cellCentreY);
  const scale = Math.min(
    viewport.width / requiredWidth,
    viewport.height / requiredHeight,
  );
  const offsetX = viewport.width / 2 - cellCentreX * scale;
  const offsetY = viewport.height / 2 - cellCentreY * scale;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        setViewport({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const strokes = strokesFromHistory(history, cellWidth, cellHeight);
  const draftStroke: RenderedStroke | null = draft
    ? {
        points: draft.points,
        color: draft.erase ? "#ffffff" : color,
        size,
        erase: draft.erase,
      }
    : null;

  /**
   * Convert a stage pointer position into cell-local pixel coordinates.
   *
   * The drawing plane is infinite: a stroke may start anywhere; only the
   * cell rectangle is visible and everything outside it is clipped away.
   */
  const pointerInPlane = useCallback((): { x: number; y: number } | null => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return null;
    const x = (pointer.x - offsetX) / scale - cellOffsetX;
    const y = (pointer.y - offsetY) / scale - cellOffsetY;
    return { x, y };
  }, [cellOffsetX, cellOffsetY, offsetX, offsetY, scale]);

  /**
   * Convert client coordinates into cell-local pixel coordinates.
   *
   * The drawing plane is infinite: coordinates outside the cell are kept and
   * clipped away when rendering, so a stroke never breaks at the cell edge.
   */
  const pointFromClient = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const element = containerRef.current;
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const x = (clientX - rect.left - offsetX) / scale - cellOffsetX;
      const y = (clientY - rect.top - offsetY) / scale - cellOffsetY;
      return { x, y };
    },
    [cellOffsetX, cellOffsetY, offsetX, offsetY, scale],
  );

  /** Append a point to the draft stroke in progress, if any. */
  const appendPoint = useCallback((point: { x: number; y: number }) => {
    const current = draftRef.current;
    if (!current) return;
    const next = {
      points: [...current.points, point.x, point.y],
      erase: current.erase,
    };
    draftRef.current = next;
    setDraft(next);
  }, []);

  function handleMouseDown() {
    // A stroke may start anywhere on the infinite plane; the cell rectangle
    // is the only visible part and is enforced by clipping, not by input.
    const point = pointerInPlane();
    if (!point) return;
    const next = { points: [point.x, point.y], erase: tool === "eraser" };
    draftRef.current = next;
    setDraft(next);
  }

  /** Continue a touch stroke; touch events stay targeted at the stage. */
  function handleMouseMove() {
    if (!draftRef.current) return;
    const point = pointerInPlane();
    if (point) appendPoint(point);
  }

  function handleMouseUp() {
    const current = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (!current || current.points.length < 4) return;

    const normalized: number[][] = [];
    for (let index = 0; index < current.points.length; index += 2) {
      normalized.push([
        clampCoord(current.points[index] / cellWidth),
        clampCoord(current.points[index + 1] / cellHeight),
      ]);
    }
    onStrokeComplete({
      type: current.erase ? "erase" : "stroke",
      ts: Date.now(),
      color,
      size: clampSize(size / cellWidth),
      points: normalized,
    });
  }

  // While a stroke is in progress, track the mouse over the whole window so
  // the polyline stays continuous when the pointer leaves the cell or the
  // stage. Only the cell rectangle is visible; the rest is clipped away.
  const drawing = draft !== null;
  useEffect(() => {
    if (!drawing) return;
    const handleMove = (event: MouseEvent) => {
      if (event.buttons === 0) {
        handleMouseUp();
        return;
      }
      const point = pointFromClient(event.clientX, event.clientY);
      if (point) appendPoint(point);
    };
    const handleUp = () => handleMouseUp();
    const handleBlur = () => handleMouseUp();
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [drawing, appendPoint, pointFromClient, handleMouseUp]);

  return (
    <Box
      ref={containerRef}
      sx={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        bgcolor: "#eceff1",
        overflow: "hidden",
      }}
    >
      <Stage
        ref={stageRef}
        width={viewport.width}
        height={viewport.height}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
        style={{ cursor: "crosshair" }}
      >
        <Layer x={offsetX} y={offsetY} scaleX={scale} scaleY={scale}>
          <ContextOverlay
            cellWidth={cellWidth}
            cellHeight={cellHeight}
            originRow={originRow}
            originCol={originCol}
            rows={contextRows}
            cols={contextCols}
            cellRow={cellRow}
            cellCol={cellCol}
            shape={contextShape}
            cells={contextCells}
            hoveredCellId={hoveredCellId}
            onHover={(cellId) => {
              setHoveredCellId(cellId);
              onHoverContext(cellId);
            }}
          />
          <Rect
            x={cellOffsetX}
            y={cellOffsetY}
            width={cellWidth}
            height={cellHeight}
            fill="#ffffff"
            stroke="#1565c0"
            strokeWidth={2}
            cornerRadius={2}
            listening={false}
          />
          {/* Strokes live on an infinite plane; only the cell rectangle is
              visible, so everything outside it is clipped away. */}
          <Group
            clipX={cellOffsetX}
            clipY={cellOffsetY}
            clipWidth={cellWidth}
            clipHeight={cellHeight}
          >
            {strokes.map((stroke, index) => (
              <Line
                key={index}
                x={cellOffsetX}
                y={cellOffsetY}
                points={stroke.points}
                stroke={stroke.erase ? "#ffffff" : stroke.color}
                strokeWidth={stroke.size}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation="source-over"
                tension={0.3}
                listening={false}
              />
            ))}
            {draftStroke && (
              <Line
                x={cellOffsetX}
                y={cellOffsetY}
                points={draftStroke.points}
                stroke={draftStroke.color}
                strokeWidth={draftStroke.size}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation="source-over"
                tension={0.3}
                listening={false}
              />
            )}
          </Group>
          {/* Grey dashed context-area outline, always on top of the cell. */}
          <ContextBoundary
            cellWidth={cellWidth}
            cellHeight={cellHeight}
            cellRow={cellRow}
            cellCol={cellCol}
            originRow={originRow}
            originCol={originCol}
            shape={contextShape}
            cells={contextCells}
            showAll={showContextArea}
            hoveredCellId={hoveredCellId}
          />
        </Layer>
      </Stage>
    </Box>
  );
}