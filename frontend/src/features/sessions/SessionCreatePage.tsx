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
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { createSession, fetchConfig } from "../../api/sessions";
import type {
  ContextShape,
  DistributionStrategy,
} from "../../api/types";
import { extractApiMessage } from "../../shared/apiError";
import ContextPreview from "./ContextPreview";

/**
 * Raw form state. Numeric fields are kept as strings so the user can clear
 * them completely while editing; they are parsed on submit.
 */
interface FormState {
  name: string;
  canvas_width: string;
  canvas_height: string;
  grid_cols: string;
  grid_rows: string;
  players_count: string;
  interval_seconds: string;
  unlock_quota: string;
  context_shape: ContextShape;
  context_radius_pct: number;
  distribution_strategy: DistributionStrategy;
  is_public: boolean;
}

const initial: FormState = {
  name: "",
  canvas_width: "512",
  canvas_height: "512",
  grid_cols: "4",
  grid_rows: "4",
  players_count: "2",
  interval_seconds: "86400",
  unlock_quota: "1",
  context_shape: "rectangle",
  context_radius_pct: 0,
  distribution_strategy: "random",
  is_public: false,
};

/** A field validated as a number with an optional inclusive range. */
interface NumberRule {
  min: number;
  max?: number;
}

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

  const minSize = config?.min_canvas_size ?? 100;
  const maxSize = config?.max_canvas_size ?? 10000;
  const minGrid = config?.min_grid ?? 2;
  const maxGrid = config?.max_grid ?? 100;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /** Replace an empty numeric field with "0" when it loses focus. */
  function onNumberBlur(key: keyof FormState) {
    setForm((f) => {
      const value = f[key];
      if (typeof value === "string" && value.trim() === "") {
        return { ...f, [key]: "0" };
      }
      return f;
    });
  }

  /** Validate a numeric field, returning an error message or null. */
  function validateNumber(
    raw: string,
    { min, max }: NumberRule,
  ): string | null {
    if (raw.trim() === "") {
      return "This field is required.";
    }
    const value = Number(raw);
    if (Number.isNaN(value)) {
      return "Enter a valid number.";
    }
    if (value < min) {
      return `The value must be at least ${min}.`;
    }
    if (max !== undefined && value > max) {
      return `The value must be at most ${max}.`;
    }
    return null;
  }

  const cellCount =
    Number(form.grid_cols) * Number(form.grid_rows) || undefined;

  const errors: Partial<Record<keyof FormState, string>> = {
    canvas_width: validateNumber(form.canvas_width, { min: minSize, max: maxSize }) ?? undefined,
    canvas_height: validateNumber(form.canvas_height, { min: minSize, max: maxSize }) ?? undefined,
    grid_cols: validateNumber(form.grid_cols, { min: minGrid, max: maxGrid }) ?? undefined,
    grid_rows: validateNumber(form.grid_rows, { min: minGrid, max: maxGrid }) ?? undefined,
    players_count:
      validateNumber(form.players_count, { min: 1, max: cellCount }) ?? undefined,
    interval_seconds:
      validateNumber(form.interval_seconds, { min: 0 }) ?? undefined,
    unlock_quota: validateNumber(form.unlock_quota, { min: 1 }) ?? undefined,
  };

  const nameError = form.name.trim() === "" ? "Name is required." : undefined;
  if (nameError) errors.name = nameError;

  // Count only fields that actually have an error. Using Object.keys() here
  // would always report an error because every key exists (with undefined).
  const hasErrors = Object.values(errors).some(Boolean);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (hasErrors) return;
    setLoading(true);
    try {
      const session = await createSession({
        name: form.name.trim(),
        canvas_width: Number(form.canvas_width),
        canvas_height: Number(form.canvas_height),
        grid_cols: Number(form.grid_cols),
        grid_rows: Number(form.grid_rows),
        players_count: Number(form.players_count),
        interval_seconds: Number(form.interval_seconds),
        unlock_quota: Number(form.unlock_quota),
        context_shape: form.context_shape,
        context_radius_mode: "percent",
        context_radius_pct: form.context_radius_pct,
        distribution_strategy: form.distribution_strategy,
        is_public: form.is_public,
      });
      navigate(`/sessions/${session.id}`);
    } catch (err) {
      setError(extractApiMessage(err, "Could not create the session."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", p: 3 }}>
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
          error={Boolean(errors.name)}
          helperText={errors.name}
          required
        />

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          <TextField
            label="Canvas width (px)"
            type="number"
            value={form.canvas_width}
            inputProps={{ min: minSize, max: maxSize }}
            onChange={(e) => update("canvas_width", e.target.value)}
            onBlur={() => onNumberBlur("canvas_width")}
            error={Boolean(errors.canvas_width)}
            helperText={errors.canvas_width}
            required
          />
          <TextField
            label="Canvas height (px)"
            type="number"
            value={form.canvas_height}
            inputProps={{ min: minSize, max: maxSize }}
            onChange={(e) => update("canvas_height", e.target.value)}
            onBlur={() => onNumberBlur("canvas_height")}
            error={Boolean(errors.canvas_height)}
            helperText={errors.canvas_height}
            required
          />
          <TextField
            label="Grid columns"
            type="number"
            value={form.grid_cols}
            inputProps={{ min: minGrid, max: maxGrid }}
            onChange={(e) => update("grid_cols", e.target.value)}
            onBlur={() => onNumberBlur("grid_cols")}
            error={Boolean(errors.grid_cols)}
            helperText={errors.grid_cols}
            required
          />
          <TextField
            label="Grid rows"
            type="number"
            value={form.grid_rows}
            inputProps={{ min: minGrid, max: maxGrid }}
            onChange={(e) => update("grid_rows", e.target.value)}
            onBlur={() => onNumberBlur("grid_rows")}
            error={Boolean(errors.grid_rows)}
            helperText={errors.grid_rows}
            required
          />
          <TextField
            label="Max Players"
            type="number"
            value={form.players_count}
            inputProps={{ min: 1 }}
            onChange={(e) => update("players_count", e.target.value)}
            onBlur={() => onNumberBlur("players_count")}
            error={Boolean(errors.players_count)}
            helperText={errors.players_count}
            required
          />
          <TextField
            label="Interval (seconds)"
            type="number"
            value={form.interval_seconds}
            inputProps={{ min: 0 }}
            onChange={(e) => update("interval_seconds", e.target.value)}
            onBlur={() => onNumberBlur("interval_seconds")}
            error={Boolean(errors.interval_seconds)}
            helperText={errors.interval_seconds ?? "0 waits for all players."}
            required
          />
          <TextField
            label="Unlock quota"
            type="number"
            value={form.unlock_quota}
            inputProps={{ min: 1 }}
            onChange={(e) => update("unlock_quota", e.target.value)}
            onBlur={() => onNumberBlur("unlock_quota")}
            error={Boolean(errors.unlock_quota)}
            helperText={errors.unlock_quota}
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

        <Box sx={{ display: "flex", gap: 3, alignItems: "center" }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Context radius: {form.context_radius_pct}%
            </Typography>
            <Slider
              value={form.context_radius_pct}
              onChange={(_, value) =>
                update("context_radius_pct", value as number)
              }
              min={0}
              max={100}
              valueLabelDisplay="auto"
              aria-label="Context radius percent"
            />
            <Typography variant="caption" color="text.secondary">
              0% matches the cell; 100% reaches the neighbouring cells.
            </Typography>
          </Box>
          <ContextPreview
            shape={form.context_shape}
            radiusPct={form.context_radius_pct}
          />
        </Box>

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

        <Stack direction="row" spacing={2}>
          <Button
            type="submit"
            variant="contained"
            disabled={loading || hasErrors}
          >
            {loading ? "Creating…" : "Create draft"}
          </Button>
          <Button onClick={() => navigate("/")}>Cancel</Button>
        </Stack>
      </Box>
    </Box>
  );
}