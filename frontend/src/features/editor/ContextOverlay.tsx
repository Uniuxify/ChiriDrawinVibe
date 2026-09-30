import { Group, Line, Rect, Text } from "react-konva";
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

interface Props {
  cellWidth: number;
  cellHeight: number;
  /** Grid coordinates of the zone origin (top-left neighbour). */
  originRow: number;
  originCol: number;
  /** Number of grid rows and columns covered by the zone. */
  rows: number;
  cols: number;
  cells: ContextCellView[];
  /** Id of the neighbour currently hovered, if any. */
  hoveredCellId: string | null;
  onHover: (cellId: string | null) => void;
}

const ZONE_BORDER_COLOR = "#42a5f5";
const EMPTY_FILL = "#e9ecef";
const FILLED_FILL = "#ffffff";

/**
 * Renders the read-only context zone: every neighbour of the unlocked cell
 * with its committed drawing, dashed blue boundary and comment markers.
 */
export default function ContextOverlay({
  cellWidth,
  cellHeight,
  originRow,
  originCol,
  rows,
  cols,
  cells,
  hoveredCellId,
  onHover,
}: Props) {
  const zoneWidth = cols * cellWidth;
  const zoneHeight = rows * cellHeight;

  return (
    <Group>
      <Rect
        x={0}
        y={0}
        width={zoneWidth}
        height={zoneHeight}
        fill="#f5f6f7"
        stroke={ZONE_BORDER_COLOR}
        strokeWidth={2}
        dash={[10, 6]}
        cornerRadius={4}
        listening={false}
      />
      {cells.map((cell) => {
        const x = (cell.col - originCol) * cellWidth;
        const y = (cell.row - originRow) * cellHeight;
        const filled = cell.status === "filled";
        const hovered = hoveredCellId === cell.cellId;

        return (
          <Group key={cell.cellId} x={x} y={y}>
            <Rect
              width={cellWidth}
              height={cellHeight}
              fill={filled ? FILLED_FILL : EMPTY_FILL}
              stroke={hovered ? ZONE_BORDER_COLOR : "#b0bec5"}
              strokeWidth={hovered ? 2 : 1}
              cornerRadius={2}
              onMouseEnter={() => onHover(cell.cellId)}
              onMouseLeave={() => onHover(null)}
              onTouchStart={() => onHover(cell.cellId)}
            />
            {filled
              ? cell.strokes.map((stroke, index) => (
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
                ))
              : null}
            {cell.comment ? (
              <>
                <Rect
                  x={cellWidth - 26}
                  y={4}
                  width={22}
                  height={18}
                  fill={ZONE_BORDER_COLOR}
                  cornerRadius={4}
                  opacity={0.9}
                  listening={false}
                />
                <Text
                  x={cellWidth - 26}
                  y={5}
                  width={22}
                  text="✎"
                  align="center"
                  fontSize={12}
                  fill="#ffffff"
                  listening={false}
                />
              </>
            ) : null}
          </Group>
        );
      })}
    </Group>
  );
}