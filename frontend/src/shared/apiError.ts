/** Helpers for turning API failures into human-readable messages. */

/** Shape of an error response body produced by the backend. */
interface ErrorBody {
  code?: unknown;
  message?: unknown;
  detail?: unknown;
  details?: unknown;
}

/** Convert an arbitrary nested value into a single readable string. */
function flatten(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const flat = flatten(item);
      if (flat) return flat;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      // Skip machine-readable codes; they are not user-facing text.
      if (key === "code") continue;
      const flat = flatten(item);
      if (flat) return flat;
    }
  }
  return null;
}

/** Extract a message from a response body (error envelope or DRF payload). */
function fromBody(data: unknown): string | null {
  if (typeof data === "string") return flatten(data);
  if (data && typeof data === "object") {
    const body = data as ErrorBody;
    const direct =
      flatten(body.message) ?? flatten(body.detail) ?? flatten(body.details);
    // Fall back to field-level payloads such as `{username: ["..."]}`.
    return direct ?? flatten(data);
  }
  return null;
}

/**
 * Build a readable error message for any thrown API error.
 *
 * Understands the backend error envelope (`{code, message, details}`),
 * plain DRF payloads (`{detail: ...}`), field-level validation arrays and
 * axios network failures.
 *
 * Args:
 *   err: The caught error, usually an `AxiosError`.
 *   fallback: Text used when no better message can be extracted.
 *
 * Returns:
 *   A human-readable message.
 */
export function extractApiMessage(
  err: unknown,
  fallback = "The request failed.",
): string {
  const response = (
    err as {
      response?: { status?: number; statusText?: string; data?: unknown };
    }
  )?.response;

  if (response) {
    const body = fromBody(response.data);
    if (body) return body;
    if (response.status) {
      const status = response.statusText
        ? `${response.status} ${response.statusText}`
        : String(response.status);
      return `${fallback} (HTTP ${status})`;
    }
  }

  const message = (err as { message?: string })?.message;
  if (message && message.trim()) return message.trim();

  return fallback;
}