import katex from "katex";
import { useMemo, type ReactNode } from "react";

/**
 * Maths in the bank's plain-text notation, typeset as an equation is printed:
 * italic variables, upright numbers and units, spaced operators, a fraction's
 * top over its bottom and a root's bar over everything under it. KaTeX does
 * the typesetting.
 *
 * Nihad's testers found long divisions such as "(18x³y)/(5z⁴)" and nested
 * roots such as "√(12+4√5)" hard to read in one line, worst on a phone
 * (session of 11 Nov 2026), and maths set in the page's own font read as
 * plain letters, not as an equation (18 Nov). The bank keeps the plain text,
 * which imports from a spreadsheet as it is and needs no LaTeX to learn; only
 * the display changes.
 *
 * A question is mostly prose with maths inside it, so the text is read in
 * three steps:
 * 1. split into atoms: words and numbers, operators, brackets, roots, slashes;
 * 2. "operand/operand" joined into fractions, by narrow rules so prose is
 *    never mistaken for maths:
 *    - an operand is a bracketed group, a root, or a token that has a digit,
 *      a superscript or π in it or is one letter ("x/3", "b/a",
 *      "1/[3(d+c)]"); "is/are" and "a/maths" stay text;
 *    - spaces round the slash are allowed only between two groups
 *      ("(7d + 7c) / (21d + 21c)"), never in prose such as "and / or";
 *    - a chain ("12/04/2026") is left as it is written;
 * 3. runs of maths atoms found and typeset, the prose between them left in the
 *    page's font. A run is typeset when it has a fraction, a root, an operator,
 *    a sign (°, %), a power or a number with a letter (2x). A plain number is
 *    typeset only in text that has such maths elsewhere, so "Question 5" and
 *    "in 2026" stay as they are, while the 3 in "If −5 and 3 are roots" matches
 *    the −5 beside it. A text that is nothing but a number (an option "4.5")
 *    is typeset too, so a list of options is set in one font.
 *
 * Only characters this file chose are ever handed to KaTeX: tokens are
 * letters, digits and superscripts, and every operator is mapped from a fixed
 * list. Nothing typed in the bank can reach it as a command.
 */

type Atom =
  | { kind: "text"; text: string }
  | { kind: "space"; text: string }
  | { kind: "token"; text: string }
  | { kind: "op"; text: string }
  | { kind: "sym"; text: string }
  | { kind: "slash"; text: string }
  | { kind: "group"; open: string; close: string; inner: Atom[]; text: string }
  | { kind: "root"; sign: string; body: Atom; text: string }
  | { kind: "frac"; top: Atom; bottom: Atom; whole?: string; text: string };

const roots = "√∛∜";
const closing: Record<string, string> = { "(": ")", "[": "]" };
// Characters a maths token is made of. Letters are Latin and Greek only, so a
// word in Cyrillic or with Azerbaijani letters is never read as a variable.
const tokenChar = /[0-9A-Za-zπ.,²³⁴⁵⁶⁷⁸⁹⁰¹ⁿ]/;
const superscripts = "²³⁴⁵⁶⁷⁸⁹⁰¹ⁿ";
const superscriptValue: Record<string, string> = {
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁰": "0",
  "¹": "1",
  ⁿ: "n"
};
/** Operators as typed, and how KaTeX writes them. */
const operators: Record<string, string> = {
  "+": "+",
  "-": "-",
  "−": "-",
  "=": "=",
  "·": "\\cdot ",
  "⋅": "\\cdot ",
  "*": "\\cdot ",
  "×": "\\times ",
  "÷": "\\div ",
  "<": "<",
  ">": ">",
  "≤": "\\le ",
  "≥": "\\ge ",
  "≠": "\\ne ",
  "±": "\\pm ",
  "≈": "\\approx "
};
/** Signs written after a number. */
const signs: Record<string, string> = { "°": "^{\\circ}", "%": "\\%" };
/** Units set upright after a number, as a printed paper sets them. */
const units = new Set(["mm", "cm", "dm", "m", "km", "sm", "g", "kg", "kq", "l", "ml", "s", "h", "min"]);
/** Function names set upright, and always maths. */
const functions = new Set(["sin", "cos", "tan", "tg", "cot", "ctg", "log", "ln", "lg"]);

/** Whether a piece of text has anything this component would change. */
function mayHaveMaths(text: string): boolean {
  return /[0-9/√∛∜=+−×÷·≤≥≠±≈°%²³⁴⁵⁶⁷⁸⁹⁰¹π]/.test(text);
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

const isLetter = (char: string | undefined) => !!char && /\p{L}/u.test(char);

/** Step 1 and 2: the text split into atoms, with fractions joined. */
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
      return {
        atom: {
          kind: "group",
          open: char,
          close: text[end],
          inner: parse(text.slice(index + 1, end)),
          text: text.slice(index, end + 1)
        },
        end: end + 1
      };
    }
    let end = index;
    while (end < text.length && tokenChar.test(text[end])) end += 1;
    // A full stop or comma at the end is the sentence's, not the number's.
    while (end > index && /[.,]/.test(text[end - 1])) end -= 1;
    if (end === index) return null;
    // A token is a whole word or nothing: "x" in "xü" is not a variable.
    if (isLetter(text[end]) || isLetter(text[index - 1])) return null;
    return { atom: { kind: "token", text: text.slice(index, end) }, end };
  };

  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (/\s/.test(char)) {
      let end = index;
      while (end < text.length && /\s/.test(text[end])) end += 1;
      atoms.push({ kind: "space", text: text.slice(index, end) });
      index = end;
      continue;
    }
    if (roots.includes(char)) {
      const operand = readOperand(index + 1);
      if (operand) {
        atoms.push({ kind: "root", sign: char, body: operand.atom, text: text.slice(index, operand.end) });
        index = operand.end;
        continue;
      }
    }
    if (char === "/") {
      atoms.push({ kind: "slash", text: char });
      index += 1;
      continue;
    }
    // A hyphen between two letters joins a word ("well-known"); anywhere
    // else it is a minus.
    if (operators[char] && !(char === "-" && isLetter(text[index - 1]) && isLetter(text[index + 1]))) {
      atoms.push({ kind: "op", text: char });
      index += 1;
      continue;
    }
    if (signs[char]) {
      atoms.push({ kind: "sym", text: char });
      index += 1;
      continue;
    }
    const operand = readOperand(index);
    if (operand) {
      atoms.push(operand.atom);
      index = operand.end;
      continue;
    }
    // A run of letters that is not a token (a word in another script, or one
    // with a letter a token cannot hold) is kept whole, so no part of it is
    // read as a variable.
    if (isLetter(char) || tokenChar.test(char)) {
      let end = index;
      while (end < text.length && (isLetter(text[end]) || tokenChar.test(text[end]))) end += 1;
      pushText(text.slice(index, end));
      index = end;
      continue;
    }
    pushText(char);
    index += 1;
  }

  return joinFractions(atoms);
}

const hasDigit = (text: string) => /[0-9]/.test(text);
const hasSuperscript = (text: string) => [...text].some((char) => superscripts.includes(char));

/** A token that can stand on either side of a fraction's line. */
function isOperand(atom: Atom | undefined): boolean {
  if (!atom) return false;
  if (atom.kind === "group" || atom.kind === "root") return true;
  return (
    atom.kind === "token" &&
    (hasDigit(atom.text) || hasSuperscript(atom.text) || atom.text.includes("π") || /^[A-Za-z]$/.test(atom.text))
  );
}

function isGroupLike(atom: Atom | undefined): boolean {
  return atom?.kind === "group" || atom?.kind === "root";
}

/** Each "operand/operand" made one fraction, by the rules at the top of the file. */
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
    const spaceBefore = out[leftAt]?.kind === "space";
    const spaceAfter = atoms[rightAt]?.kind === "space";
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

    const written = out.slice(leftAt).map((piece) => piece.text).join("") + atom.text;
    const after = spaceAfter ? atoms[index + 1].text : "";
    out.splice(leftAt);
    const fraction: Extract<Atom, { kind: "frac" }> = {
      kind: "frac",
      top: left,
      bottom: right,
      text: written + after + right.text
    };

    // A mixed number ("1 3/5") is one number, so its whole part is kept with
    // the fraction.
    const space = out[out.length - 1];
    const whole = out[out.length - 2];
    if (
      /^\d+$/.test(left.text) &&
      /^\d+$/.test(right.text) &&
      space?.kind === "space" &&
      whole?.kind === "token" &&
      /^\d+$/.test(whole.text)
    ) {
      out.splice(out.length - 2);
      fraction.whole = whole.text;
      fraction.text = whole.text + space.text + fraction.text;
    }
    out.push(fraction);
    index = rightAt;
  }
  return out;
}

/** The atom before or after `index`, stepping over spaces. */
function neighbour(atoms: Atom[], index: number, step: 1 | -1): Atom | undefined {
  let at = index + step;
  while (atoms[at]?.kind === "space") at += step;
  return atoms[at];
}

/**
 * Whether the operator beside a word (looking from `from` in direction
 * `step`) joins two things, as in "bx + c" or "a=4", rather than signing a
 * number, as in "If −5". A sign hugs its number on one side only, so an
 * operator spaced the same on both sides is a joining one.
 */
function isBinaryOperator(atoms: Atom[], from: number, step: 1 | -1): boolean {
  let at = from;
  const spacedNear = atoms[at]?.kind === "space";
  if (spacedNear) at += step;
  if (atoms[at]?.kind !== "op") return false;
  const spacedFar = atoms[at + step]?.kind === "space";
  return spacedNear === spacedFar;
}

/** Whether a token is a number, a measure or a sign that needs one. */
function endsNumber(atom: Atom | undefined): boolean {
  if (!atom) return false;
  if (atom.kind === "token") return /[0-9²³⁴⁵⁶⁷⁸⁹⁰¹π]$/.test(atom.text);
  return atom.kind === "root" || atom.kind === "frac" || atom.kind === "group";
}

const unitToken = (text: string) => units.has(text.replace(/[²³]$/, ""));

/**
 * Whether an atom can be part of a run of maths. Short letter words ("bx",
 * "c") count only beside an operator, so "a" and "and" in a sentence stay
 * prose; a unit counts after a number.
 */
function isMathAtom(atoms: Atom[], index: number): boolean {
  const atom = atoms[index];
  switch (atom.kind) {
    case "frac":
    case "root":
    case "op":
    case "sym":
      return true;
    case "group": {
      if (atom.inner.every((_, inner) => atom.inner[inner].kind === "space" || isMathAtom(atom.inner, inner))) {
        return true;
      }
      // "(x)" in "sin(x)" or "f(2)": one term in brackets that touch a
      // function name or a variable, with no space between.
      const [only] = atom.inner;
      const touching = atoms[index - 1];
      return (
        atom.inner.length === 1 &&
        only.kind === "token" &&
        /^([A-Za-z]{1,3}|[0-9.,]+)$/.test(only.text) &&
        touching?.kind === "token" &&
        (functions.has(touching.text) || /^[a-z]$/.test(touching.text))
      );
    }
    case "token": {
      const text = atom.text;
      if (functions.has(text)) return true;
      if (unitToken(text) && endsNumber(neighbour(atoms, index, -1))) return true;
      if (hasDigit(text) || hasSuperscript(text) || text.includes("π")) return true;
      if (/^[A-Za-z]{1,3}$/.test(text)) {
        return (
          isBinaryOperator(atoms, index - 1, -1) ||
          isBinaryOperator(atoms, index + 1, 1) ||
          neighbour(atoms, index, 1)?.kind === "sym"
        );
      }
      return false;
    }
    default:
      return false;
  }
}

/** Whether a run is maths on its own, not just a number among words. */
function isRealMaths(atoms: Atom[]): boolean {
  return atoms.some((atom) => {
    switch (atom.kind) {
      case "frac":
      case "root":
      case "op":
      case "sym":
        return true;
      case "group":
        return isRealMaths(atom.inner);
      case "token":
        return (
          hasSuperscript(atom.text) ||
          atom.text.includes("π") ||
          functions.has(atom.text) ||
          (hasDigit(atom.text) && /[A-Za-z]/.test(atom.text) && !unitToken(atom.text))
        );
      default:
        return false;
    }
  });
}

type Piece = { math: false; atom: Atom } | { math: true; atoms: Atom[] };

/** The atoms grouped into runs of maths and the prose between them. */
function splitRuns(atoms: Atom[]): Piece[] {
  const pieces: Piece[] = [];
  let run: Atom[] = [];
  let pendingSpace: Atom[] = [];

  const close = () => {
    if (run.length) pieces.push({ math: true, atoms: run });
    for (const space of pendingSpace) pieces.push({ math: false, atom: space });
    run = [];
    pendingSpace = [];
  };

  atoms.forEach((atom, index) => {
    if (atom.kind === "space") {
      if (run.length) pendingSpace.push(atom);
      else pieces.push({ math: false, atom });
      return;
    }
    if (isMathAtom(atoms, index)) {
      run.push(...pendingSpace, atom);
      pendingSpace = [];
      return;
    }
    close();
    pieces.push({ math: false, atom });
  });
  close();
  return pieces;
}

/** A token in LaTeX: powers raised, decimal commas kept tight, units and function names upright. */
function tokenLatex(text: string, upright: boolean): string {
  if (functions.has(text)) return `\\${text === "tg" || text === "ctg" ? `operatorname{${text}}` : text} `;
  if (upright) {
    // A unit is set upright as one word, with its power after it: cm².
    const base = text.replace(new RegExp(`[${superscripts}]+$`), "");
    const power = [...text.slice(base.length)].map((char) => superscriptValue[char]).join("");
    return `\\,\\mathrm{${base}}${power ? `^{${power}}` : ""}`;
  }
  // A power raises only the character before it, as in print: ax² is a times
  // x squared, not (ax) squared.
  let body = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "," && /[0-9]/.test(text[index + 1] ?? "")) body += "{,}";
    else if (char === "π") body += "\\pi ";
    else if (superscripts.includes(char)) {
      let raised = "";
      while (index < text.length && superscripts.includes(text[index])) {
        raised += superscriptValue[text[index]];
        index += 1;
      }
      index -= 1;
      body += `^{${raised}}`;
    } else body += char;
  }
  return body;
}

/** A run of maths atoms as LaTeX. `depth` counts fractions around it, so only the outermost are full size. */
function toLatex(atoms: Atom[], depth = 0): string {
  return atoms
    .map((atom, index) => {
      switch (atom.kind) {
        case "space":
          return " ";
        case "op":
          return operators[atom.text];
        case "sym":
          return signs[atom.text];
        case "token":
          return tokenLatex(atom.text, unitToken(atom.text) && endsNumber(neighbour(atoms, index, -1)));
        case "group": {
          const [open, close] = atom.open === "[" ? ["[", "]"] : ["(", ")"];
          return `\\left${open}${toLatex(atom.inner, depth)}\\right${close}`;
        }
        case "root": {
          const index = atom.sign === "∛" ? "[3]" : atom.sign === "∜" ? "[4]" : "";
          return `\\sqrt${index}{${unbracketed(atom.body, depth)}}`;
        }
        case "frac": {
          const command = depth === 0 ? "\\dfrac" : "\\frac";
          const fraction = `${command}{${unbracketed(atom.top, depth + 1)}}{${unbracketed(atom.bottom, depth + 1)}}`;
          return atom.whole === undefined ? fraction : `${atom.whole}${fraction}`;
        }
        default:
          return "";
      }
    })
    .join("");
}

/** What a fraction part or a root holds: a group without its brackets, since the line or bar shows the grouping. */
function unbracketed(atom: Atom, depth: number): string {
  return atom.kind === "group" ? toLatex(atom.inner, depth) : toLatex([atom], depth);
}

function Formula({ atoms }: { atoms: Atom[] }) {
  const html = katex.renderToString(toLatex(atoms), {
    throwOnError: false,
    output: "htmlAndMathml",
    strict: "ignore",
    trust: false
  });
  return <span className="math-inline" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** The pieces of a text, with maths typeset. `realMaths` says whether plain numbers in it count as maths too. */
function renderPieces(atoms: Atom[], realMaths: boolean): ReactNode[] {
  return splitRuns(atoms).map((piece, index) => {
    if (piece.math) {
      const typeset = isRealMaths(piece.atoms) || (realMaths && piece.atoms.some(endsNumber));
      if (typeset) return <Formula key={index} atoms={piece.atoms} />;
      return piece.atoms.map((atom) => atom.text).join("");
    }
    const atom = piece.atom;
    // Prose in brackets may still hold maths: "(where x/3 > 1)".
    if (atom.kind === "group") {
      return (
        <span key={index}>
          {atom.open}
          {renderPieces(atom.inner, realMaths)}
          {atom.close}
        </span>
      );
    }
    return atom.text;
  });
}

/**
 * Text that may hold maths: a question, a statement, an option, an answer or
 * an explanation. Prose comes back in the page's font; each run of maths is
 * typeset, with MathML alongside for screen readers.
 */
export function MathText({ text, subjectId }: { text: string; subjectId?: string }) {
  const content = useMemo(() => {
    // An option that is one variable ("x") is maths in a maths question, and
    // set like the options beside it; anywhere else a lone letter is a word
    // ("a" in an English question).
    if (subjectId === "math" && /^\s*[A-Za-z]\s*$/.test(text)) {
      return <Formula atoms={[{ kind: "token", text: text.trim() }]} />;
    }
    if (!mayHaveMaths(text)) return text;
    const atoms = parse(text);
    const pieces = splitRuns(atoms);
    // An option or answer that is nothing but a number is set like the
    // maths options beside it.
    const alone = pieces.length === 1 && pieces[0].math && pieces[0].atoms.some(endsNumber);
    return renderPieces(atoms, alone || pieces.some((piece) => piece.math && isRealMaths(piece.atoms)));
  }, [text, subjectId]);

  return <>{content}</>;
}
