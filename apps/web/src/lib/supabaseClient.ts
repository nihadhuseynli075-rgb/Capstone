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
          detectSessionInUrl: true,
          /**
           * Sign-ins come back as a one-time code, not as the tokens themselves.
           *
           * The default, "implicit", returns from Google to
           * "#access_token=...&refresh_token=...", and the library clears that
           * by setting the hash, which leaves the old address in the browser's
           * history. On a shared school computer the next person could read a
           * refresh token out of it and sign in as whoever used it last.
           *
           * With pkce the address carries "?code=" instead, worth nothing
           * without the verifier kept in this browser, and used once. The
           * library swaps it for the session and takes the code out of the
           * address with replaceState, so nothing is left behind.
           */
          flowType: "pkce"
        }
      })
    : null;

export const isSupabaseConfigured = supabase !== null;
