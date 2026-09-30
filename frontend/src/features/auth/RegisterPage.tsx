import { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Link,
  TextField,
  Typography,
} from "@mui/material";
import { register } from "../../api/auth";
import { useAuthStore } from "../../store/auth";

/** Registration screen: username + password. */
export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await register(username, password);
      setSession(
        res.tokens.access,
        res.tokens.refresh,
        res.user.username,
        res.user.id,
        res.user.is_admin,
      );
      navigate("/");
    } catch (err) {
      const data = (err as { response?: { data?: unknown } })?.response?.data;
      setError(formatError(data) ?? "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{ maxWidth: 360, mx: "auto", mt: 8, display: "grid", gap: 2 }}
    >
      <Typography variant="h5">Create account</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField
        label="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
        autoFocus
      />
      <TextField
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        helperText="At least 8 characters."
      />
      <Button type="submit" variant="contained" disabled={loading}>
        {loading ? "Creating…" : "Register"}
      </Button>
      <Typography variant="body2">
        Already have an account?{" "}
        <Link component={RouterLink} to="/login">
          Sign in
        </Link>
      </Typography>
    </Box>
  );
}

/** Extract a human-readable message from an API error payload. */
function formatError(data: unknown): string | null {
  if (typeof data === "string") {
    return data;
  }
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.detail === "string") {
      return record.detail;
    }
    if (typeof record.username === "object") {
      const list = record.username as string[];
      return list.join(" ");
    }
    if (typeof record.password === "object") {
      const list = record.password as string[];
      return list.join(" ");
    }
    if (typeof record.non_field_errors === "object") {
      const list = record.non_field_errors as string[];
      return list.join(" ");
    }
  }
  return null;
}