import { Box } from "@mui/material";
import type { ContextShape } from "../../api/types";

interface Props {
  shape: ContextShape;
  /** Radius as a percentage from 0 to 100. */
  radiusPct: number;
}

const CELL = 40;
const GRID = 3;
const SIZE = CELL * GRID;

const CELL_FILL = "#e9ecef";
const BORDER_COLOR = "#b0bec5";
const FIGURE_FILL = "#ffffff";

/**
 * A small interactive preview of the context figure.
 *
 * Renders a 3x3 grid of cells, all grey, with the white context figure centred
 * on the middle cell. The figure radius follows the slider: 0% makes the
 * figure coincide with the cell, 100% reaches the full ring of neighbours.
 * The central cell is always highlighted white regardless of the shape or
 * radius. Cell borders are drawn on top so they always stay visible.
 */
export default function ContextPreview({ shape, radiusPct }: Props) {
  const pct = Math.max(0, Math.min(100, radiusPct));
  // Radius in cells, mirroring the backend: the minimum radius (the figure
  // matching the cell) at 0% up to 1.5 at 100%.
  const minimum = shape === "circle" ? 0.5 : Math.SQRT1_2;
  const radiusCells = minimum + (pct / 100) * (1.5 - minimum);

  const centre = SIZE / 2;
  // A circle uses the radius directly; a square's half-side is radius / sqrt(2).
  const halfFigure =
    shape === "circle" ? radiusCells * CELL : (radiusCells / Math.SQRT2) * CELL;

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
        <clipPath id="context-preview-clip">
          <rect x={0} y={0} width={SIZE} height={SIZE} />
        </clipPath>
      </defs>

      {/* Grey cells. */}
      {Array.from({ length: GRID }).map((_, row) =>
        Array.from({ length: GRID }).map((__, col) => (
          <rect
            key={`cell-${row}-${col}`}
            x={col * CELL}
            y={row * CELL}
            width={CELL}
            height={CELL}
            fill={CELL_FILL}
          />
        )),
      )}

      {/* The central cell is always highlighted white. */}
      <rect x={CELL} y={CELL} width={CELL} height={CELL} fill={FIGURE_FILL} />

      {/* White context figure, clipped to the 3x3 area. */}
      <g clipPath="url(#context-preview-clip)">
        {shape === "circle" ? (
          <circle cx={centre} cy={centre} r={halfFigure} fill={FIGURE_FILL} />
        ) : (
          <rect
            x={centre - halfFigure}
            y={centre - halfFigure}
            width={halfFigure * 2}
            height={halfFigure * 2}
            fill={FIGURE_FILL}
          />
        )}
      </g>

      {/* Cell borders on top so they stay visible over the figure. */}
      {Array.from({ length: GRID }).map((_, row) =>
        Array.from({ length: GRID }).map((__, col) => (
          <rect
            key={`border-${row}-${col}`}
            x={col * CELL}
            y={row * CELL}
            width={CELL}
            height={CELL}
            fill="none"
            stroke={BORDER_COLOR}
            strokeWidth={1}
          />
        )),
      )}
    </Box>
  );
}