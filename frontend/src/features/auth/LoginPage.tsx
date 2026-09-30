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
import { login } from "../../api/auth";
import { useAuthStore } from "../../store/auth";

/** Login screen: username + password. */
export default function LoginPage() {
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
      const res = await login(username, password);
      setSession(
        res.tokens.access,
        res.tokens.refresh,
        res.user.username,
        res.user.id,
        res.user.is_admin,
      );
      navigate("/");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail;
      setError(detail ?? "Invalid username or password.");
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
      <Typography variant="h5">Sign in</Typography>
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
      />
      <Button type="submit" variant="contained" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
      <Typography variant="body2">
        No account?{" "}
        <Link component={RouterLink} to="/register">
          Register
        </Link>
      </Typography>
      <Link component={RouterLink} to="/public" variant="body2">
        Browse public sessions
      </Link>
    </Box>
  );
}