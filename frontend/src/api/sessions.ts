/** Sessions and cells API calls. */

import { api } from "./client";
import type {
  IterationDTO,
  MySessionsResponse,
  PublicConfig,
  SessionDTO,
  SessionStateDTO,
} from "./types";

/** Fetch the caller's sessions grouped by lifecycle status. */
export async function fetchMySessions(): Promise<MySessionsResponse> {
  const { data } = await api.get<MySessionsResponse>("/sessions/mine");
  return {
    drafts: data.drafts ?? [],
    active: data.active ?? [],
    finished: data.finished ?? [],
  };
}

export async function fetchPublicFinished(): Promise<SessionDTO[]> {
  const { data } = await api.get<SessionDTO[] | { results: SessionDTO[] }>(
    "/sessions/public/finished",
  );
  return Array.isArray(data) ? data : data.results;
}

export async function createSession(payload: Partial<SessionDTO>) {
  const { data } = await api.post<SessionDTO>("/sessions", payload);
  return data;
}

export async function fetchSession(id: number): Promise<SessionDTO> {
  const { data } = await api.get<SessionDTO>(`/sessions/${id}`);
  return data;
}

export async function fetchSessionState(id: number): Promise<SessionStateDTO> {
  const { data } = await api.get<SessionStateDTO>(`/sessions/${id}/state`);
  return data;
}

/** Join a draft session by its join code. */
export async function joinSession(code: string): Promise<SessionDTO> {
  const { data } = await api.post<SessionDTO>("/sessions/join", {
    join_code: code.trim().toUpperCase(),
  });
  return data;
}

export async function startSession(id: number): Promise<SessionDTO> {
  const { data } = await api.post<SessionDTO>(`/sessions/${id}/start`);
  return data;
}

export async function finishSession(id: number): Promise<SessionDTO> {
  const { data } = await api.post<SessionDTO>(`/sessions/${id}/finish`);
  return data;
}

export async function fetchIteration(id: number): Promise<IterationDTO | null> {
  const { data } = await api.get<IterationDTO | null>(
    `/sessions/${id}/iteration/current`,
  );
  return data;
}

export async function fetchConfig(): Promise<PublicConfig> {
  const { data } = await api.get<PublicConfig>("/config");
  return data;
}