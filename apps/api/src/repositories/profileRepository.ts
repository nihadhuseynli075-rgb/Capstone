import { isUuid } from "../lib/ids";
import { supabaseAdmin } from "../lib/supabaseAdmin";

/**
 * The account a student key belongs to, or null when it is a guest's key.
 *
 * Account ids are uuids, so any other key can only be a guest's. It is also
 * one the lookup cannot be asked about: the id column is a uuid, and Postgres
 * rejects a malformed value there outright instead of finding nothing. Without
 * Supabase there are no accounts at all.
 *
 * Throws when the lookup itself fails; each caller decides whether that should
 * stop the request.
 */
export async function accountIdFor(studentKey: string): Promise<string | null> {
  if (!supabaseAdmin || !isUuid(studentKey)) return null;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", studentKey)
    .maybeSingle();

  if (error) throw new Error(`Failed to verify student account: ${error.message}`);

  return data ? (data.id as string) : null;
}
