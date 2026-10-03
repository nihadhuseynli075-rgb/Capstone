/**
 * Puts values into a translated sentence: "Remove {name}?" with a name.
 *
 * The dictionaries are plain strings with no formatting library behind them
 * (see lib/i18n), and a name has to sit in the middle of a sentence whose word
 * order differs between the three languages, so the place for it is marked in
 * the translation itself rather than the sentence being built from pieces.
 */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
