import { useMemo, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Link,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { fetchMySessions, fetchPublicFinished } from "../../api/sessions";
import type { SessionDTO } from "../../api/types";
import { useAuthStore } from "../../store/auth";
import JoinDialog from "./JoinDialog";

function statusColor(status: string) {
  if (status === "active") return "success";
  if (status === "finished") return "default";
  return "info";
}

function SessionCard({
  session,
  action,
}: {
  session: SessionDTO;
  action?: React.ReactNode;
}) {
  return (
    <Card variant="outlined" sx={{ minWidth: 260 }}>
      <CardContent sx={{ pb: 1 }}>
        <Typography variant="h6" gutterBottom>
          {session.name}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
          <Chip
            size="small"
            label={session.status}
            color={statusColor(session.status) as "success" | "default" | "info"}
          />
          {session.is_public && <Chip size="small" label="public" />}
        </Box>
        <Typography variant="body2" color="text.secondary">
          {session.grid_cols}×{session.grid_rows} · {session.players_count}{" "}
          players
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
        {action}
      </CardActions>
    </Card>
  );
}

/** Landing screen: the three blocks of sessions for the signed-in player. */
export default function SessionListPage() {
  const [tab, setTab] = useState(0);
  const [joinOpen, setJoinOpen] = useState(false);
  const username = useAuthStore((s) => s.username);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["sessions", "mine"],
    queryFn: fetchMySessions,
    refetchInterval: 5000,
  });

  const sessions = data ?? [];

  const { data: publicFinished } = useQuery({
    queryKey: ["sessions", "public"],
    queryFn: fetchPublicFinished,
    enabled: isAdmin && tab === 2,
  });

  const { unfinished, active } = useMemo(() => {
    const unfinished: SessionDTO[] = [];
    const active: SessionDTO[] = [];
    for (const s of sessions) {
      if (s.status === "active") active.push(s);
      else unfinished.push(s);
    }
    return { unfinished, active };
  }, [sessions]);

  function logout() {
    clear();
    navigate("/login");
  }

  if (isLoading) {
    return <CircularProgress sx={{ display: "block", mx: "auto", mt: 8 }} />;
  }

  const empty = sessions.length === 0;

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

      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Finished" />
        <Tab label="Active" />
        {isAdmin && <Tab label="All sessions" />}
      </Tabs>

      {empty && (
        <Typography color="text.secondary">
          You are not a member of any session yet.
        </Typography>
      )}

      {tab === 0 && (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {unfinished.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
          {!empty && unfinished.length === 0 && (
            <Typography color="text.secondary">Nothing here.</Typography>
          )}
        </Box>
      )}

      {tab === 1 && (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {active.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
          {active.length === 0 && (
            <Typography color="text.secondary">No active sessions.</Typography>
          )}
        </Box>
      )}

      {tab === 2 && isAdmin && (
        <>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {(publicFinished ?? []).map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
            {(publicFinished ?? []).length === 0 && (
              <Typography color="text.secondary">
                No public finished sessions.
              </Typography>
            )}
          </Box>
        </>
      )}

      <Divider sx={{ my: 3 }} />
      <Link component={RouterLink} to="/public" variant="body2">
        Browse public finished sessions as a spectator
      </Link>

      <JoinDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </Box>
  );
}