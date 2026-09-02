import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Browser Supabase client, used for authentication only.
 *
 * The anon key is safe to ship: row level security decides what it can reach,
 * and the question bank has no anon policy at all. Everything to do with
 * questions, marking and results still goes through the API, which holds the
 * service role key. This client exists so sign-in does not have to be
 * reinvented.
 *
 * Null when credentials are absent, which is what keeps the app runnable before
 * the Supabase project is connected. Callers check `isSupabaseConfigured`
 * rather than assuming a client exists.
 */
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      })
    : null;

export const isSupabaseConfigured = supabase !== null;
