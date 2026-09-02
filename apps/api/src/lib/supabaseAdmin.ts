import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, supabaseConfigured } from "./env";

/**
 * Server-side Supabase client.
 *
 * Uses the service role key, which bypasses row level security. It must never
 * be exposed to the browser, which is why every database read and write goes
 * through this API rather than straight from the web app.
 *
 * Null when credentials are not configured; callers fall back to in-memory
 * storage so the app is still runnable.
 */
export const supabaseAdmin: SupabaseClient | null = supabaseConfigured
  ? createClient(env.supabaseUrl!, env.supabaseServiceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;
