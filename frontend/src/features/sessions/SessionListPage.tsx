import { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  Typography,
} from "@mui/material";
import {
  deleteSession,
  fetchMySessions,
  fetchPublicFinished,
} from "../../api/sessions";
import type { SessionDTO } from "../../api/types";
import { extractApiMessage } from "../../shared/apiError";
import { useAuthStore } from "../../store/auth";
import JoinDialog from "./JoinDialog";

/** Map a lifecycle status to a chip colour. */
function statusColor(status: string): "success" | "default" | "info" {
  if (status === "active") return "success";
  if (status === "finished") return "default";
  return "info";
}

/** Card representing one session in the list. */
function SessionCard({
  session,
  onDelete,
}: {
  session: SessionDTO;
  onDelete?: (session: SessionDTO) => void;
}) {
  const joined = session.players?.length;
  const playersLabel =
    joined === undefined
      ? `${session.players_count} players`
      : `${joined} / ${session.players_count} players joined`;
  return (
    <Card variant="outlined" sx={{ minWidth: 260 }}>
      <CardContent sx={{ pb: 1 }}>
        <Typography variant="h6" gutterBottom>
          {session.name}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
          <Chip size="small" label={session.status} color={statusColor(session.status)} />
          {session.is_public && <Chip size="small" label="public" />}
        </Box>
        <Typography variant="body2" color="text.secondary">
          {session.grid_cols}×{session.grid_rows} · {playersLabel}
        </Typography>
      </CardContent>
      <CardActions>
        <Button
          size="small"
          component={RouterLink}
          to={`/sessions/${session.id}`}
        >
          Open
        </Button>
        {onDelete && (
          <Button
            size="small"
            color="error"
            onClick={() => onDelete(session)}
            sx={{ ml: "auto" }}
          >
            Delete
          </Button>
        )}
      </CardActions>
    </Card>
  );
}

/** A titled section holding a list of session cards. */
function SessionBlock({
  title,
  sessions,
  emptyText,
  onDelete,
}: {
  title: string;
  sessions: SessionDTO[];
  emptyText: string;
  onDelete?: (session: SessionDTO) => void;
}) {
  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="subtitle1" gutterBottom>
        {title} ({sessions.length})
      </Typography>
      {sessions.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {emptyText}
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          }}
        >
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} onDelete={onDelete} />
          ))}
        </Box>
      )}
    </Box>
  );
}

/** Landing screen with the three session blocks for the signed-in player. */
export default function SessionListPage() {
  const [joinOpen, setJoinOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SessionDTO | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const username = useAuthStore((s) => s.username);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const myUserId = useAuthStore((s) => s.userId);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sessions", "mine"],
    queryFn: fetchMySessions,
    refetchInterval: 5000,
  });

  const { data: publicFinished } = useQuery({
    queryKey: ["sessions", "public"],
    queryFn: fetchPublicFinished,
    enabled: isAdmin,
  });

  const drafts = data?.drafts ?? [];
  const active = data?.active ?? [];
  const finished = data?.finished ?? [];
  const empty = drafts.length === 0 && active.length === 0 && finished.length === 0;
  const ownedSessions = [...drafts, ...active, ...finished].filter(
    (session) => session.owner === myUserId,
  );

  function logout() {
    clear();
    navigate("/login");
  }

  const deleteMut = useMutation({
    mutationFn: (session: SessionDTO) => deleteSession(session.id),
    onSuccess: () => {
      setDeleteTarget(null);
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["sessions", "mine"] });
    },
    onError: (err) => {
      setDeleteTarget(null);
      setActionError(extractApiMessage(err, "Could not delete the session."));
    },
  });

  /** Drafts vanish immediately; every other state asks for confirmation. */
  function requestDelete(session: SessionDTO) {
    if (session.status === "draft") {
      deleteMut.mutate(session);
      return;
    }
    setDeleteTarget(session);
  }

  return (
    <Box sx={{ maxWidth: 960, mx: "auto", p: 3 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="h5">ChiriDrawin</Typography>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          {isAdmin && (
            <Button
              size="small"
              variant="outlined"
              component={RouterLink}
              to="/accounts"
            >
              Accounts
            </Button>
          )}
          <Typography variant="body2">{username}</Typography>
          <Button size="small" onClick={logout}>
            Sign out
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
        <Button variant="contained" component={RouterLink} to="/sessions/new">
          New session
        </Button>
        <Button variant="outlined" onClick={() => setJoinOpen(true)}>
          Join by code
        </Button>
        <Button
          variant="text"
          component={RouterLink}
          to="/public"
          sx={{ ml: "auto" }}
        >
          Public gallery
        </Button>
      </Box>

      {isLoading && (
        <CircularProgress sx={{ display: "block", mx: "auto", mt: 8 }} />
      )}

      {error != null && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }
        >
          Could not load your sessions.
        </Alert>
      )}

      {actionError != null && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => setActionError(null)}
        >
          {actionError}
        </Alert>
      )}

      {!isLoading && error == null && empty && (
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          You are not a member of any session yet.
        </Typography>
      )}

      {!isLoading && error == null && (
        <>
          <SessionBlock
            title="Your Sessions"
            sessions={ownedSessions}
            emptyText="You have not created any session yet."
            onDelete={requestDelete}
          />
          <SessionBlock
            title="Drafts"
            sessions={drafts}
            emptyText="No draft sessions."
          />
          <SessionBlock
            title="Active sessions"
            sessions={active}
            emptyText="No active sessions."
          />
          <SessionBlock
            title="Finished sessions"
            sessions={finished}
            emptyText="No finished sessions yet."
          />

          {isAdmin && (
            <SessionBlock
              title="Public finished sessions (admin)"
              sessions={publicFinished ?? []}
              emptyText="No public finished sessions."
            />
          )}
        </>
      )}

      <Link component={RouterLink} to="/public" variant="body2">
        Browse public finished sessions as a spectator
      </Link>

      {/* Session deletion confirmation (never shown for drafts) */}
      <Dialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
      >
        <DialogTitle>Delete this session?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            “{deleteTarget?.name}” and all of its cells will be permanently
            removed. This action is irreversible.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteMut.isPending}
            onClick={() => deleteTarget && deleteMut.mutate(deleteTarget)}
          >
            {deleteMut.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <JoinDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </Box>
  );
}