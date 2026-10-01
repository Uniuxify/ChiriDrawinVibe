import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import {
  clearDebugEntries,
  getDebugEntries,
  isDebugEnabled,
  setDebugEnabled,
  subscribeDebug,
  type DebugEntry,
} from "../../shared/debug";

/** Collapsible on-screen viewer for the in-app debug log.
 *
 * Renders a fixed panel in the lower-right corner. It stays available in all
 * screens so the captured flow (API calls, context payloads, history fetches)
 * can be inspected without opening the browser console.
 */
export default function DebugPanel() {
  const [enabled, setEnabled] = useState(isDebugEnabled());
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<DebugEntry[]>(getDebugEntries());

  useEffect(() => subscribeDebug(setEntries), []);

  function toggleEnabled(value: boolean) {
    setDebugEnabled(value);
    setEnabled(value);
  }

  return (
    <Box
      sx={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: 2000,
        maxWidth: 520,
      }}
    >
      {open && (
        <Paper
          elevation={6}
          sx={{
            mb: 1,
            maxHeight: 360,
            width: 520,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider" }}
          >
            <Typography variant="subtitle2" sx={{ flex: 1 }}>
              Debug log ({entries.length})
            </Typography>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography variant="caption">on</Typography>
              <Switch
                size="small"
                checked={enabled}
                onChange={(event) => toggleEnabled(event.target.checked)}
              />
            </Stack>
            <Button size="small" onClick={() => clearDebugEntries()}>
              Clear
            </Button>
          </Stack>
          <Box sx={{ overflow: "auto", p: 1 }}>
            {entries.length === 0 && (
              <Typography variant="caption" color="text.secondary">
                No debug events yet.
              </Typography>
            )}
            {entries.map((entry) => (
              <Box
                key={entry.id}
                sx={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  lineHeight: 1.35,
                  mb: 0.5,
                  color:
                    entry.level === "error"
                      ? "error.main"
                      : entry.level === "warn"
                        ? "warning.main"
                        : "text.primary",
                }}
              >
                <Chip
                  size="small"
                  label={entry.namespace}
                  sx={{ height: 16, mr: 0.5, fontSize: 10 }}
                />
                {entry.time} {entry.message}
                {entry.data !== undefined && entry.data !== null && (
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      color: "text.secondary",
                    }}
                  >
                    {safeStringify(entry.data)}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </Paper>
      )}
      <Box sx={{ textAlign: "right" }}>
        <IconButton
          size="small"
          onClick={() => setOpen((value) => !value)}
          sx={{
            bgcolor: "primary.main",
            color: "primary.contrastText",
            "&:hover": { bgcolor: "primary.dark" },
          }}
        >
          {open ? "▾" : "🐞"}
        </IconButton>
      </Box>
    </Box>
  );
}

/** Serialise arbitrary debug payloads without throwing on cycles. */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}