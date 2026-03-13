/**
 * ObservabilityError
 *
 * Single error type for all Cloudflare API failures.
 * Uses a `code` field to distinguish error kinds: "auth", "validation", "rate_limit", "server", "unknown".
 * Parses the retry-after header into retryAfterMs for rate limit errors.
 */

export type ErrorCode = "auth" | "validation" | "rate_limit" | "server" | "unknown";

export class ObservabilityError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly status: number,
    public readonly body: string,
    public readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "ObservabilityError";
  }
}

/**
 * classifyError
 *
 * Maps an HTTP status code to an ObservabilityError with the appropriate code.
 * 401/403 → "auth", 429 → "rate_limit", 400/422 → "validation", 5xx → "server".
 * Unrecognized statuses produce code "unknown".
 * Parses the retry-after header into retryAfterMs for 429 responses.
 */
export function classifyError(
  status: number,
  body: string,
  retryAfterHeader: string | null,
): ObservabilityError {
  if (status === 401 || status === 403) {
    return new ObservabilityError(`Authentication failed (${status})`, "auth", status, body);
  }
  if (status === 429) {
    const retryAfterMs = retryAfterHeader ? parseFloat(retryAfterHeader) * 1000 : null;
    return new ObservabilityError("Rate limited", "rate_limit", status, body, retryAfterMs);
  }
  if (status === 400 || status === 422) {
    return new ObservabilityError(`Invalid request (${status}): ${body}`, "validation", status, body);
  }
  if (status >= 500) {
    return new ObservabilityError(`Server error (${status})`, "server", status, body);
  }
  return new ObservabilityError(`API error ${status}: ${body}`, "unknown", status, body);
}
