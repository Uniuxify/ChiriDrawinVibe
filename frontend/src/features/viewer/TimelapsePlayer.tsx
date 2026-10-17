import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import { Layer, Line, Rect, Stage } from "react-konva";
import type { TimelapseData, TimelapseEvent } from "../../api/sessions";
import { strokesFromHistory } from "../../shared/renderHistory";

/** Replayed duration of one cell when its history carries no timestamps. */
const FALLBACK_CELL_MS = 1500;
/** Gap between consecutive cells in the timestamp-free fallback order. */
const FALLBACK_CELL_GAP_MS = 400;
/** Playback speed options. */
const SPEEDS = [0.5, 1, 2, 4, 8];

interface TimelineItem {
  row: number;
  col: number;
  /** Replay start of the cell, ms after the beginning of the timeline. */
  start: number;
  /** Offset of every operation from the cell start, ms. */
  opTimes: number[];
}

/** Format a millisecond offset as m:ss. */
function formatTime(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/**
 * Build the replay timeline of a finished session.
 *
 * Timestamps are normalized so the first stroke of the whole picture starts
 * at zero; cells without timestamps fall back to an even sequential order.
 */
function buildTimeline(events: TimelapseEvent[]): {
  items: TimelineItem[];
  duration: number;
} {
  const hasTs = events.some((event) => event.first_ts != null);
  const t0 = hasTs
    ? Math.min(
        ...events
          .filter((event) => event.first_ts != null)
          .map((event) => event.first_ts as number),
      )
    : 0;

  const items: TimelineItem[] = [];
  events.forEach((event, index) => {
    const start =
      event.first_ts != null
        ? event.first_ts - t0
        : hasTs
          ? index * FALLBACK_CELL_GAP_MS
          : index * FALLBACK_CELL_GAP_MS;
    const opTimes = event.operations.map((op, opIndex) => {
      if (typeof op.ts === "number" && event.first_ts != null) {
        return Math.max(0, op.ts - t0 - start);
      }
      const total = event.operations.length;
      return total > 1 ? (opIndex / (total - 1)) * FALLBACK_CELL_MS : 0;
    });
    items.push({ row: event.row, col: event.col, start, opTimes });
  });

  const duration = items.reduce(
    (max, item) => Math.max(max, item.start + FALLBACK_CELL_MS),
    FALLBACK_CELL_GAP_MS * Math.max(items.length, 1),
  );
  return { items, duration };
}

/**
 * Replay player of a finished session: every committed stroke is drawn in
 * its original order on the shared canvas, with play/pause, scrubbing and
 * speed control.
 */
export default function TimelapsePlayer({ data }: { data: TimelapseData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [playing, setPlaying] = useState(true);
  const [position, setPosition] = useState(0);
  const [speed, setSpeed] = useState(1);
  // Single source of truth for the playhead: the rAF loop advances the ref
  // and mirrors it into the state so the slider stays in sync every frame.
  const positionRef = useRef(0);

  const { items, duration } = buildTimeline(data.events);

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

  // Advance the playhead while playing; stop exactly at the end. The ref is
  // authoritative so the slider thumb moves smoothly on every frame.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = (now - last) * speed;
      last = now;
      const next = Math.min(positionRef.current + delta, duration);
      positionRef.current = next;
      setPosition(next);
      if (next >= duration) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, duration]);

  const rawScale = Math.min(
    viewport.width / data.canvas_width,
    viewport.height / data.canvas_height,
  );
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
  // Centre the canvas inside the available box on both axes.
  const offsetX = (viewport.width - data.canvas_width * scale) / 2;
  const offsetY = (viewport.height - data.canvas_height * scale) / 2;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box ref={containerRef} sx={{ flex: 1, minHeight: 0 }}>
        <Stage
          width={Math.max(1, viewport.width)}
          height={Math.max(1, viewport.height)}
        >
          <Layer x={offsetX} y={offsetY} scaleX={scale} scaleY={scale}>
            <Rect
              x={0}
              y={0}
              width={data.canvas_width}
              height={data.canvas_height}
              fill="#ffffff"
              listening={false}
            />
            {items.map((item, cellIndex) => {
              const event = data.events[cellIndex];
              const applied = event.operations.filter(
                (_, opIndex) => item.start + item.opTimes[opIndex] <= position,
              );
              if (applied.length === 0) return null;
              const strokes = strokesFromHistory(
                applied,
                data.cell_width,
                data.cell_height,
              );
              return strokes.map((stroke, strokeIndex) => (
                <Line
                  key={`${cellIndex}:${strokeIndex}`}
                  x={item.col * data.cell_width}
                  y={item.row * data.cell_height}
                  points={stroke.points}
                  stroke={stroke.erase ? "#ffffff" : stroke.color}
                  strokeWidth={stroke.size}
                  lineCap="round"
                  lineJoin="round"
                  globalCompositeOperation="source-over"
                  tension={0.3}
                  listening={false}
                />
              ));
            })}
          </Layer>
        </Stage>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          px: 2,
          py: 1,
          flexShrink: 0,
        }}
      >
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            if (!playing && positionRef.current >= duration) {
              positionRef.current = 0;
              setPosition(0);
            }
            setPlaying((prev) => !prev);
          }}
        >
          {playing ? "Pause" : "Play"}
        </Button>
        {/* A native range input instead of the MUI Slider: it reflects the
            controlled value on every rAF frame without the component's own
            step-normalization getting in the way. */}
        <input
          type="range"
          min={0}
          max={Math.max(1, duration)}
          step={Math.max(1, duration / 500)}
          value={position}
          onChange={(event) => {
            const next = Number(event.target.value);
            positionRef.current = next;
            setPosition(next);
            setPlaying(false);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            height: 4,
            accentColor: "#1976d2",
            cursor: "pointer",
          }}
        />
        <Typography variant="body2" sx={{ minWidth: 80, textAlign: "right" }}>
          {formatTime(position)} / {formatTime(duration)}
        </Typography>
        <FormControl size="small" sx={{ width: 90 }}>
          <InputLabel id="timelapse-speed-label">Speed</InputLabel>
          <Select
            labelId="timelapse-speed-label"
            label="Speed"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            {SPEEDS.map((option) => (
              <MenuItem key={option} value={option}>
                {option}×
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
    </Box>
  );
}
