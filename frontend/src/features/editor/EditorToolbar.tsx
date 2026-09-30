import { Box, Button, Slider, Tooltip, Typography } from "@mui/material";

export type EditorTool = "brush" | "eraser";

interface Props {
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  size: number;
  onSizeChange: (size: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

/** Vertical tool rail rendered on the left edge of the editor page. */
export default function EditorToolbar({
  tool,
  onToolChange,
  size,
  onSizeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
}: Props) {
  return (
    <Box
      sx={{
        width: 104,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1.5,
        py: 2,
        borderRight: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Button
        variant={tool === "brush" ? "contained" : "outlined"}
        onClick={() => onToolChange("brush")}
        fullWidth
      >
        Brush
      </Button>
      <Button
        variant={tool === "eraser" ? "contained" : "outlined"}
        onClick={() => onToolChange("eraser")}
        fullWidth
      >
        Eraser
      </Button>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
        Size: {size} px
      </Typography>
      <Box sx={{ height: 140, display: "flex", alignItems: "center" }}>
        <Slider
          orientation="vertical"
          value={size}
          min={1}
          max={40}
          onChange={(_, value) => onSizeChange(value as number)}
          aria-label="Brush size"
        />
      </Box>

      <Button
        onClick={onUndo}
        disabled={!canUndo}
        fullWidth
        sx={{ mt: 1 }}
      >
        Undo
      </Button>
      <Button onClick={onRedo} disabled={!canRedo} fullWidth>
        Redo
      </Button>
      <Tooltip title="Remove every stroke of this cell" placement="right">
        <Button onClick={onClear} fullWidth color="warning">
          Clear
        </Button>
      </Tooltip>
    </Box>
  );
}