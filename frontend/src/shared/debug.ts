/** Lightweight, toggleable in-app debug logging.
 *
 * Used to trace the context/rendering flow when hunting bugs. Logging is
 * enabled automatically in development and can be forced on or off at runtime
 * via ``setDebugEnabled`` (persisted in ``localStorage``) or by setting
 * ``window.__CHIRI_DEBUG__`` before the app boots.
 */

const STORAGE_KEY = "chiridrawin:debug";
const MAX_ENTRIES = 500;

/** One recorded debug event. */
export interface DebugEntry {
  id: number;
  time: string;
  namespace: string;
  level: "log" | "warn" | "error";
  message: string;
  data?: unknown;
}

/** Logger returned by ``debug(namespace)``. */
export interface DebugLogger {
  log: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

let counter = 0;
let entries: DebugEntry[] = [];
const listeners = new Set<(entries: DebugEntry[]) => void>();

function readInitialEnabled(): boolean {
  try {
    const override = (window as unknown as { __CHIRI_DEBUG__?: boolean })
      .__CHIRI_DEBUG__;
    if (typeof override === "boolean") return override;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {
    // localStorage/window may be unavailable (privacy mode, SSR).
  }
  try {
    // Default to on for local development so bugs are easy to trace.
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

let enabled = readInitialEnabled();

/** Whether debug logging is currently active. */
export function isDebugEnabled(): boolean {
  return enabled;
}

/** Enable or disable debug logging, persisting the choice. */
export function setDebugEnabled(value: boolean): void {
  enabled = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Ignore persistence failures.
  }
  if (value) {
    record("debug", "log", "Debug logging enabled");
  }
  listeners.forEach((listener) => listener(entries));
}

function record(
  namespace: string,
  level: DebugEntry["level"],
  message: string,
  data?: unknown,
): void {
  if (!enabled) return;
  const entry: DebugEntry = {
    id: ++counter,
    time: new Date().toISOString().slice(11, 23),
    namespace,
    level,
    message,
    data,
  };
  entries = [...entries, entry].slice(-MAX_ENTRIES);
  listeners.forEach((listener) => listener(entries));
  const consoleFn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  consoleFn(`[${namespace}] ${message}`, data ?? "");
}

/** Create a namespaced logger. */
export function debug(namespace: string): DebugLogger {
  return {
    log: (message, data) => record(namespace, "log", message, data),
    warn: (message, data) => record(namespace, "warn", message, data),
    error: (message, data) => record(namespace, "error", message, data),
  };
}

/** Subscribe to debug-entry updates. Returns an unsubscribe function. */
export function subscribeDebug(
  listener: (entries: DebugEntry[]) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current snapshot of recorded debug entries. */
export function getDebugEntries(): DebugEntry[] {
  return entries;
}

/** Remove all recorded debug entries. */
export function clearDebugEntries(): void {
  entries = [];
  listeners.forEach((listener) => listener(entries));
}