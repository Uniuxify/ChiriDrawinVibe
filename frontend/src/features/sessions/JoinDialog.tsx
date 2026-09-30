import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { joinSession } from "../../api/sessions";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Dialog that joins a draft session by its join code. */
export default function JoinDialog({ open, onClose }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleJoin() {
    setError(null);
    setLoading(true);
    try {
      const session = await joinSession(code);
      await queryClient.invalidateQueries({ queryKey: ["sessions", "mine"] });
      onClose();
      setCode("");
      navigate(`/sessions/${session.id}`);
    } catch (err) {
      setError(extract(err) ?? "Could not join the session.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Join a session</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "12px !important" }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Join code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
          autoFocus
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleJoin}
          variant="contained"
          disabled={loading || code.trim().length === 0}
        >
          {loading ? "Joining…" : "Join"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Extract a human-readable message from an API error. */
function extract(err: unknown): string | null {
  const data = (err as { response?: { data?: { detail?: string } } })?.response
    ?.data;
  return data?.detail ?? null;
}