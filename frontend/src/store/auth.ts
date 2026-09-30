/** Zustand store for the JWT session. */

import { create } from "zustand";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  username: string | null;
  userId: number | null;
  isAdmin: boolean;
  setSession: (
    access: string,
    refresh: string,
    username: string,
    userId: number,
    isAdmin: boolean,
  ) => void;
  setTokens: (access: string, refresh: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  username: null,
  userId: null,
  isAdmin: false,
  setSession: (access, refresh, username, userId, isAdmin) =>
    set({
      accessToken: access,
      refreshToken: refresh,
      username,
      userId,
      isAdmin,
    }),
  setTokens: (access, refresh) =>
    set({ accessToken: access, refreshToken: refresh }),
  clear: () =>
    set({
      accessToken: null,
      refreshToken: null,
      username: null,
      userId: null,
      isAdmin: false,
    }),
}));

/** Whether the current user is authenticated. */
export function isAuthenticated(): boolean {
  return useAuthStore.getState().accessToken !== null;
}