/**
 * A question's text, with any numbered statements set out as a list.
 *
 * Many DİM questions print a list of statements under the question and then
 * offer options that name them by number: "1) ... 2) ... 3) ..." and options
 * such as "1, 2, 4". In the bank the statements are part of the question text,
 * one to a line, and shown as plain lines they read as if they were the
 * options (Nihad, 7 Nov 2026). The lines after the question that start with a
 * number and ")" or "." are taken out of the heading and shown as a list of
 * their own, each with the number the options refer to.
 */

/** "1) text", "2. text", "3 ) text". */
const STATEMENT = /^\s*(\d{1,2})\s*[).]\s*(.+)$/;

export interface SplitPrompt {
  lead: string;
  statements: Array<{ number: string; text: string }>;
}

/**
 * The question split into what is asked and the statements under it. Only two
 * or more numbered lines in a row, after the first line, count, so a question
 * that merely starts "1. Find x" stays as it is.
 */
export function splitPrompt(prompt: string): SplitPrompt {
  const lines = prompt.split(/\r?\n/);
  const start = lines.findIndex((line, index) => index > 0 && STATEMENT.test(line));
  if (start === -1) return { lead: prompt, statements: [] };

  const statements: SplitPrompt["statements"] = [];
  let end = start;
  while (end < lines.length) {
    const match = STATEMENT.exec(lines[end]);
    if (!match) break;
    statements.push({ number: match[1], text: match[2].trim() });
    end += 1;
  }

  // A blank line or more text after the list ends it; anything after stays
  // with the question, so nothing typed is ever dropped.
  if (statements.length < 2) return { lead: prompt, statements: [] };
  const rest = lines.slice(end).join("\n").trim();
  const lead = [lines.slice(0, start).join("\n").trim(), rest].filter(Boolean).join("\n");
  return { lead, statements };
}

export function PromptText({ prompt, part }: { prompt: string; part: "lead" | "statements" }) {
  const split = splitPrompt(prompt);
  if (part === "lead") return <>{split.lead}</>;
  if (split.statements.length === 0) return null;

  return (
    <ol className="prompt-statements">
      {split.statements.map((statement, index) => (
        <li key={index}>
          <span className="prompt-statement-number">{statement.number}</span>
          <span>{statement.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** A reading passage: a blank line starts a new paragraph, a single break stays a line break. */
export function PassageText({ body }: { body: string }) {
  const paragraphs = body
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </>
  );
}
