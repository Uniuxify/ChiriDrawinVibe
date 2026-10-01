/** Axios client with JWT bearer auth and a one-shot refresh on 401. */

import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import { debug } from "../shared/debug";
import { useAuthStore } from "../store/auth";

const log = debug("api");

export const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  log.log(`→ ${config.method?.toUpperCase()} ${config.url}`, {
    params: config.params,
    data: config.data,
    hasAuth: Boolean(accessToken),
  });
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setTokens, clear } = useAuthStore.getState();
  if (!refreshToken) {
    clear();
    return null;
  }
  try {
    const { data } = await axios.post("/api/v1/auth/refresh", {
      refresh: refreshToken,
    });
    setTokens(data.access, data.refresh ?? refreshToken);
    return data.access as string;
  } catch {
    clear();
    return null;
  }
}

api.interceptors.response.use(
  (response) => {
    log.log(
      `← ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`,
      response.data,
    );
    return response;
  },
  async (error: AxiosError) => {
    const original = error.config as
      | (AxiosRequestConfig & { _retried?: boolean })
      | undefined;
    const status = error.response?.status;
    log.warn(`✖ ${status ?? "?"} ${original?.method?.toUpperCase()} ${original?.url}`, {
      detail: error.response?.data,
      message: error.message,
    });
    if (status === 401 && original && !original._retried) {
      original._retried = true;
      log.log("Refreshing expired access token…");
      refreshing = refreshing ?? refreshAccessToken();
      const token = await refreshing;
      refreshing = null;
      if (token) {
        log.log("Token refreshed, retrying request");
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      log.error("Token refresh failed; request will be rejected");
    }
    return Promise.reject(error);
  },
);
