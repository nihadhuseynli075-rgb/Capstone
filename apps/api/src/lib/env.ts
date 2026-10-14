import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

// The API runs with its own folder as the working directory, but .env lives at
// the repository root next to .env.example. Point dotenv there explicitly, then
// allow an apps/api/.env to override it for anything machine-specific.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../../.env") });
dotenv.config();

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

const isProduction = process.env.NODE_ENV === "production";

/**
 * The admin password when none is set.
 *
 * It is written here and in `.env.example`, so it is a convenience for getting
 * started rather than a secret, and the dashboard refuses it in production.
 */
const DEV_ADMIN_PASSWORD = "capstone123";

export const env = {
  port: Number(process.env.API_PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  isProduction,
  /**
   * Whether any localhost port may call the API, rather than WEB_ORIGIN alone.
   *
   * Vite falls back to 5174 and upwards when 5173 is taken, which otherwise
   * leaves the browser blocked by CORS with no obvious cause. Off in
   * production, where the real origin is the only one that should work.
   */
  allowAnyLocalhostOrigin: !isProduction,
  supabaseUrl: optional("SUPABASE_URL"),
  /**
   * The project's secret key (Supabase -> Project settings -> API keys), which
   * lets the API past row level security. Never the publishable key: that one
   * is public, so the question bank refuses it on purpose. Older projects call
   * it the service role key, and that name still works.
   */
  supabaseServiceRoleKey: optional("SUPABASE_SECRET_KEY") ?? optional("SUPABASE_SERVICE_ROLE_KEY"),
  /**
   * Shared password for the admin dashboard.
   *
   * This is a small internal tool for the two of us entering questions, so a
   * single shared password is enough for now. It falls back to a dev default so
   * the app runs out of the box, and the server says so loudly at startup.
   *
   * Read through `optional`, which treats blank as unset. `.env.example` says
   * to leave `ADMIN_PASSWORD=` empty in development, and dotenv reads that as
   * an empty string: taken literally it became the password itself, so an
   * empty box opened the dashboard for anyone who found it.
   */
  adminPassword: optional("ADMIN_PASSWORD") ?? DEV_ADMIN_PASSWORD,
  adminPasswordIsDefault: optional("ADMIN_PASSWORD") === undefined,
  questionImageBucket: process.env.SUPABASE_IMAGE_BUCKET ?? "question-images",
  /** Profile photos, one folder per account. Created by migration 0007. */
  avatarBucket: process.env.SUPABASE_AVATAR_BUCKET ?? "avatars",
  /**
   * Key for the AI marker that marks written (open-ended) answers.
   *
   * Without it written questions are simply never put in a test, so nobody
   * sits a question that cannot be marked.
   */
  anthropicApiKey: optional("ANTHROPIC_API_KEY"),
  /**
   * How many proxies sit in front of the API, for Express's "trust proxy".
   *
   * The test generator's limit and the admin login limiter count requests per
   * address. Behind a host's proxy every request arrives from the proxy, so
   * without this every student would share one allowance. It stays 0 unless
   * set, because trusting a proxy that is not there lets anyone choose their
   * own address by sending X-Forwarded-For.
   */
  trustProxyHops: Math.max(0, Math.trunc(Number(optional("TRUST_PROXY") ?? 0)) || 0)
};

export const writtenMarkingEnabled = Boolean(env.anthropicApiKey);

export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);

/** Which storage the API is actually using, so nothing has to guess. */
export type StorageMode = "supabase" | "memory";

export const storageMode: StorageMode = supabaseConfigured ? "supabase" : "memory";
