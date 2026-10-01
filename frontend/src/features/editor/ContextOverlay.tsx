import { Group, Line, Rect, Text } from "react-konva";
import type Konva from "konva";
import type { RenderedStroke } from "../../shared/renderHistory";

/** A neighbour cell of the read-only context zone prepared for rendering. */
export interface ContextCellView {
  cellId: string;
  row: number;
  col: number;
  status: string;
  comment: string | null;
  strokes: RenderedStroke[];
}

/** Geometry of the figure the context is cropped to, in pixels. */
export interface ContextShapeView {
  kind: string;
  /** Half width of the figure in pixels. */
  halfWidth: number;
  /** Half height of the figure in pixels. */
  halfHeight: number;
}

interface Props {
  cellWidth: number;
  cellHeight: number;
  /** Grid coordinates of the zone origin (top-left covered cell). */
  originRow: number;
  originCol: number;
  /** Number of grid rows and columns covered by the zone. */
  rows: number;
  cols: number;
  /** Grid coordinates of the cell being edited. */
  cellRow: number;
  cellCol: number;
  /** Figure the context is cropped to; defaults to a full-cell square. */
  shape: ContextShapeView | null;
  cells: ContextCellView[];
  /** Id of the neighbour currently hovered, if any. */
  hoveredCellId: string | null;
  onHover: (cellId: string | null) => void;
}

const CONTEXT_COLOR = "#42a5f5";
const EMPTY_FILL = "#e9ecef";
const FILLED_FILL = "#ffffff";
const ZONE_FILL = "#f0f2f4";

/** Fallback figure when the backend did not provide one: the cell itself. */
const DEFAULT_HALF = 1;

/**
 * Renders the read-only context around the cell being edited.
 *
 * All neighbours intersecting the context figure are shown, but their drawing
 * is clipped to the figure: the area outside the figure stays grey. A dashed
 * line marks the boundary between the edited cell and the context.
 */
export default function ContextOverlay({
  cellWidth,
  cellHeight,
  originRow,
  originCol,
  rows,
  cols,
  cellRow,
  cellCol,
  shape,
  cells,
  hoveredCellId,
  onHover,
}: Props) {
  const kind = shape?.kind ?? "rectangle";
  // The backend sends pixel half-extents; fall back to the edited cell itself.
  const halfW = shape?.halfWidth ?? (cellWidth / 2 || DEFAULT_HALF);
  const halfH = shape?.halfHeight ?? (cellHeight / 2 || DEFAULT_HALF);

  const centerX = (cellCol - originCol + 0.5) * cellWidth;
  const centerY = (cellRow - originRow + 0.5) * cellHeight;

  const zoneRight = cols * cellWidth;
  const zoneBottom = rows * cellHeight;
  const minX = Math.min(0, centerX - halfW);
  const minY = Math.min(0, centerY - halfH);
  const maxX = Math.max(zoneRight, centerX + halfW);
  const maxY = Math.max(zoneBottom, centerY + halfH);

  const clipFigure = (ctx: Konva.Context) => {
    ctx.beginPath();
    if (kind === "circle") {
      ctx.arc(centerX, centerY, halfW, 0, Math.PI * 2, false);
    } else {
      ctx.rect(centerX - halfW, centerY - halfH, halfW * 2, halfH * 2);
    }
    ctx.closePath();
  };

  const cellX = (col: number) => (col - originCol) * cellWidth;
  const cellY = (row: number) => (row - originRow) * cellHeight;

  return (
    <Group>
      {/* Neutral backdrop under the whole visible zone. */}
      <Rect
        x={minX}
        y={minY}
        width={maxX - minX}
        height={maxY - minY}
        fill={ZONE_FILL}
        listening={false}
      />

      {/* Grey placeholders for every intersecting neighbour. */}
      {cells.map((cell) => (
        <Rect
          key={`bg-${cell.cellId}`}
          x={cellX(cell.col)}
          y={cellY(cell.row)}
          width={cellWidth}
          height={cellHeight}
          fill={EMPTY_FILL}
          stroke="#b0bec5"
          strokeWidth={1}
          cornerRadius={2}
          listening={false}
        />
      ))}

      {/* Cell content, clipped to the context figure. */}
      <Group clipFunc={clipFigure}>
        {cells.map((cell) => {
          const filled = cell.status === "filled";
          if (!filled) return null;
          return (
            <Group
              key={`content-${cell.cellId}`}
              x={cellX(cell.col)}
              y={cellY(cell.row)}
            >
              <Rect
                width={cellWidth}
                height={cellHeight}
                fill={FILLED_FILL}
                listening={false}
              />
              {cell.strokes.map((stroke, index) => (
                <Line
                  key={index}
                  points={stroke.points}
                  stroke={stroke.erase ? "#ffffff" : stroke.color}
                  strokeWidth={stroke.size}
                  lineCap="round"
                  lineJoin="round"
                  tension={0.3}
                  globalCompositeOperation="source-over"
                  listening={false}
                />
              ))}
            </Group>
          );
        })}
      </Group>

      {/* Hover highlight, drawn on top of the figure so it is never clipped. */}
      {cells.map((cell) => {
        const hovered = hoveredCellId === cell.cellId;
        if (!hovered) return null;
        return (
          <Rect
            key={`hover-${cell.cellId}`}
            x={cellX(cell.col)}
            y={cellY(cell.row)}
            width={cellWidth}
            height={cellHeight}
            stroke={CONTEXT_COLOR}
            strokeWidth={2}
            cornerRadius={2}
            listening={false}
          />
        );
      })}

      {/* Comment markers, always visible for cells that have a comment. */}
      {cells.map((cell) => {
        if (!cell.comment) return null;
        const x = cellX(cell.col) + cellWidth - 26;
        const y = cellY(cell.row) + 4;
        return (
          <Group key={`comment-${cell.cellId}`} listening={false}>
            <Rect
              x={x}
              y={y}
              width={22}
              height={18}
              fill={CONTEXT_COLOR}
              cornerRadius={4}
              opacity={0.9}
            />
            <Text
              x={x}
              y={y + 1}
              width={22}
              text="✎"
              align="center"
              fontSize={12}
              fill="#ffffff"
            />
          </Group>
        );
      })}

      {/* Transparent hover targets: one per neighbour. */}
      {cells.map((cell) => (
        <Rect
          key={`hit-${cell.cellId}`}
          x={cellX(cell.col)}
          y={cellY(cell.row)}
          width={cellWidth}
          height={cellHeight}
          fill="rgba(0,0,0,0)"
          onMouseEnter={() => onHover(cell.cellId)}
          onMouseLeave={() => onHover(null)}
          onTouchStart={() => onHover(cell.cellId)}
        />
      ))}

      {/* Dashed separator between the edited cell and the context. */}
      <Rect
        x={cellX(cellCol)}
        y={cellY(cellRow)}
        width={cellWidth}
        height={cellHeight}
        stroke="#1565c0"
        strokeWidth={2}
        dash={[8, 5]}
        listening={false}
      />
    </Group>
  );
}