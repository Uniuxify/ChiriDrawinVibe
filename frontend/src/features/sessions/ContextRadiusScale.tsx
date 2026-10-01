import { Box, Typography } from "@mui/material";
import type {
  ContextThreshold,
  CountSegment,
} from "../../shared/contextGeometry";

interface Props {
  /** Constant-count ranges of the slider. */
  segments: CountSegment[];
  /** Slider values where the neighbour count is about to grow. */
  thresholds: ContextThreshold[];
  /** Current slider value, highlighted on the line. */
  value: number;
}

const CHART_TOP = 14;
const CHART_HEIGHT = 18;
const AXIS_Y = CHART_TOP + CHART_HEIGHT;
const HEIGHT = 52;
/** A segment narrower than this does not fit its count label. */
const MIN_LABEL_WIDTH = 6;

/**
 * Neighbour-count line drawn under the radius slider.
 *
 * A staircase shows how many cells the context covers at every percentage,
 * dashed marks flag the values the slider magnetises to (each mark keeps the
 * smaller count, because the backend test is strict), and a thin marker
 * tracks the current value.
 */
export default function ContextRadiusScale({
  segments,
  thresholds,
  value,
}: Props) {
  const maxCount = Math.max(1, ...segments.map((segment) => segment.count));
  const yFor = (count: number) =>
    CHART_TOP + (1 - count / maxCount) * CHART_HEIGHT;

  let current = segments[0];
  for (const segment of segments) {
    if (segment.from <= value) current = segment;
  }

  return (
    <Box sx={{ position: "relative", width: "100%", height: HEIGHT }}>
      {/* Baseline of the chart. */}
      <Box
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          top: AXIS_Y,
          height: "1px",
          bgcolor: "divider",
        }}
      />

      {/* Horizontal steps: one per constant-count range. */}
      {segments.map((segment) => (
        <Box
          key={`seg-${segment.from}`}
          sx={{
            position: "absolute",
            left: `${segment.from}%`,
            width: `${segment.to - segment.from}%`,
            top: yFor(segment.count) - 1,
            height: 2,
            bgcolor: "primary.main",
            borderRadius: 1,
          }}
        />
      ))}

      {/* Vertical joins between consecutive steps. */}
      {segments.map((segment, index) => {
        const next = segments[index + 1];
        if (!next) return null;
        const y = yFor(segment.count);
        const nextY = yFor(next.count);
        if (y === nextY) return null;
        return (
          <Box
            key={`join-${segment.to}`}
            sx={{
              position: "absolute",
              left: `${segment.to}%`,
              transform: "translateX(-1px)",
              top: Math.min(y, nextY) - 1,
              height: Math.abs(y - nextY) + 2,
              width: 2,
              bgcolor: "primary.main",
            }}
          />
        );
      })}

      {/* Dashed marks at the magnet points, with their pre-jump count. */}
      {thresholds.map((threshold) => (
        <Box
          key={`threshold-${threshold.snapped}`}
          title={`${threshold.countBefore} cells — count grows right after ${threshold.snapped}%`}
          sx={{
            position: "absolute",
            left: `${threshold.snapped}%`,
            transform: "translateX(-1px)",
            top: CHART_TOP - 4,
            height: AXIS_Y - CHART_TOP + 4,
            width: 0,
            borderLeft: "1px dashed",
            borderColor: "warning.main",
          }}
        />
      ))}

      {/* Current value marker. */}
      <Box
        sx={{
          position: "absolute",
          left: `${value}%`,
          transform: "translateX(-1px)",
          top: CHART_TOP - 4,
          height: AXIS_Y - CHART_TOP + 4,
          width: 2,
          bgcolor: "primary.main",
          opacity: 0.5,
        }}
      />

      {/* Count labels above wide enough segments. */}
      {segments
        .filter((segment) => segment.to - segment.from >= MIN_LABEL_WIDTH)
        .map((segment) => (
          <Typography
            key={`label-${segment.from}`}
            sx={{
              position: "absolute",
              left: `${segment.from}%`,
              width: `${segment.to - segment.from}%`,
              top: yFor(segment.count) - 13,
              textAlign: "center",
              fontSize: 10,
              lineHeight: 1,
              color: "text.secondary",
            }}
          >
            {segment.count}
          </Typography>
        ))}

      <Box
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          top: AXIS_Y + 6,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Cells in context
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {current?.count ?? 0} at {value}%
        </Typography>
      </Box>
    </Box>
  );
}