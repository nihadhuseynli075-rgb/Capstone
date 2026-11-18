import type { ReactNode } from "react";

/**
 * Maths in the bank's plain-text notation, set out as it is printed on paper:
 * "a/b" as a over b with a line between, and "√(...)" with the root sign's
 * bar running over everything under it.
 *
 * Nihad's testers found long divisions such as "(18x³y)/(5z⁴)" and nested
 * roots such as "√(12+4√5)" hard to read in one line, worst on a phone
 * (session of 11 Nov 2026). The bank keeps the plain text, which imports from
 * a spreadsheet as it is and needs no new notation to learn; only the display
 * changes.
 *
 * The rules are kept narrow so prose is never mistaken for maths:
 * - a slash is a fraction only between two maths operands: a bracketed group,
 *   a root, or a token that has a digit, a superscript or π in it or is one
 *   letter ("x/3", "b/a", "1/[3(d+c)]"). "is/are" and "a/maths" stay text;
 * - spaces around the slash are allowed only between two groups
 *   ("(7d + 7c) / (21d + 21c)"), never in prose such as "and / or";
 * - a chain ("12/04/2026") is left as it is written;
 * - the brackets round a fraction's part or a root's contents are dropped,
 *   since the line or bar now shows what they grouped.
 *
 * A screen reader is given the text as written, which reads well as it is,
 * and the stacked version is hidden from it.
 */

type Atom =
  | { kind: "text"; text: string }
  | { kind: "token"; text: string }
  | { kind: "slash"; text: string }
  | { kind: "group"; open: string; close: string; inner: Atom[]; text: string }
  | { kind: "root"; sign: string; body: Atom; text: string }
  | { kind: "frac"; top: Atom; bottom: Atom; whole?: string; text: string };

const roots = "√∛∜";
const closing: Record<string, string> = { "(": ")", "[": "]" };
// Characters a maths token is made of. Letters are Latin and Greek only, so a
// word in Cyrillic or with Azerbaijani letters is never read as a variable.
const tokenChar = /[0-9A-Za-zπ.,²³⁴⁵⁶⁷⁸⁹⁰¹ⁿ]/;
const mathyToken = /[0-9²³⁴⁵⁶⁷⁸⁹⁰¹π]|^[A-Za-z][²³⁴⁵⁶⁷⁸⁹⁰¹ⁿ]*$/;

/** Whether a piece of text has anything this component would change. */
function mayHaveMaths(text: string): boolean {
  return text.includes("/") || /[√∛∜]/.test(text);
}

/** The index of the bracket that closes the one at `start`, or -1 when it is never closed. */
function matchingBracket(text: string, start: number): number {
  const stack: string[] = [];
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (closing[char]) stack.push(closing[char]);
    else if (char === ")" || char === "]") {
      if (stack.pop() !== char) return -1;
      if (stack.length === 0) return index;
    }
  }
  return -1;
}

/** The text split into tokens, bracketed groups, roots, slashes and plain text, then fractions joined. */
function parse(text: string): Atom[] {
  const atoms: Atom[] = [];
  const pushText = (piece: string) => {
    const last = atoms[atoms.length - 1];
    if (last?.kind === "text") last.text += piece;
    else atoms.push({ kind: "text", text: piece });
  };

  // One operand starting at `index`: a group or a token, or null.
  const readOperand = (index: number): { atom: Atom; end: number } | null => {
    const char = text[index];
    if (char && closing[char]) {
      const end = matchingBracket(text, index);
      if (end === -1) return null;
      const inner = text.slice(index + 1, end);
      return {
        atom: { kind: "group", open: char, close: text[end], inner: parse(inner), text: text.slice(index, end + 1) },
        end: end + 1
      };
    }
    let end = index;
    while (end < text.length && tokenChar.test(text[end])) end += 1;
    // A full stop or comma at the end is the sentence's, not the number's.
    while (end > index && /[.,]/.test(text[end - 1])) end -= 1;
    if (end === index) return null;
    return { atom: { kind: "token", text: text.slice(index, end) }, end };
  };

  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (roots.includes(char)) {
      const operand = readOperand(index + 1);
      if (operand) {
        atoms.push({ kind: "root", sign: char, body: operand.atom, text: text.slice(index, operand.end) });
        index = operand.end;
        continue;
      }
      pushText(char);
      index += 1;
      continue;
    }
    if (char === "/") {
      atoms.push({ kind: "slash", text: char });
      index += 1;
      continue;
    }
    const operand = readOperand(index);
    if (operand) {
      atoms.push(operand.atom);
      index = operand.end;
      continue;
    }
    pushText(char);
    index += 1;
  }

  return joinFractions(atoms);
}

function isOperand(atom: Atom | undefined): boolean {
  if (!atom) return false;
  if (atom.kind === "group" || atom.kind === "root") return true;
  return atom.kind === "token" && mathyToken.test(atom.text);
}

function isGroupLike(atom: Atom | undefined): boolean {
  return atom?.kind === "group" || atom?.kind === "root";
}

/** Each "operand / operand" made one fraction, by the rules at the top of the file. */
function joinFractions(atoms: Atom[]): Atom[] {
  const out: Atom[] = [];
  for (let index = 0; index < atoms.length; index += 1) {
    const atom = atoms[index];
    if (atom.kind !== "slash") {
      out.push(atom);
      continue;
    }

    // The operands either side, stepping over one space only between groups.
    let leftAt = out.length - 1;
    let rightAt = index + 1;
    const spaceBefore = out[leftAt]?.kind === "text" && /^ $/.test(out[leftAt].text);
    const spaceAfter = atoms[rightAt]?.kind === "text" && /^ $/.test(atoms[rightAt].text);
    if (spaceBefore !== spaceAfter) {
      out.push(atom);
      continue;
    }
    if (spaceBefore) {
      leftAt -= 1;
      rightAt += 1;
      if (!isGroupLike(out[leftAt]) || !isGroupLike(atoms[rightAt])) {
        out.push(atom);
        continue;
      }
    }

    const left = out[leftAt];
    const right = atoms[rightAt];
    const chained = out[leftAt - 1]?.kind === "slash" || atoms[rightAt + 1]?.kind === "slash";
    if (!isOperand(left) || !isOperand(right) || chained) {
      out.push(atom);
      continue;
    }

    const between = out.slice(leftAt + 1).map((piece) => piece.text).join("") + atom.text;
    const spaceRight = spaceAfter ? " " : "";
    out.splice(leftAt);
    const fraction: Atom = { kind: "frac", top: left, bottom: right, text: left.text + between + spaceRight + right.text };

    // A mixed number ("1 3/5") is one number, so its whole part is kept with
    // the fraction; on its own it could be left at the end of a line.
    const space = out[out.length - 1];
    const whole = out[out.length - 2];
    if (
      fraction.kind === "frac" &&
      /^\d+$/.test(left.text) &&
      /^\d+$/.test(right.text) &&
      space?.kind === "text" &&
      space.text === " " &&
      whole?.kind === "token" &&
      /^\d+$/.test(whole.text)
    ) {
      out.splice(out.length - 2);
      fraction.whole = whole.text;
      fraction.text = `${whole.text} ${fraction.text}`;
    }
    out.push(fraction);
    index = rightAt;
  }
  return out;
}

/** What a fraction part or a root holds: a group without its brackets, anything else as it is. */
function renderUnbracketed(atom: Atom): ReactNode {
  return atom.kind === "group" ? renderAtoms(atom.inner) : renderAtom(atom, 0);
}

function renderAtom(atom: Atom, key: number): ReactNode {
  switch (atom.kind) {
    case "text":
    case "token":
    case "slash":
      return atom.text;
    case "group":
      return (
        <span key={key}>
          {atom.open}
          {renderAtoms(atom.inner)}
          {atom.close}
        </span>
      );
    case "root":
      return (
        <span key={key} className="math-root">
          <span className="math-root-sign">{atom.sign}</span>
          <span className="math-radicand">{renderUnbracketed(atom.body)}</span>
        </span>
      );
    case "frac": {
      const fraction = (
        <span key={key} className="math-frac">
          <span className="math-frac-top">{renderUnbracketed(atom.top)}</span>
          <span className="math-frac-bottom">{renderUnbracketed(atom.bottom)}</span>
        </span>
      );
      if (atom.whole === undefined) return fraction;
      return (
        <span key={key} className="math-mixed">
          {atom.whole}
          {fraction}
        </span>
      );
    }
  }
}

function renderAtoms(atoms: Atom[]): ReactNode {
  return atoms.map((atom, index) => renderAtom(atom, index));
}

/**
 * Text that may hold maths. Plain text comes back unchanged; each fraction or
 * root is drawn on paper's terms, with its written form kept for a screen
 * reader.
 */
export function MathText({ text }: { text: string }) {
  if (!mayHaveMaths(text)) return <>{text}</>;

  return (
    <>
      {parse(text).map((atom, index) => {
        if (atom.kind !== "frac" && atom.kind !== "root" && !(atom.kind === "group" && hasMaths(atom.inner))) {
          return atom.text;
        }
        return (
          <span key={index} className="math">
            <span className="visually-hidden">{atom.text}</span>
            <span aria-hidden="true">{renderAtom(atom, index)}</span>
          </span>
        );
      })}
    </>
  );
}

function hasMaths(atoms: Atom[]): boolean {
  return atoms.some(
    (atom) => atom.kind === "frac" || atom.kind === "root" || (atom.kind === "group" && hasMaths(atom.inner))
  );
}
