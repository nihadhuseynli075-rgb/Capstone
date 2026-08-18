const STORAGE_KEY = "examPeak.studentKey";

/**
 * Identifies the student to the API.
 *
 * Supabase Auth is not connected yet, so this is a random key generated once per
 * browser and kept in local storage. It is enough to make history and the
 * personal-best comparison work today. When real sign-in lands, this gets
 * replaced by the authenticated user id and existing local history can be
 * migrated across by sending this key once.
 */
export function getStudentKey(): string {
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const key = crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEY, key);
  return key;
}
