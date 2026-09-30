import type Konva from "konva";
import { Layer, Rect, Stage, Text } from "react-konva";
import type { CellDTO, SessionDTO } from "../../api/types";

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
 * Renders the session grid: cell states, ownership hints and hover borders.
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

  return (
    <Stage
      width={session.canvas_width}
      height={session.canvas_height}
      style={{ border: "1px solid #bdbdbd", background: "#fafafa" }}
    >
      <Layer>
        {cells.map((cell) => {
          const x = cell.col * cellW;
          const y = cell.row * cellH;

          let fill = STATUS_FILL[cell.status] ?? "#ffffff";

          if (finished) {
            // Closed cells stay dark until revealed by a click.
            const open = (revealed?.has(cell.id) ?? false) || !!isAdminMode;
            fill = open
              ? cell.status === "filled"
                ? "#ffffff"
                : "#f5f5f5"
              : "#212121";
          } else if (cell.status === "empty" && cell.owner !== myUserId) {
            // Other players' unfinished cells are black.
            fill = "#212121";
          } else if (
            cell.status === "empty" &&
            cell.owner === myUserId
          ) {
            fill = "#9e9e9e";
          }

          const isMine = cell.owner === myUserId;

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