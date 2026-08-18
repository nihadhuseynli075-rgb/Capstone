const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  readonly status: number;
  readonly issues: unknown;

  constructor(message: string, status: number, issues?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.issues = issues;
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
  const payload = text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    throw new ApiError(
      typeof payload.message === "string" ? payload.message : `Request failed (${response.status}).`,
      response.status,
      payload.issues
    );
  }

  return payload as T;
}

export { API_BASE_URL };
