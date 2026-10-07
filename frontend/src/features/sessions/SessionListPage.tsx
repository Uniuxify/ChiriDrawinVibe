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
import { deleteSession, fetchMySessions } from "../../api/sessions";
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

/** Tags available for filtering the session lists. */
const SPECIFIC_TAGS = ["your", "draft", "active", "finished"] as const;
const FILTER_TAGS = ["all", ...SPECIFIC_TAGS] as const;

type FilterTag = (typeof FILTER_TAGS)[number];

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

/** Landing screen with the session list and its tag filter for the player. */
export default function SessionListPage() {
  const [joinOpen, setJoinOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SessionDTO | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTags, setActiveTags] = useState<Set<FilterTag>>(
    () => new Set(FILTER_TAGS),
  );
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

  const allSessions = [
    ...(data?.drafts ?? []),
    ...(data?.active ?? []),
    ...(data?.finished ?? []),
  ];
  const visibleSessions = allSessions.filter(matchesFilter);

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

  /**
   * Toggle a filter tag.
   *
   * Switching a specific tag off also leaves the "all" mode (otherwise
   * everything would stay visible). Enabling "all" enables every other tag,
   * and enabling the last specific tag turns "all" on automatically.
   */
  function toggleTag(tag: FilterTag) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
        if (tag !== "all") next.delete("all");
        return next;
      }
      next.add(tag);
      if (tag === "all") {
        for (const specific of SPECIFIC_TAGS) next.add(specific);
      } else if (SPECIFIC_TAGS.every((t) => next.has(t))) {
        next.add("all");
      }
      return next;
    });
  }

  /**
   * A session is visible while "all" is active or one of its own tags
   * (status, ownership) is active.
   */
  function matchesFilter(session: SessionDTO): boolean {
    if (activeTags.has("all")) return true;
    if (session.owner === myUserId && activeTags.has("your")) return true;
    const statusTag = session.status as FilterTag;
    return FILTER_TAGS.includes(statusTag) && activeTags.has(statusTag);
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

      {/* Session filter tags: blue while active, grey once switched off. */}
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        {FILTER_TAGS.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            onClick={() => toggleTag(tag)}
            color={activeTags.has(tag) ? "primary" : "default"}
            sx={{ textTransform: "capitalize" }}
          />
        ))}
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

      {!isLoading && error == null && allSessions.length === 0 && (
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          You are not a member of any session yet.
        </Typography>
      )}

      {!isLoading && error == null && allSessions.length > 0 && (
        visibleSessions.length === 0 ? (
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            No sessions match the selected tags.
          </Typography>
        ) : (
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              mb: 4,
            }}
          >
            {visibleSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onDelete={
                  session.owner === myUserId ? requestDelete : undefined
                }
              />
            ))}
          </Box>
        )
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