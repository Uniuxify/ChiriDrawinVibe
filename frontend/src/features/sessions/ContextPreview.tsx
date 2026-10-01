import { Box } from "@mui/material";
import type {
  CellGeometry,
  CellShapeKind,
  ContextShapeKind,
} from "../../shared/contextGeometry";
import { figureGeometry } from "../../shared/contextGeometry";

interface Props {
  shape: ContextShapeKind;
  /** Radius as a percentage from 0 to 100. */
  radiusPct: number;
  /** Real geometry of one cell of the session being created. */
  cell: CellGeometry;
}

/** The preview box: a 3x3 neighbourhood of cells, scaled to fit. */
const SIZE = 120;
const GRID = 3;

const CELL_FILL = "#e9ecef";
const BORDER_COLOR = "#b0bec5";
const FIGURE_FILL = "#e3f2fd";
const CENTRE_FILL = "#ffffff";

/**
 * Render one grid cell.
 *
 * The switch keeps future grid types (non-rectangular cells) pluggable: only
 * the cell outline is shape-specific, everything else uses the bounding box.
 */
function CellShape({
  shape,
  x,
  y,
  width,
  height,
  fill,
}: {
  shape: CellShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
}) {
  switch (shape) {
    case "rectangle":
    default:
      return <rect x={x} y={y} width={width} height={height} fill={fill} />;
  }
}

/**
 * Interactive preview of the context figure.
 *
 * The 3x3 cells keep the real aspect ratio of the session cells, so the
 * preview matches what players will actually see. Layering: grey cells, then
 * the pale blue context figure clipped to the neighbourhood, then the always
 * white central cell, and finally the cell borders on top.
 */
export default function ContextPreview({ shape, radiusPct, cell }: Props) {
  const width = Number.isFinite(cell.width) && cell.width > 0 ? cell.width : 1;
  const height =
    Number.isFinite(cell.height) && cell.height > 0 ? cell.height : 1;
  const realCell: CellGeometry = { ...cell, width, height };

  // Fit the whole neighbourhood into the box while keeping the real aspect.
  const scale = Math.min(SIZE / (GRID * width), SIZE / (GRID * height));
  const cellW = width * scale;
  const cellH = height * scale;
  const gridW = GRID * cellW;
  const gridH = GRID * cellH;
  const originX = (SIZE - gridW) / 2;
  const originY = (SIZE - gridH) / 2;

  const pct = Math.max(0, Math.min(100, radiusPct));
  // The figure is computed from the scaled cell so it lives in viewBox units.
  const figure = figureGeometry(shape, { ...realCell, width: cellW, height: cellH }, pct);

  const centreIndex = Math.floor(GRID / 2);
  const centreX = originX + centreIndex * cellW;
  const centreY = originY + centreIndex * cellH;
  const centreCx = centreX + cellW / 2;
  const centreCy = centreY + cellH / 2;

  return (
    <Box
      component="svg"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      sx={{
        width: 132,
        height: 132,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        bgcolor: "background.paper",
        flexShrink: 0,
      }}
      role="img"
      aria-label="Context figure preview"
    >
      <defs>
        <clipPath id="context-preview-grid">
          <rect x={originX} y={originY} width={gridW} height={gridH} />
        </clipPath>
      </defs>

      {/* Grey cells: everything outside the context stays grey. */}
      {Array.from({ length: GRID }).map((_, row) =>
        Array.from({ length: GRID }).map((__, col) => (
          <CellShape
            key={`cell-${row}-${col}`}
            shape={cell.shape}
            x={originX + col * cellW}
            y={originY + row * cellH}
            width={cellW}
            height={cellH}
            fill={CELL_FILL}
          />
        )),
      )}

      {/* Pale blue context figure, clipped to the neighbourhood. */}
      <g clipPath="url(#context-preview-grid)">
        {figure.kind === "circle" ? (
          <circle
            cx={centreCx}
            cy={centreCy}
            r={figure.halfWidth}
            fill={FIGURE_FILL}
          />
        ) : (
          <rect
            x={centreCx - figure.halfWidth}
            y={centreCy - figure.halfHeight}
            width={figure.halfWidth * 2}
            height={figure.halfHeight * 2}
            fill={FIGURE_FILL}
          />
        )}
      </g>

      {/* The central cell is always white. */}
      <CellShape
        shape={cell.shape}
        x={centreX}
        y={centreY}
        width={cellW}
        height={cellH}
        fill={CENTRE_FILL}
      />

      {/* Cell borders on top so they stay visible over the figure. */}
      {Array.from({ length: GRID }).map((_, row) =>
        Array.from({ length: GRID }).map((__, col) => (
          <rect
            key={`border-${row}-${col}`}
            x={originX + col * cellW}
            y={originY + row * cellH}
            width={cellW}
            height={cellH}
            fill="none"
            stroke={BORDER_COLOR}
            strokeWidth={1}
          />
        )),
      )}
    </Box>
  );
}