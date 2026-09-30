import { useState } from "react";
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
import { api } from "../../api/client";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Dialog that joins a draft session by its code. */
export default function JoinDialog({ open, onClose }: Props) {
  const [sessionId, setSessionId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleJoin() {
    setError(null);
    setLoading(true);
    try {
      await api.post(`/sessions/${Number(sessionId)}/join`, {
        join_code: code.trim(),
      });
      onClose();
      navigate(`/sessions/${sessionId}`);
    } catch (err) {
      const detail = (
        err as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail;
      setError(detail ?? "Could not join the session.");
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
          label="Session ID"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          type="number"
          required
        />
        <TextField
          label="Join code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleJoin}
          variant="contained"
          disabled={loading || !sessionId || !code}
        >
          {loading ? "Joining…" : "Join"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}