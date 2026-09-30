import { useQueries } from "@tanstack/react-query";
import type Konva from "konva";
import { Layer, Line, Rect, Stage, Text } from "react-konva";
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

/**
 * Renders the session grid: cell states, drawings, ownership hints and hover
 * borders.
 *
 * A filled cell shows its committed drawing when it is visible to the user:
 * every revealed cell of a finished session, and only the caller's own cells
 * while the session is still running.
 */
export default function SessionCanvas({
  session,
  cells,
  myUserId,
  onSelect,
  revealed,
  isAdminMode,
}: Props) {
  const cellW = session.canvas_width / session.grid_cols;
  const cellH = session.canvas_height / session.grid_rows;
  const finished = session.status === "finished";

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

  return (
    <Stage
      width={session.canvas_width}
      height={session.canvas_height}
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
            // Closed cells stay dark until revealed by a click.
            const open = (revealed?.has(cell.id) ?? false) || !!isAdminMode;
            fill = open
              ? cell.status === "filled"
                ? "#ffffff"
                : "#f5f5f5"
              : "#212121";
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
  );
}