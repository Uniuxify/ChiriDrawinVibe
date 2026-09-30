/** Sessions and cells API calls. */

import { api } from "./client";
import type {
  CellDTO,
  IterationDTO,
  PublicConfig,
  SessionDTO,
  SessionStateDTO,
} from "./types";

export async function fetchMySessions(): Promise<SessionDTO[]> {
  const { data } = await api.get<SessionDTO[] | { results: SessionDTO[] }>(
    "/sessions/mine",
  );
  return Array.isArray(data) ? data : data.results;
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

export async function joinSession(id: number, code: string): Promise<void> {
  await api.post(`/sessions/${id}/join`, { join_code: code });
}

export async function startSession(id: number): Promise<SessionDTO> {
  const { data } = await api.post<SessionDTO>(`/sessions/${id}/start`);
  return data;
}

export async function finishSession(id: number): Promise<SessionDTO> {
  const { data } = await api.post<SessionDTO>(`/sessions/${id}/finish`);
  return data;
}

export async function fetchCells(id: number): Promise<CellDTO[]> {
  const { data } = await api.get<CellDTO[] | { results: CellDTO[] }>(
    `/sessions/${id}/cells`,
  );
  return Array.isArray(data) ? data : data.results;
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