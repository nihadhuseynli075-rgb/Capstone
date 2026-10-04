/**
 * Text to find anywhere in a column, as an ILIKE pattern.
 *
 * In a pattern "%" stands for any run of characters, "_" for any one
 * character, and a backslash makes the character after it stand for itself.
 * Someone typing "%" or "_" into the admin search means those characters, as
 * in "54%" or "x_1"; passed through as they were, either one matched every
 * question in the bank. So all three are escaped, and only the "%" at each
 * end is a wildcard.
 */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
