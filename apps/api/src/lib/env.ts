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

export const env = {
  port: Number(process.env.API_PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  /**
   * Whether any localhost port may call the API, rather than WEB_ORIGIN alone.
   *
   * Vite falls back to 5174 and upwards when 5173 is taken, which otherwise
   * leaves the browser blocked by CORS with no obvious cause. Off in
   * production, where the real origin is the only one that should work.
   */
  allowAnyLocalhostOrigin: process.env.NODE_ENV !== "production",
  supabaseUrl: optional("SUPABASE_URL"),
  supabaseServiceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),
  /**
   * Shared password for the admin dashboard.
   *
   * This is a small internal tool for the two of us entering questions, so a
   * single shared password is enough for now. It falls back to a dev default so
   * the app runs out of the box, and the server says so loudly at startup.
   */
  adminPassword: process.env.ADMIN_PASSWORD ?? "capstone123",
  adminPasswordIsDefault: optional("ADMIN_PASSWORD") === undefined,
  questionImageBucket: process.env.SUPABASE_IMAGE_BUCKET ?? "question-images"
};

export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);

/** Which storage the API is actually using, so nothing has to guess. */
export type StorageMode = "supabase" | "memory";

export const storageMode: StorageMode = supabaseConfigured ? "supabase" : "memory";
