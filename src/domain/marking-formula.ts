/**
 * Formula evidence for the offline marker (pure).
 *
 * Keyword coverage cannot read an equation: "Use pV = nRT" has almost no
 * words, so "n = pV/RT = (1.2 × 10⁵ × 0.020)/(8.31 × 300)" scored nothing for
 * it, and "Cardiac output = 160 × 0.090 = 14.4" scored nothing for "Cardiac
 * output = heart rate × stroke volume". An examiner credits both. This module
 * recognises three things, and nothing looser:
 *
 *  1. the scheme's equation, possibly rearranged: the two equations hold for
 *     exactly the same values (checked numerically at fixed sample values, so
 *     "k = e/F" or "n = pR/VT" never pass for "F = ke" or "pV = nRT");
 *  2. the scheme's equation with numbers substituted: the same quantity on
 *     the left, an expression of the same shape on the right (operators,
 *     grouping, powers), and it evaluates to a value the part's own scheme or
 *     model answer reaches, so the right numbers went into the right places;
 *  3. a worked value ("E°cell = +0.34 − (−0.44)"): the answer gives the same
 *     quantity the same value.
 *
 * It only ever adds evidence for a point written as an equation; every veto
 * in marking.ts still runs after it.
 */

type Node =
  | { t: "num"; v: number }
  | { t: "var"; name: string }
  | { t: "add"; a: Node; b: Node }
  | { t: "sub"; a: Node; b: Node }
  | { t: "mul"; a: Node; b: Node }
  | { t: "div"; a: Node; b: Node }
  | { t: "pow"; a: Node; b: Node }
  | { t: "neg"; a: Node }
  | { t: "sqrt"; a: Node }
  | { t: "fn"; name: string; a: Node };

type Token =
  | { k: "num"; v: number }
  | { k: "id"; name: string; word: boolean }
  | { k: "op"; v: "+" | "-" | "*" | "/" | "^" | "(" | ")" | "=" | "sqrt" };

type Mode = "whole" | "split";

const SUPERSCRIPT: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "⁺": "+" };
const SUBSCRIPT: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };
const FUNCTIONS = new Set(["sin", "cos", "tan", "ln", "log", "exp"]);
const ARTICLES = new Set(["the", "a", "an", "its", "their", "this", "that"]);
/** Prose that introduces a formula in a scheme point ("Use pV = nRT"). */
const LEAD_IN = /^\s*(?:(?:uses?|using|or|from|apply|applies|recall|states?)\b\s*)+/i;

/** "18 000" → "18000": thousands written with a space are one number. */
export function joinThousands(text: string): string {
  return text.replace(/(?<![\d.])(\d{1,3})(?:[ \u00a0\u2009\u202f](\d{3}))+(?![\d.])/g, (m) => m.replace(/[ \u00a0\u2009\u202f]/g, ""));
}

function normalise(text: string): string {
  return joinThousands(text)
    .replace(/[−–—]/g, "-")
    .replace(/[×·∙⋅*]/g, "*")
    .replace(/÷/g, "/")
    .replace(/≈/g, "=")
    .replace(/½/g, "(1/2)")
    .replace(/¼/g, "(1/4)")
    .replace(/¾/g, "(3/4)")
    // A literal x between two numbers is a times sign ("2 x 3").
    .replace(/(\d)\s*x\s*(?=\d)/g, "$1*")
    .replace(/[⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => "^(" + [...run].map((c) => SUPERSCRIPT[c] ?? c).join("") + ")")
    .replace(/[₀-₉]+/g, (run) => "_" + [...run].map((c) => SUBSCRIPT[c] ?? c).join(""));
}

const LETTER = /[A-Za-zα-ωΑ-ΩΔδµμℓ°']/;

/**
 * Tokens for one member of an equation, or null when it holds anything this
 * reader does not understand (it then gives no evidence at all).
 * In "whole" mode a run of letters is one quantity ("GPP", "nRT"); in
 * "split" mode a run that is not an English word is a product of one-letter
 * quantities ("mcΔT" = m·c·ΔT). Words always stay whole ("heart rate").
 */
function lex(text: string, mode: Mode): Token[] | null {
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    const number = /^(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?/i.exec(text.slice(i));
    if (number) {
      let value = Number(number[0]);
      i += number[0].length;
      // Scientific notation stays one number: "1.2 * 10^(5)".
      const sci = /^\s*\*\s*10\s*\^\s*\(?\s*([+-]?\d+)\s*\)?/.exec(text.slice(i));
      if (sci) { value *= 10 ** Number(sci[1]); i += sci[0].length; }
      out.push({ k: "num", v: value });
      continue;
    }
    if (ch === "[") {
      const close = text.indexOf("]", i);
      if (close < 0) return null;
      out.push({ k: "id", name: text.slice(i, close + 1).replace(/\s+/g, ""), word: false });
      i = close + 1;
      continue;
    }
    if ("+-*/^()=".includes(ch)) { out.push({ k: "op", v: ch as "+" }); i++; continue; }
    if (ch === "√") { out.push({ k: "op", v: "sqrt" }); i++; continue; }
    if (ch === "π") { out.push({ k: "num", v: Math.PI }); i++; continue; }
    if (LETTER.test(ch)) {
      let j = i;
      while (j < text.length) {
        if (LETTER.test(text[j]!)) { j++; continue; }
        // A subscript stays with its symbol: "H_2", "v_0".
        if (text[j] === "_" && /\d/.test(text[j + 1] ?? "")) {
          j++;
          while (/\d/.test(text[j] ?? "")) j++;
          continue;
        }
        break;
      }
      const run = text.slice(i, j);
      i = j;
      // Probability and expectation notation is one quantity: P(A|B), P(X ≤ 3).
      if (/^(?:P|E|Var)$/.test(run) && text[i] === "(") {
        const close = text.indexOf(")", i);
        const inner = close > 0 ? text.slice(i + 1, close) : "";
        if (close > 0 && !inner.includes("(") && /[|∩∪≤≥<>=]|^\s*[A-Za-z]\s*$/.test(inner)) {
          out.push({ k: "id", name: run + "(" + inner.replace(/\s+/g, "") + ")", word: false });
          i = close + 1;
          continue;
        }
      }
      if (FUNCTIONS.has(run.toLowerCase())) { out.push({ k: "id", name: "fn:" + run.toLowerCase(), word: false }); continue; }
      const word = /^[a-z]{3,}$/.test(run) || /^[A-Z][a-z]{2,}$/.test(run);
      if (word) {
        const name = run.toLowerCase();
        const previous = out[out.length - 1];
        if (ARTICLES.has(name)) continue;
        // Consecutive words name one quantity ("heart rate", "stroke volume"),
        // and so, read whole, does a symbol with its word ("CO₂ produced").
        if (previous?.k === "id" && (previous.word || mode === "whole") && !previous.name.startsWith("fn:")) {
          previous.name += " " + name;
          previous.word = true;
        }
        else out.push({ k: "id", name, word: true });
        continue;
      }
      if (mode === "whole" || /°|_\d+[a-z]{2,}/.test(run)) { out.push({ k: "id", name: run, word: false }); continue; }
      for (const piece of run.match(/[Δδ]?[A-Za-zα-ωΑ-ΩµμℓΔ](?:_\d+)?'?°?/g) ?? []) out.push({ k: "id", name: piece, word: false });
      continue;
    }
    return null;
  }
  return out;
}

class Parser {
  private at = 0;
  constructor(private readonly tokens: Token[]) {}
  parse(): Node | null {
    try {
      const node = this.expr();
      return this.at === this.tokens.length ? node : null;
    } catch {
      return null;
    }
  }
  private peek(): Token | undefined { return this.tokens[this.at]; }
  private isOp(v: string): boolean { const t = this.peek(); return t?.k === "op" && t.v === v; }
  private expr(): Node {
    let node = this.term();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.tokens[this.at++] as { v: string }).v;
      node = { t: op === "+" ? "add" : "sub", a: node, b: this.term() };
    }
    return node;
  }
  // Explicit × and ÷ bind looser than juxtaposition, as written formulas mean
  // them: "pV/RT" is pV ÷ (RT), "Q/mΔT" is Q ÷ (mΔT).
  private term(): Node {
    let node = this.juxtaposed();
    while (this.isOp("*") || this.isOp("/")) {
      const op = (this.tokens[this.at++] as { v: string }).v;
      node = { t: op === "*" ? "mul" : "div", a: node, b: this.juxtaposed() };
    }
    return node;
  }
  private juxtaposed(): Node {
    let node = this.unary();
    while (this.startsAtom()) node = { t: "mul", a: node, b: this.power() };
    return node;
  }
  private startsAtom(): boolean {
    const t = this.peek();
    return Boolean(t && (t.k === "num" || t.k === "id" || (t.k === "op" && (t.v === "(" || t.v === "sqrt"))));
  }
  private unary(): Node {
    if (this.isOp("-")) { this.at++; return { t: "neg", a: this.unary() }; }
    if (this.isOp("+")) { this.at++; return this.unary(); }
    return this.power();
  }
  private power(): Node {
    const base = this.atom();
    if (this.isOp("^")) { this.at++; return { t: "pow", a: base, b: this.unary() }; }
    return base;
  }
  private atom(): Node {
    const t = this.tokens[this.at++];
    if (!t) throw new Error("end");
    if (t.k === "num") return { t: "num", v: t.v };
    if (t.k === "id") {
      if (t.name.startsWith("fn:")) {
        if (!this.isOp("(")) throw new Error("function");
        return { t: "fn", name: t.name.slice(3), a: this.atom() };
      }
      return { t: "var", name: t.name };
    }
    if (t.v === "(") {
      const inner = this.expr();
      if (!this.isOp(")")) throw new Error("paren");
      this.at++;
      return inner;
    }
    if (t.v === "sqrt") return { t: "sqrt", a: this.power() };
    throw new Error("token");
  }
}

function parse(text: string, mode: Mode): Node | null {
  const tokens = lex(text, mode);
  if (!tokens?.length || tokens.some((t) => t.k === "op" && t.v === "=")) return null;
  // A word run straight into a symbol or number is prose around a formula
  // ("ω²r gives ω"), not a product: such a member says nothing here.
  for (let i = 0; i + 1 < tokens.length; i++) {
    const a = tokens[i]!;
    const b = tokens[i + 1]!;
    if (a.k !== "op" && b.k !== "op" && ((a.k === "id" && a.word) || (b.k === "id" && b.word))) return null;
  }
  return new Parser(tokens).parse();
}

function variables(node: Node, into = new Set<string>()): Set<string> {
  if (node.t === "var") into.add(node.name);
  else if (node.t === "neg" || node.t === "sqrt" || node.t === "fn") variables(node.a, into);
  else if (node.t !== "num") { variables(node.a, into); variables(node.b, into); }
  return into;
}

function operators(node: Node): number {
  if (node.t === "num" || node.t === "var") return 0;
  if (node.t === "neg") return operators(node.a);
  if (node.t === "sqrt" || node.t === "fn") return 1 + operators(node.a);
  return 1 + operators(node.a) + operators(node.b);
}

function evaluate(node: Node, env: Map<string, number>): number {
  switch (node.t) {
    case "num": return node.v;
    case "var": return env.get(node.name) ?? NaN;
    case "neg": return -evaluate(node.a, env);
    case "sqrt": return Math.sqrt(evaluate(node.a, env));
    case "fn": {
      const x = evaluate(node.a, env);
      return node.name === "sin" ? Math.sin(x) : node.name === "cos" ? Math.cos(x) : node.name === "tan" ? Math.tan(x)
        : node.name === "exp" ? Math.exp(x) : node.name === "ln" ? Math.log(x) : Math.log10(x);
    }
    case "add": return evaluate(node.a, env) + evaluate(node.b, env);
    case "sub": return evaluate(node.a, env) - evaluate(node.b, env);
    case "mul": return evaluate(node.a, env) * evaluate(node.b, env);
    case "div": return evaluate(node.a, env) / evaluate(node.b, env);
    case "pow": return evaluate(node.a, env) ** evaluate(node.b, env);
  }
}

/**
 * The shape of an expression with every quantity and number as a blank:
 * sums and products are order-free, a power keeps a numeric exponent.
 */
function shape(node: Node): string {
  const sum: string[] = [];
  const collectSum = (n: Node, sign: string) => {
    if (n.t === "add") { collectSum(n.a, sign); collectSum(n.b, sign); }
    else if (n.t === "sub") { collectSum(n.a, sign); collectSum(n.b, sign === "+" ? "-" : "+"); }
    else sum.push(sign + factorShape(n));
  };
  if (node.t === "add" || node.t === "sub") {
    collectSum(node, "+");
    return "S(" + sum.sort().join(",") + ")";
  }
  return factorShape(node);
}

function factorShape(node: Node): string {
  if (node.t === "num" || node.t === "var") return "x";
  if (node.t === "neg") return factorShape(node.a);
  if (node.t === "sqrt") return "R(" + shape(node.a) + ")";
  if (node.t === "fn") return node.name + "(" + shape(node.a) + ")";
  if (node.t === "pow") return "P(" + shape(node.a) + "," + (node.b.t === "num" ? String(node.b.v) : shape(node.b)) + ")";
  if (node.t === "mul" || node.t === "div") {
    const top: string[] = [];
    const bottom: string[] = [];
    const collect = (n: Node, up: boolean) => {
      if (n.t === "mul") { collect(n.a, up); collect(n.b, up); }
      else if (n.t === "div") { collect(n.a, up); collect(n.b, !up); }
      else if (n.t === "neg") collect(n.a, up);
      else (up ? top : bottom).push(shape(n));
    };
    collect(node, true);
    return "M(" + top.sort().join(",") + "/" + bottom.sort().join(",") + ")";
  }
  return shape(node);
}

function close(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (Math.abs(a - b) <= 0.01 * scale) return true;
  // Rounded to two significant figures, guarded against distant values.
  return Math.abs(a - b) <= 0.06 * scale && Number(a.toPrecision(2)) === Number(b.toPrecision(2));
}

function exact(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

const SAMPLES = [1.37, 2.71, 0.53, 3.19, 1.83, 2.29, 0.79, 4.07, 1.11, 2.53, 3.61, 0.97];

function sampleEnv(names: string[], trial: number): Map<string, number> {
  return new Map(names.map((name, index) => [name, SAMPLES[(index * 5 + trial * 7) % SAMPLES.length]!]));
}

interface Equation {
  left: Node;
  right: Node;
  leftText: string;
  /** Values the point goes on to work out ("E = hc/λ = 6.63e-34 × 3.00e8 / 620e-9"). */
  worked: number[];
}

/** The equations in a scheme point written as a formula, in both readings. */
function pointEquations(point: string, mode: Mode): Equation[] {
  const text = normalise(point.replace(LEAD_IN, "")).replace(/[.;]\s*$/, "");
  // A point is a formula only when it is (almost) nothing but the equation:
  // "Use pV = nRT", "Cardiac output = heart rate × stroke volume". Prose
  // around an equation is left to keyword coverage.
  const alternatives = text.split(/\s+or\s+/i);
  const out: Equation[] = [];
  for (const alternative of alternatives) {
    const members = alternative.split("=").map((member) => member.trim());
    if (members.length < 2 || members.some((member) => !member)) continue;
    const leftText = stripLabel(members[0]!);
    const left = parse(leftText, mode);
    const right = parse(members[1]!, mode);
    if (!left || !right) continue;
    const worked = members.slice(2).flatMap((member) => {
      const node = leadingNumber(member, mode);
      if (!node || !isNumeric(node)) return [];
      const value = evaluate(node, new Map());
      return Number.isFinite(value) ? [value] : [];
    });
    out.push({ left, right, leftText, worked });
  }
  return out;
}

/** "fringe spacing w" → "w": a word label in front of a symbol is not part of it. */
function stripLabel(member: string): string {
  const labelled = /^(?:[A-Za-z]{3,}\s+)+([^\s].*)$/.exec(member);
  if (labelled && !/^[a-z]{3,}$/i.test(labelled[1]!.split(/\s+/)[0]!) && parse(labelled[1]!, "split")) return labelled[1]!;
  return member;
}

/** Equality chains in an answer: "c = Q/(mΔT) = 12000/(0.40 × 15) = 2000 J". */
function answerChains(answer: string): string[][] {
  const chains: string[][] = [];
  // A list marker is layout, not part of the first quantity ("- Cardiac output = …").
  const text = normalise(answer.replace(/^[ \t]*(?:[-•*·–]|\d+[.)])[ \t]+/gm, ""))
    // "The efficiency is 1.8/2.4" is the same statement as "= 1.8/2.4".
    .replace(/\s+(?:is|are|was|equals|gives)\s+(?=[-+]?\s*(?:\d|\.\d|√|\())/gi, " = ");
  for (const clause of text.split(/(?<=[^\d\s])\.\s+|\.\s+(?=[A-Z])|;\s*|,\s+|\s+(?:so|and|since|because|therefore|giving|which|where|then|thus|hence)\s+|\n/i)) {
    if (!clause.includes("=")) continue;
    const members = clause.split("=").map((member) => member.trim()).filter(Boolean);
    if (members.length < 2) continue;
    // "Since d²y/dx²", "Rearranging a": the lead-in words are not the quantity.
    // Kept as written too, so a word label ("Cardiac output") still matches.
    chains.push(members);
    const stripped = stripLabel(members[0]!);
    if (stripped !== members[0]) chains.push([stripped, ...members.slice(1)]);
  }
  return chains;
}

/** The longest leading part of a member that is a pure number expression ("2000 J kg^(-1)" → 2000). */
function leadingNumber(member: string, mode: Mode): Node | null {
  const tokens = lex(member, mode);
  if (!tokens) {
    // Text this reader cannot tokenise after the expression (units, prose).
    const cut = member.search(/[^\d\s.+\-*/^()√πA-Za-zα-ωΑ-ΩΔδµμℓ°'_[\]]/);
    return cut > 0 ? leadingNumber(member.slice(0, cut), mode) : null;
  }
  // Only numbers, operators and brackets: a unit or a word ends it.
  let end = 0;
  while (end < tokens.length && tokens[end]!.k !== "id" && !(tokens[end]!.k === "op" && (tokens[end] as { v: string }).v === "=")) end++;
  for (; end > 0; end--) {
    const node = new Parser(tokens.slice(0, end)).parse();
    if (node) return node;
  }
  return null;
}

/** The trailing quantity a member names: "The water gains q" → q, "Exercise minute ventilation" → its words. */
function sameQuantity(pointLeft: string, answerMember: string, mode: Mode): boolean {
  const want = lex(normalise(pointLeft), mode);
  const have = lex(answerMember, mode);
  if (!want?.length || !have?.length || have.length < want.length) return false;
  const key = (t: Token) => (t.k === "id" ? (t.word ? "w:" + t.name : "s:" + t.name) : t.k === "num" ? "n:" + t.v : "o:" + t.v);
  const tail = have.slice(have.length - want.length);
  if (!tail.every((t, index) => {
    const w = want[index]!;
    if (t.k === "id" && w.k === "id" && t.word && w.word) {
      // The answer may name the quantity more fully: "exercise minute ventilation".
      return t.name === w.name || t.name.endsWith(" " + w.name);
    }
    return key(t) === key(w);
  })) return false;
  // A symbol on the left must be the whole member or follow a word label.
  const before = have[have.length - want.length - 1];
  return !before || (before.k === "id" && before.word);
}

/** Every number expression the answer's equality chains state. */
function answerValues(chains: string[][], mode: Mode): number[] {
  return chains.flatMap((members) => members.flatMap((member) => {
    const node = leadingNumber(member, mode);
    if (!node || !isNumeric(node)) return [];
    const value = evaluate(node, new Map());
    return Number.isFinite(value) ? [value] : [];
  }));
}

function isNumeric(node: Node): boolean {
  return variables(node).size === 0;
}

/** Rearranged or identical: both equations hold for exactly the same values. */
function sameEquation(a: Equation, left: Node, right: Node): boolean {
  const names = [...variables(a.left), ...variables(a.right)];
  const wanted = new Set(names);
  const given = new Set([...variables(left), ...variables(right)]);
  if (wanted.size < 2 || wanted.size !== given.size || [...wanted].some((name) => !given.has(name))) return false;
  const all = [...wanted].sort();
  const holds = (eqLeft: Node, eqRight: Node, env: Map<string, number>) => exact(evaluate(eqLeft, env), evaluate(eqRight, env));
  // Solve one equation for a quantity it isolates, then test the other there.
  const isolated = (solveLeft: Node, solveRight: Node, testLeft: Node, testRight: Node) => {
    if (solveLeft.t !== "var") return false;
    const target = solveLeft.name;
    if (variables(solveRight).has(target)) return false;
    return [0, 1, 2].every((trial) => {
      const env = sampleEnv(all.filter((name) => name !== target), trial);
      env.set(target, evaluate(solveRight, env));
      return Number.isFinite(env.get(target)) && holds(testLeft, testRight, env);
    });
  };
  if (isolated(left, right, a.left, a.right) || isolated(right, left, a.left, a.right)) return true;
  if (isolated(a.left, a.right, left, right) || isolated(a.right, a.left, left, right)) return true;
  // Neither side isolates a quantity: the same two sides, either way round.
  const sides = (x: Node, y: Node) => [0, 1, 2].every((trial) => {
    const env = sampleEnv(all, trial);
    return exact(evaluate(a.left, env), evaluate(x, env)) && exact(evaluate(a.right, env), evaluate(y, env));
  });
  return sides(left, right) || sides(right, left);
}

/**
 * True when a scheme point is an equation and the answer writes an equation
 * in exactly the same quantities that does not hold for the same values
 * ("v² = u² − 2as" for "v² = u² + 2as", "k = e/F" for "F = ke"), and never
 * writes an equivalent one. Keyword coverage cannot see a changed sign or a
 * swapped quotient, so this only ever removes credit.
 */
export function formulaContradicted(point: string, answer: string): boolean {
  if (!/[=≈]/.test(point) || !/[=≈]/.test(answer)) return false;
  const pointText = point.replace(LEAD_IN, "");
  if ((pointText.match(/\b[a-z]{4,}\b/g) ?? []).length > 6) return false;
  // Derivatives and integrals: several true statements share the same
  // letters ("dy/dx = 3x² − 12x + 9" and "d²y/dx² = 6x − 12").
  if (/d[²2]?\s*[a-zA-Zθ]\s*\/\s*d[a-zA-Zθ]|∫|\bd\s*\//.test(point)) return false;
  // A digit typed straight after a letter ("CV2", "u2") may be a power or a
  // label; such an equation is too ambiguous to call different.
  const chains = answerChains(answer).filter((members) => !members.some((member) => /[A-Za-zα-ωΔ][0-9]/.test(member)));
  let differs = false;
  for (const mode of ["split", "whole"] as const) {
    for (const equation of pointEquations(point, mode)) {
      if (isNumeric(equation.right) || isNumeric(equation.left)) continue;
      const wanted = new Set([...variables(equation.left), ...variables(equation.right)]);
      if (wanted.size < 2) continue;
      for (const members of chains) {
        const parsed = members.map((member) => parse(member, mode));
        for (let i = 0; i + 1 < parsed.length; i++) {
          const left = parsed[i];
          const right = parsed[i + 1];
          if (!left || !right || isNumeric(left) || isNumeric(right)) continue;
          const given = new Set([...variables(left), ...variables(right)]);
          if (given.size !== wanted.size || [...given].some((name) => !wanted.has(name))) continue;
          if (sameEquation(equation, left, right)) return false;
          differs = true;
        }
      }
    }
  }
  return differs;
}

/**
 * True when the answer shows the formula a scheme point states, rearranged,
 * substituted with the right numbers, or worked to the same value.
 * `expected` holds the values the part's own scheme and model answer reach.
 */
export function formulaEvidence(point: string, answer: string, expected: () => number[]): boolean {
  if (!/[=≈]/.test(point) || !/[=≈]|\s(?:is|are|was|equals|gives)\s/.test(answer)) return false;
  // A point that is mostly prose with an equation inside is coverage's job.
  const pointText = point.replace(LEAD_IN, "");
  if ((pointText.match(/\b[a-z]{4,}\b/g) ?? []).length > 6) return false;
  const chains = answerChains(answer);
  if (!chains.length) return false;
  for (const mode of ["split", "whole"] as const) {
    for (const equation of pointEquations(point, mode)) {
      const symbolic = !isNumeric(equation.right);
      for (const members of chains) {
        if (symbolic) {
          // 1. The equation itself, possibly rearranged.
          const parsed = members.map((member) => parse(member, mode));
          for (let i = 0; i + 1 < parsed.length; i++) {
            const left = parsed[i];
            const right = parsed[i + 1];
            if (left && right && !isNumeric(left) && !isNumeric(right) && sameEquation(equation, left, right) &&
              // A point that also works the formula out needs that working too:
              // the right formula with the wrong numbers is half of it.
              equation.worked.every((value) => answerValues(chains, mode).some((given) => close(given, value)))) return true;
          }
          // 2. Numbers substituted into the same quantity's formula.
          const start = members.findIndex((member) => sameQuantity(equation.leftText, member, mode));
          if (start < 0) continue;
          const wantShape = shape(equation.right);
          for (const member of members.slice(start + 1)) {
            const node = leadingNumber(member, mode);
            if (!node || !isNumeric(node) || operators(node) === 0) continue;
            if (shape(node) !== wantShape) continue;
            const value = evaluate(node, new Map());
            if (expected().some((target) => close(value, target))) return true;
          }
        } else {
          // 3. A worked value for the same quantity.
          if (operators(equation.right) === 0) continue;
          const start = members.findIndex((member) => sameQuantity(equation.leftText, member, mode));
          if (start < 0) continue;
          const target = evaluate(equation.right, new Map());
          for (const member of members.slice(start + 1)) {
            const node = leadingNumber(member, mode);
            if (node && isNumeric(node) && close(evaluate(node, new Map()), target)) return true;
          }
        }
      }
    }
  }
  return false;
}
