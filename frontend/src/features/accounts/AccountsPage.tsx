import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { deleteUser, fetchUsers } from "../../api/accounts";
import type { UserAdminDTO } from "../../api/types";
import { extractApiMessage } from "../../shared/apiError";
import { useAuthStore } from "../../store/auth";

/**
 * Admin-only list of user accounts: registration dates, session counts and a
 * red delete button per row (never for administrators or for the caller).
 */
export default function AccountsPage() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const myUserId = useAuthStore((s) => s.userId);
  const queryClient = useQueryClient();

  const [target, setTarget] = useState<UserAdminDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
    enabled: isAdmin,
  });

  const deleteMut = useMutation({
    mutationFn: (userId: number) => deleteUser(userId),
    onSuccess: () => {
      setTarget(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => {
      setTarget(null);
      setError(extractApiMessage(err, "Could not delete the account."));
    },
  });

  if (!isAdmin) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Only administrators can manage accounts.
        </Alert>
        <Button sx={{ mt: 2 }} component={RouterLink} to="/">
          Back to sessions
        </Button>
      </Box>
    );
  }

  const users = usersQuery.data ?? [];

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
        <Typography variant="h5">Accounts</Typography>
        <Button component={RouterLink} to="/" size="small">
          Back to sessions
        </Button>
      </Box>

      {error != null && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {usersQuery.isLoading && (
        <CircularProgress sx={{ display: "block", mx: "auto", mt: 8 }} />
      )}

      {usersQuery.isError != null && usersQuery.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Could not load users.
        </Alert>
      )}

      {!usersQuery.isLoading && !usersQuery.isError && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Username</TableCell>
                <TableCell>Registered</TableCell>
                <TableCell align="right">Owned sessions</TableCell>
                <TableCell align="right">Participant sessions</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => {
                const canDelete = !user.is_admin && user.id !== myUserId;
                return (
                  <TableRow key={user.id} hover>
                    <TableCell>
                      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                        {user.username}
                        {user.is_admin && (
                          <Chip size="small" label="admin" color="info" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="right">
                      {user.owned_sessions_count}
                    </TableCell>
                    <TableCell align="right">
                      {user.player_sessions_count}
                    </TableCell>
                    <TableCell align="right">
                      {canDelete && (
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          onClick={() => setTarget(user)}
                        >
                          Delete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={target != null} onClose={() => setTarget(null)}>
        <DialogTitle>Delete account?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete <b>{target?.username}</b> together
            with the sessions they created. This action is irreversible.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteMut.isPending}
            onClick={() => target && deleteMut.mutate(target.id)}
          >
            {deleteMut.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}