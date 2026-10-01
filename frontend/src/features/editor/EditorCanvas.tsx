import { useCallback, useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";
import { Layer, Line, Rect, Stage } from "react-konva";
import type Konva from "konva";
import type { DrawOperation } from "../../api/types";
import {
  strokesFromHistory,
  type RenderedStroke,
} from "../../shared/renderHistory";
import ContextOverlay, {
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
  onStrokeComplete: (operation: DrawOperation) => void;
  onHoverContext: (cellId: string | null) => void;
}

interface DraftStroke {
  points: number[];
  erase: boolean;
}

/** Clamp a normalized coordinate into the [0, 1] range required by the API. */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
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
  const scale = Math.min(
    viewport.width / zoneWidth,
    viewport.height / zoneHeight,
    1,
  );
  const offsetX = (viewport.width - zoneWidth * scale) / 2;
  const offsetY = (viewport.height - zoneHeight * scale) / 2;

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

  const cellOffsetX = (cellCol - originCol) * cellWidth;
  const cellOffsetY = (cellRow - originRow) * cellHeight;

  const strokes = strokesFromHistory(history, cellWidth, cellHeight);
  const draftStroke: RenderedStroke | null = draft
    ? {
        points: draft.points,
        color: draft.erase ? "#ffffff" : color,
        size,
        erase: draft.erase,
      }
    : null;

  /** Convert a stage pointer position into cell-local pixel coordinates. */
  const pointerInCell = useCallback((): { x: number; y: number } | null => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return null;
    const x = (pointer.x - offsetX) / scale - cellOffsetX;
    const y = (pointer.y - offsetY) / scale - cellOffsetY;
    if (x < 0 || y < 0 || x > cellWidth || y > cellHeight) return null;
    return { x, y };
  }, [cellOffsetX, cellOffsetY, cellHeight, cellWidth, offsetX, offsetY, scale]);

  function handleMouseDown() {
    const point = pointerInCell();
    if (!point) return;
    const next = { points: [point.x, point.y], erase: tool === "eraser" };
    draftRef.current = next;
    setDraft(next);
  }

  function handleMouseMove() {
    if (!draftRef.current) return;
    const point = pointerInCell();
    if (!point) return;
    const next = {
      points: [...draftRef.current.points, point.x, point.y],
      erase: draftRef.current.erase,
    };
    draftRef.current = next;
    setDraft(next);
  }

  function handleMouseUp() {
    const current = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (!current || current.points.length < 4) return;

    const normalized: number[][] = [];
    for (let index = 0; index < current.points.length; index += 2) {
      normalized.push([
        clamp01(current.points[index] / cellWidth),
        clamp01(current.points[index + 1] / cellHeight),
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
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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
        </Layer>
      </Stage>
    </Box>
  );
}