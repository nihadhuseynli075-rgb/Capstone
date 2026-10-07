/**
 * Text to find anywhere in a column, as an ILIKE pattern.
 *
 * In a pattern "%" stands for any run of characters, "_" for any one
 * character, and a backslash makes the character after it stand for itself.
 * Someone typing "%" or "_" into the admin search means those characters, as
 * in "54%" or "x_1"; passed through as they were, either one matched every
 * question in the bank. So all three are escaped, and only the "%" at each
 * end is a wildcard.
 *
 * "*" cannot be escaped at all. PostgREST turns every "*" in a like pattern
 * into "%" before Postgres sees it, backslash or not (`star` in its
 * SqlFragment.hs), so a search for "2 * 3" found every question with a 2 and
 * a 3 in it, and "*" on its own found the whole bank. It goes as "_" instead,
 * any one character, which PostgREST leaves alone. That still matches a
 * little more than was typed, so a search containing "*" has its rows checked
 * with containsText afterwards (see needsTextCheck).
 */
export function containsPattern(text: string): string {
  const escaped = text.replace(/[\\%_]/g, (char) => `\\${char}`).replace(/\*/g, "_");
  return `%${escaped}%`;
}

/**
 * Whether the rows a containsPattern search matched can include ones without
 * the text typed, and so have to be checked with containsText.
 */
export function needsTextCheck(text: string): boolean {
  return text.includes("*");
}

/**
 * Whether `text` contains `search`, ignoring case: the question containsPattern
 * asks Postgres, answered here. The memory store searches this way, so its
 * results and a Supabase project's agree.
 */
export function containsText(text: string, search: string): boolean {
  return foldCase(text).includes(foldCase(search));
}

/**
 * Text lowercased one character at a time, which is how Postgres lowercases
 * both sides of an ILIKE in a UTF-8 database.
 *
 * JavaScript's toLowerCase works on the whole string, and differs in two ways
 * that matter here. It turns the Azerbaijani and Turkish "İ" into "i" plus a
 * combining dot, so "istanbul" did not find "İstanbul" while a search for "i"
 * did, and the memory store and a Supabase project answered the same search
 * differently. And it writes a "Σ" at the end of a word as "ς", which no
 * search for "σ" would find.
 */
export function foldCase(text: string): string {
  return Array.from(text, (char) => (char === "İ" ? "i" : char.toLowerCase())).join("");
}
