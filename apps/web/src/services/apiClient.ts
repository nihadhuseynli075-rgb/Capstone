const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  readonly status: number;
  readonly issues: unknown;
  /**
   * What kind of failure this is, where the status alone is not enough.
   *
   * Two different 409s come back from submitting a test - already marked, and
   * out of time - and they want opposite things from the browser. The message
   * is written for a person to read, so it is the wrong thing to branch on.
   */
  readonly code: string | null;

  constructor(message: string, status: number, issues?: unknown, code?: string | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.issues = issues;
    this.code = code ?? null;
  }
}

/**
 * Single place the browser talks to the API.
 *
 * Server error messages are written to be shown to a person, so they are read
 * off the response body and surfaced as-is rather than replaced with a generic
 * "something went wrong".
 */
export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch {
    throw new ApiError(
      `Could not reach the API at ${API_BASE_URL}. Is it running? Start it with "npm run dev".`,
      0
    );
  }

  const text = await response.text();

  // Anything sitting in front of the API - a proxy, a tunnel, a host's own
  // error page - can answer with HTML. Parsing that throws a SyntaxError which
  // escapes the ApiError wrapper entirely, so the student is shown
  // "Unexpected token '<'" instead of something they can act on.
  let payload: Record<string, unknown> = {};

  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new ApiError(
        response.ok
          ? "The API replied with something this app could not read."
          : `Request failed (${response.status}).`,
        response.status
      );
    }
  }

  if (!response.ok) {
    throw new ApiError(
      typeof payload.message === "string" ? payload.message : `Request failed (${response.status}).`,
      response.status,
      payload.issues,
      typeof payload.code === "string" ? payload.code : null
    );
  }

  return payload as T;
}

export { API_BASE_URL };
