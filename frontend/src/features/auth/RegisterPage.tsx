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
import { extractApiMessage } from "../../shared/apiError";
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
      setError(extractApiMessage(err, "Registration failed."));
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

