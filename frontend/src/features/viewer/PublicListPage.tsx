import { Link as RouterLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CircularProgress,
  Link,
  Typography,
} from "@mui/material";
import { fetchPublicFinished } from "../../api/sessions";
import type { SessionDTO } from "../../api/types";

/** Anonymous gallery of public finished sessions. */
export default function PublicListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["sessions", "public", "all"],
    queryFn: fetchPublicFinished,
  });

  const sessions = data ?? [];

  return (
    <Box sx={{ maxWidth: 960, mx: "auto", p: 3 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h5">Public gallery</Typography>
        <Button component={RouterLink} to="/" size="small">
          Home
        </Button>
      </Box>

      {isLoading && (
        <CircularProgress sx={{ display: "block", mx: "auto", mt: 8 }} />
      )}

      {!isLoading && sessions.length === 0 && (
        <Typography color="text.secondary">
          No public finished sessions yet.
        </Typography>
      )}

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        }}
      >
        {sessions.map((s: SessionDTO) => (
          <Card key={s.id} variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="h6">{s.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {s.grid_cols}×{s.grid_rows} ·{" "}
                {s.finished_at
                  ? `finished ${new Date(s.finished_at).toLocaleDateString()}`
                  : ""}
              </Typography>
            </CardContent>
            <CardActions>
              <Button
                size="small"
                component={RouterLink}
                to={`/sessions/${s.id}`}
              >
                View
              </Button>
            </CardActions>
          </Card>
        ))}
      </Box>

      <Link
        component={RouterLink}
        to="/login"
        variant="body2"
        sx={{ display: "block", mt: 3 }}
      >
        Sign in to play
      </Link>
    </Box>
  );
}