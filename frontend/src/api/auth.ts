/** Auth API calls. */

import { api } from "./client";
import type { AuthResponse, TokenPair, UserDTO } from "./types";

export async function register(
  username: string,
  password: string,
): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/register", {
    username,
    password,
  });
  return data;
}

export async function login(
  username: string,
  password: string,
): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/login", {
    username,
    password,
  });
  return data;
}

export async function refresh(refresh: string): Promise<TokenPair> {
  const { data } = await api.post<TokenPair>("/auth/refresh", { refresh });
  return data;
}

export async function fetchMe(): Promise<UserDTO> {
  const { data } = await api.get<UserDTO>("/auth/me");
  return data;
}