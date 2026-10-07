import { useEffect, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Box } from "@mui/material";
import type Konva from "konva";
import { Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { fetchCellHistory } from "../../api/cells";
import type { CellDTO, SessionDTO } from "../../api/types";
import { strokesFromHistory } from "../../shared/renderHistory";

type ShapeEvt = { target: Konva.Shape };

interface Props {
  session: SessionDTO;
  cells: CellDTO[];
  myUserId: number | null;
  onSelect: (cell: CellDTO) => void;
  /** Cell ids revealed in the finished-session viewer. */
  revealed?: Set<string>;
  isAdminMode?: boolean;
}

const STATUS_FILL: Record<string, string> = {
  filled: "#ffffff",
  unlocked: "#cfe8ff",
  empty: "#9e9e9e",
  orphan: "#eeeeee",
};

/** Translucent dark overlay drawn over the hovered cell. */
const HOVER_FILL = "rgba(0, 0, 0, 0.35)";
/** Duration of the "black disappears, image appears" reveal fade. */
const REVEAL_FADE_SECONDS = 0.6;

/**
 * Renders the session grid: cell states, drawings, ownership hints and hover
 * borders.
 *
 * The grid is drawn in canvas coordinates and uniformly scaled to fit the
 * available box, keeping the aspect ratio, centered, so the canvas fills the
 * screen without scrollbars. A filled cell shows its committed drawing when it
 * is visible to the user: every revealed cell of a finished session, and only
 * the caller's own cells while the session is still running.
 */
export default function SessionCanvas({
  session,
  cells,
  myUserId,
  onSelect,
  revealed,
  isAdminMode,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [hoveredCellId, setHoveredCellId] = useState<string | null>(null);

  const cellW = session.canvas_width / session.grid_cols;
  const cellH = session.canvas_height / session.grid_rows;
  const finished = session.status === "finished";

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

  // Uniform scale: fit the canvas into the box while keeping its proportions.
  // No upper clamp, so small canvases stretch to fill the available space.
  const rawScale = Math.min(
    viewport.width / session.canvas_width,
    viewport.height / session.canvas_height,
  );
  const scale =
    Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;

  const stageWidth = Math.max(1, Math.floor(session.canvas_width * scale));
  const stageHeight = Math.max(1, Math.floor(session.canvas_height * scale));

  const contentVisible = cells.map((cell) => {
    if (cell.status !== "filled") return false;
    if (finished) {
      return (revealed?.has(cell.id) ?? false) || !!isAdminMode;
    }
    const ownerId = cell.owner_id ?? cell.owner;
    return (
      myUserId != null &&
      (cell.is_mine === true || ownerId === myUserId)
    );
  });

  const historyQueries = useQueries({
    queries: cells.map((cell, index) => ({
      queryKey: ["cell-history", cell.id, cell.revision ?? 0],
      queryFn: () => fetchCellHistory(cell.id),
      enabled: contentVisible[index],
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
    })),
  });

  const overlayRefs = useRef(new Map<string, Konva.Rect>());
  // Desired cover opacity (0 = open, 1 = closed) per cell, driven by a
  // single requestAnimationFrame loop. A hand-rolled loop is used instead of
  // Konva's node.to() because that API returns void (no handle to cancel),
  // which made reopening impossible after a hide.
  const coverTargetsRef = useRef(new Map<string, number>());
  const coverCellsRef = useRef(cells);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const firstOverlaySync = useRef(true);

  const tickCovers = () => {
    const targets = coverTargetsRef.current;
    let running = false;
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastTickRef.current) / 1000);
    lastTickRef.current = now;
    for (const cell of coverCellsRef.current) {
      const rect = overlayRefs.current.get(cell.id);
      const target = targets.get(cell.id);
      if (!rect || target === undefined) continue;
      const current = rect.opacity();
      if (Math.abs(current - target) <= 0.001) {
        rect.opacity(target);
        continue;
      }
      running = true;
      const step = dt / REVEAL_FADE_SECONDS;
      rect.opacity(
        current < target
          ? Math.min(target, current + step)
          : Math.max(target, current - step),
      );
    }
    if (running) {
      rafRef.current = requestAnimationFrame(tickCovers);
    } else {
      rafRef.current = null;
    }
  };

  const ensureCoverLoop = () => {
    if (rafRef.current != null) return;
    lastTickRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tickCovers);
  };

  // Reveal animation: every cover always moves toward its latest target, so
  // hiding mid-fade simply reverses the movement. The very first sync
  // (initial state, possibly hydrated from the DB) applies instantly.
  useEffect(() => {
    if (!finished) return;
    coverCellsRef.current = cells;
    for (const cell of cells) {
      const rect = overlayRefs.current.get(cell.id);
      if (!rect) continue;
      const open = (revealed?.has(cell.id) ?? false) || !!isAdminMode;
      const target = open ? 0 : 1;
      if (firstOverlaySync.current) rect.opacity(target);
      coverTargetsRef.current.set(cell.id, target);
    }
    firstOverlaySync.current = false;
    ensureCoverLoop();
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [finished, cells, revealed, isAdminMode]);

  return (
    <Box
      ref={containerRef}
      sx={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <Stage
        width={stageWidth}
        height={stageHeight}
        scaleX={scale}
        scaleY={scale}
        style={{ border: "1px solid #bdbdbd", background: "#fafafa" }}
      >
        <Layer>
          {cells.map((cell, index) => {
            const x = cell.col * cellW;
            const y = cell.row * cellH;
            const ownerId = cell.owner_id ?? cell.owner;
            const isMine =
              myUserId != null &&
              (cell.is_mine === true || ownerId === myUserId);

            let fill = STATUS_FILL[cell.status] ?? "#ffffff";

            if (finished) {
              // The dark cover of a closed cell is a separate animated
              // overlay, so the base fill always uses the open background.
              fill = cell.status === "filled" ? "#ffffff" : "#f5f5f5";
            } else if (cell.status === "empty" && !isMine) {
              // Other players' unfinished cells are black.
              fill = "#212121";
            } else if (cell.status === "empty" && isMine) {
              fill = "#9e9e9e";
            }

            const strokes = contentVisible[index]
              ? strokesFromHistory(
                  historyQueries[index]?.data?.operations ?? [],
                  cellW,
                  cellH,
                )
              : [];

            return (
              <g key={cell.id}>
                <Rect
                  x={x}
                  y={y}
                  width={cellW}
                  height={cellH}
                  fill={fill}
                  stroke="#bdbdbd"
                  strokeWidth={1}
                  onMouseEnter={(e) => {
                    setHoveredCellId(cell.id);
                    const target = (e as unknown as ShapeEvt).target;
                    if (isMine || finished) {
                      const stage = target.getStage();
                      if (stage) stage.container().style.cursor = "pointer";
                      target.stroke("#2196f3");
                      target.strokeWidth(2);
                      target.getLayer()?.batchDraw();
                    }
                  }}
                  onMouseLeave={(e) => {
                    setHoveredCellId((current) =>
                      current === cell.id ? null : current,
                    );
                    const target = (e as unknown as ShapeEvt).target;
                    target.stroke("#bdbdbd");
                    target.strokeWidth(1);
                    target.getLayer()?.batchDraw();
                    const stage = target.getStage();
                    if (stage) stage.container().style.cursor = "default";
                  }}
                  onClick={() => onSelect(cell)}
                  onTap={() => onSelect(cell)}
                />
                {/* The drawing plane is infinite; only the cell rectangle
                    is meaningful, so clip the strokes to it. */}
                <Group clipX={x} clipY={y} clipWidth={cellW} clipHeight={cellH}>
                  {strokes.map((stroke, strokeIndex) => (
                    <Line
                      key={`${cell.id}-stroke-${strokeIndex}`}
                      x={x}
                      y={y}
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
                </Group>
                {/* Dark cover of a closed finished cell; it fades out on
                    reveal and snaps back when the picture is hidden. */}
                {finished && (
                  <Rect
                    ref={(node) => {
                      if (node) {
                        overlayRefs.current.set(cell.id, node);
                      } else {
                        overlayRefs.current.delete(cell.id);
                      }
                    }}
                    x={x}
                    y={y}
                    width={cellW}
                    height={cellH}
                    fill="#212121"
                    listening={false}
                  />
                )}
                {/* Hover feedback: the cell darkens and its comment shows
                    in the middle of the cell. */}
                {hoveredCellId === cell.id && (
                  <Group listening={false}>
                    <Rect
                      x={x}
                      y={y}
                      width={cellW}
                      height={cellH}
                      fill={HOVER_FILL}
                    />
                    {cell.comment && (
                      <Text
                        x={x + 6}
                        y={y + 6}
                        width={cellW - 12}
                        height={cellH - 12}
                        text={cell.comment}
                        align="center"
                        verticalAlign="middle"
                        wrap="word"
                        fontSize={Math.min(14, Math.max(8, cellH / 6))}
                        fill="#ffffff"
                      />
                    )}
                  </Group>
                )}
                {!finished && isMine && cell.status === "empty" && (
                  <Text
                    x={x + 4}
                    y={y + 4}
                    text="🔒"
                    fontSize={Math.min(16, cellW / 4)}
                    listening={false}
                  />
                )}
              </g>
            );
          })}
        </Layer>
      </Stage>
    </Box>
  );
}