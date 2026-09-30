import { Box, Tooltip, Typography } from "@mui/material";

/** Default drawing palette. */
const PALETTE = [
  "#000000",
  "#ffffff",
  "#f44336",
  "#ff9800",
  "#ffeb3b",
  "#4caf50",
  "#2196f3",
  "#9c27b0",
];

interface Props {
  color: string;
  onColorChange: (color: string) => void;
}

/** Vertical colour picker rendered on the right edge of the editor page. */
export default function ColorPalette({ color, onColorChange }: Props) {
  return (
    <Box
      sx={{
        width: 72,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1.25,
        py: 2,
        borderLeft: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Typography variant="caption" color="text.secondary">
        Colors
      </Typography>
      {PALETTE.map((swatch) => (
        <Tooltip key={swatch} title={swatch} placement="left">
          <Box
            role="button"
            tabIndex={0}
            aria-label={`Color ${swatch}`}
            onClick={() => onColorChange(swatch)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                onColorChange(swatch);
              }
            }}
            sx={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              bgcolor: swatch,
              cursor: "pointer",
              border: color === swatch ? "3px solid #2196f3" : "1px solid #cccccc",
              boxShadow: color === swatch ? 2 : 0,
            }}
          />
        </Tooltip>
      ))}
    </Box>
  );
}