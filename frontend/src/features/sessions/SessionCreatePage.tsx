import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { createSession, fetchConfig } from "../../api/sessions";
import type {
  ContextRadiusMode,
  ContextShape,
  DistributionStrategy,
} from "../../api/types";
import { extractApiMessage } from "../../shared/apiError";

interface FormState {
  name: string;
  canvas_width: number;
  canvas_height: number;
  grid_cols: number;
  grid_rows: number;
  players_count: number;
  interval_seconds: number;
  unlock_quota: number;
  context_shape: ContextShape;
  context_radius_mode: ContextRadiusMode;
  context_radius_pct: number;
  distribution_strategy: DistributionStrategy;
  is_public: boolean;
}

const initial: FormState = {
  name: "",
  canvas_width: 512,
  canvas_height: 512,
  grid_cols: 4,
  grid_rows: 4,
  players_count: 2,
  interval_seconds: 86400,
  unlock_quota: 1,
  context_shape: "rectangle",
  context_radius_mode: "min",
  context_radius_pct: 0,
  distribution_strategy: "random",
  is_public: false,
};

/** Admin form for creating a new drawing session. */
export default function SessionCreatePage() {
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: fetchConfig,
    staleTime: Infinity,
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await createSession(form);
      navigate(`/sessions/${session.id}`);
    } catch (err) {
      setError(extractApiMessage(err, "Could not create the session."));
    } finally {
      setLoading(false);
    }
  }

  const minSize = config?.min_canvas_size ?? 100;
  const maxSize = config?.max_canvas_size ?? 10000;
  const minGrid = config?.min_grid ?? 2;
  const maxGrid = config?.max_grid ?? 100;

  return (
    <Box sx={{ maxWidth: 640, mx: "auto", p: 3 }}>
      <Typography variant="h5" gutterBottom>
        New session
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{ display: "grid", gap: 2 }}
      >
        <TextField
          label="Name"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          required
        />

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          <TextField
            label="Canvas width (px)"
            type="number"
            value={form.canvas_width}
            inputProps={{ min: minSize, max: maxSize }}
            onChange={(e) => update("canvas_width", Number(e.target.value))}
            required
          />
          <TextField
            label="Canvas height (px)"
            type="number"
            value={form.canvas_height}
            inputProps={{ min: minSize, max: maxSize }}
            onChange={(e) => update("canvas_height", Number(e.target.value))}
            required
          />
          <TextField
            label="Grid columns"
            type="number"
            value={form.grid_cols}
            inputProps={{ min: minGrid, max: maxGrid }}
            onChange={(e) => update("grid_cols", Number(e.target.value))}
            required
          />
          <TextField
            label="Grid rows"
            type="number"
            value={form.grid_rows}
            inputProps={{ min: minGrid, max: maxGrid }}
            onChange={(e) => update("grid_rows", Number(e.target.value))}
            required
          />
          <TextField
            label="Players"
            type="number"
            value={form.players_count}
            inputProps={{ min: 1 }}
            onChange={(e) => update("players_count", Number(e.target.value))}
            required
          />
          <TextField
            label="Interval (seconds)"
            type="number"
            value={form.interval_seconds}
            inputProps={{ min: 60 }}
            onChange={(e) => update("interval_seconds", Number(e.target.value))}
            required
          />
          <TextField
            label="Unlock quota"
            type="number"
            value={form.unlock_quota}
            inputProps={{ min: 1 }}
            onChange={(e) => update("unlock_quota", Number(e.target.value))}
            required
          />
        </Box>

        <FormControl fullWidth>
          <InputLabel id="shape-label">Context shape</InputLabel>
          <Select
            labelId="shape-label"
            label="Context shape"
            value={form.context_shape}
            onChange={(e) => update("context_shape", e.target.value as ContextShape)}
          >
            <MenuItem value="rectangle">Rectangle</MenuItem>
            <MenuItem value="circle">Circle</MenuItem>
          </Select>
        </FormControl>

        <FormControl fullWidth>
          <InputLabel id="radius-mode-label">Context radius</InputLabel>
          <Select
            labelId="radius-mode-label"
            label="Context radius"
            value={form.context_radius_mode}
            onChange={(e) =>
              update("context_radius_mode", e.target.value as ContextRadiusMode)
            }
          >
            <MenuItem value="min">Min</MenuItem>
            <MenuItem value="max">Max</MenuItem>
            <MenuItem value="percent">Percent</MenuItem>
          </Select>
        </FormControl>

        {form.context_radius_mode === "percent" && (
          <TextField
            label="Radius %"
            type="number"
            value={form.context_radius_pct}
            inputProps={{ min: 0, max: 100 }}
            onChange={(e) =>
              update("context_radius_pct", Number(e.target.value))
            }
          />
        )}

        <FormControl fullWidth>
          <InputLabel id="dist-label">Distribution</InputLabel>
          <Select
            labelId="dist-label"
            label="Distribution"
            value={form.distribution_strategy}
            onChange={(e) =>
              update(
                "distribution_strategy",
                e.target.value as DistributionStrategy,
              )
            }
          >
            <MenuItem value="random">Random</MenuItem>
            <MenuItem value="min_adjacent">Min adjacent</MenuItem>
          </Select>
        </FormControl>

        <FormControlLabel
          control={
            <Switch
              checked={form.is_public}
              onChange={(e) => update("is_public", e.target.checked)}
            />
          }
          label="Public"
        />

        <Box sx={{ display: "flex", gap: 2 }}>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? "Creating…" : "Create draft"}
          </Button>
          <Button onClick={() => navigate("/")}>Cancel</Button>
        </Box>
      </Box>
    </Box>
  );
}

