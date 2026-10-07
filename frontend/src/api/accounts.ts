/** Admin-only accounts API calls. */

import { api } from "./client";
import type { UserAdminDTO } from "./types";

/** Fetch all users together with their session statistics. */
export async function fetchUsers(): Promise<UserAdminDTO[]> {
  const { data } = await api.get<UserAdminDTO[]>("/users");
  return data;
}

/** Delete a user account. Administrators cannot be deleted. */
export async function deleteUser(userId: number): Promise<void> {
  await api.delete(`/users/${userId}`);
}