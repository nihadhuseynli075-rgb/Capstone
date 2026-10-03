import { supabase } from "../lib/supabaseClient";
import { ApiError } from "./apiClient";

/**
 * The signed-in account's access token, for the calls that belong to an account
 * and have no guest version: the profile and the friends list.
 *
 * Throws the 401 the API would have answered with, so a session that has ended
 * reads the same whether the browser noticed first or the server did.
 */
export async function accountToken(): Promise<string> {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  if (!session) throw new ApiError("Sign in again to continue.", 401);
  return session.access_token;
}
