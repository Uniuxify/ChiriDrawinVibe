import { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Link,
  Typography,
} from "@mui/material";
import { fetchMySessions, fetchPublicFinished } from "../../api/sessions";
import type { SessionDTO } from "../../api/types";
import { useAuthStore } from "../../store/auth";
import JoinDialog from "./JoinDialog";

/** Map a lifecycle status to a chip colour. */
function statusColor(status: string): "success" | "default" | "info" {
  if (status === "active") return "success";
  if (status === "finished") return "default";
  return "info";
}

/** Card representing one session in the list. */
function SessionCard({ session }: { session: SessionDTO }) {
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
      </CardActions>
    </Card>
  );
}

/** A titled section holding a list of session cards. */
function SessionBlock({
  title,
  sessions,
  emptyText,
}: {
  title: string;
  sessions: SessionDTO[];
  emptyText: string;
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
            <SessionCard key={s.id} session={s} />
          ))}
        </Box>
      )}
    </Box>
  );
}

/** Landing screen with the three session blocks for the signed-in player. */
export default function SessionListPage() {
  const [joinOpen, setJoinOpen] = useState(false);
  const username = useAuthStore((s) => s.username);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

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

  function logout() {
    clear();
    navigate("/login");
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
          <Typography variant="body2">{username}</Typography>
          <Button size="small" onClick={logout}>
            Sign out
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
        {isAdmin && (
          <Button variant="contained" component={RouterLink} to="/sessions/new">
            New session
          </Button>
        )}
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

      {!isLoading && error == null && empty && (
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          You are not a member of any session yet.
        </Typography>
      )}

      {!isLoading && error == null && (
        <>
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

      <JoinDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </Box>
  );
}