import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { bearerToken } from "../../lib/bearerToken";
import { env } from "../../lib/env";

/**
 * Admin sessions.
 *
 * The admin dashboard is an internal tool for entering questions, so it uses one
 * shared password rather than real accounts. A successful login issues a random
 * token held in memory; restarting the API signs everyone out, which is fine at
 * this size. Swap this for Supabase Auth with an admin role before anything
 * outside the two of us gets access.
 */

const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;

const sessions = new Map<string, number>();

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, so compare lengths separately.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function purgeExpired(): void {
  const now = Date.now();
  for (const [token, expiresAt] of sessions) {
    if (expiresAt <= now) sessions.delete(token);
  }
}

export function login(password: string): string | null {
  // The fallback password is written in the repository, so in production it is
  // no password at all: the dashboard stays shut until a real one is set. Only
  // this dashboard closes; students can still sit tests. The reason is said at
  // startup rather than here, where it would tell a stranger what is wrong.
  if (env.adminPasswordIsDefault && env.isProduction) return null;

  if (!constantTimeEquals(password, env.adminPassword)) return null;

  purgeExpired();
  const token = randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_LIFETIME_MS);
  return token;
}

export function logout(token: string): void {
  sessions.delete(token);
}

export function isValidToken(token: string): boolean {
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;

  if (expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }

  return true;
}

export function requireAdmin(request: Request, response: Response, next: NextFunction): void {
  if (!isValidToken(bearerToken(request) ?? "")) {
    response.status(401).json({ message: "Admin sign-in required." });
    return;
  }

  next();
}
