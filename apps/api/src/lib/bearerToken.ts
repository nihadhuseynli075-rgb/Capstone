import type { Request } from "express";

/** The token from an `Authorization: Bearer ...` header, or null without one. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}
