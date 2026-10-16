// ---------------------------------------------------------------------------
// Contradiction checks for the deterministic (offline / rubric) marker.
//
// The rubric marker credits a scheme point when enough of its content words
// appear in the answer. For short points that is dangerously generous: half
// of "Pulmonary vein" is "pulmonary", so "Pulmonary artery, right atrium"
// used to score 2/2 on a question whose answer is the pulmonary vein and the
// left atrium. The same blind spot let "b² + 4ac" stand in for "b² − 4ac",
// "< 0" for "> 0", "centre (−3, 2)" for "(3, −2)" and "both alleles are not
// expressed" for "both alleles are expressed".
//
// This module answers one question per scheme point: does the answer assert
// something the point contradicts? Each check is narrow and only ever
// REMOVES credit (or marks it contested); none of them can award a mark. A
// check only fires when the scheme's own term/value is absent from the
// relevant part of the answer, so a correct answer that mentions the opposite
// for contrast ("the pulmonary vein, not the artery") is left alone, but is
// reported as contested so the mark is shown as provisional.
//
// Pure: no React, no network, no storage.
// ---------------------------------------------------------------------------

export type ContradictionKind = "opposite-term" | "negation" | "sign" | "relation" | "value" | "formula";

export interface Contradiction {
  kind: ContradictionKind;
  /** What the answer said (short, learner-safe). */
  said: string;
  /** What the scheme needs instead. */
  needed: string;
}

// --- normalisation ---------------------------------------------------------

const SUBSCRIPTS: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };

function prose(text: string): string {
  return text
    .toLowerCase()
    .replace(/α/g, " alpha ")
    .replace(/β/g, " beta ")
    // Role names and quantities that contain a redox word without asserting
    // that anything is oxidised or reduced.
    .replace(/\b(?:oxidi[sz]ing|reducing)\s+agents?\b/g, " redoxagent ")
    .replace(/\boxidation\s+(?:numbers?|states?)\b/g, " oxnumber ")
    // "one cell thick" is the textbook way of saying thin.
    .replace(/\b(?:one|single)[\s-]+cell(?:s)?[\s-]+thick\b/g, " one cell thin ")
    .replace(/[’']/g, "'")
    .replace(/\bcan't\b|\bcannot\b/g, " can not ")
    .replace(/n't\b/g, " not");
}

function words(text: string): string[] {
  return prose(text).split(/[^a-z0-9]+/).filter(Boolean);
}

/** Clause-sized pieces of an answer; a scheme point is usually one clause. */
export function answerClauses(answer: string): string[] {
  return (answer ?? "")
    .split(/\r?\n|;|[!?]\s+|\.\s+|,\s+(?=[a-zα-ωA-Z(])|\s+but\s+|\s+whereas\s+|\s+although\s+/)
    .map((c) => c.trim())
    .filter(Boolean);
}

const STOP = new Set([
  "the", "a", "an", "of", "to", "in", "is", "are", "was", "were", "and", "or", "for", "on", "at", "by", "with",
  "as", "that", "this", "it", "its", "be", "from", "will", "can", "has", "have", "had", "but", "so", "if", "then",
  "than", "when", "which", "there", "any", "also", "into", "each", "their", "they", "one", "two", "does", "do",
  "not", "no", "never", "only", "very", "must", "may",
]);

function contentWords(text: string): string[] {
  return words(text).filter((w) => w.length > 1 && !STOP.has(w));
}

function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  return short.length >= 4 && long.startsWith(short.slice(0, Math.max(4, short.length - 2)));
}

// --- 1. opposite terms -----------------------------------------------------

/** Each group lists mutually exclusive terms, as word-start regexes. */
const OPPOSITES: Array<{ terms: RegExp[]; labels: string[] }> = [
  [["arter"], ["vein", "venous"]],
  [["left"], ["right"]],
  [["atri(?:um|a|al)\\b"], ["ventric"]],
  [["oxidi[sz]", "oxidation"], ["reduc"]],
  [["anode", "anodic"], ["cathode", "cathodic"]],
  [["endothermic"], ["exothermic"]],
  [["nucleophil"], ["electrophil"]],
  [["addition\\b"], ["substitution"], ["elimination"]],
  [["aerobic"], ["anaerobic"]],
  [["oxygenated"], ["deoxygenated"]],
  [["donor", "donat"], ["acceptor", "accepts\\b", "accepting"]],
  [["gain"], ["lose\\b", "loses\\b", "losing", "loss\\b"]],
  [["maximum"], ["minimum"]],
  [["increas", "rise\\b", "rises\\b", "rising"], ["decreas", "reduc", "falls?\\b", "falling", "drops?\\b"]],
  [["high\\b", "higher", "highest"], ["low\\b", "lower", "lowest"]],
  [["positive"], ["negative"]],
  [["thin\\b", "thinner"], ["thick\\b", "thicker"]],
  [["short\\b", "shorter", "shortens?\\b", "shortening"], ["long\\b", "longer", "lengthens?\\b", "lengthening"]],
  [["good\\b", "better\\b"], ["poor\\b", "worse\\b"]],
  [["once\\b"], ["twice\\b"]],
  [["alpha\\b"], ["beta\\b"]],
  [["insulin"], ["glucagon"]],
  [["dominant"], ["recessive"]],
  [["haploid"], ["diploid"]],
  [["mitosis", "mitotic"], ["meiosis", "meiotic"]],
  [["hypertonic"], ["hypotonic"]],
  [["attract"], ["repel"]],
  [["series\\b"], ["parallel"]],
  [["towards?\\b"], ["away\\b"]],
  [["clockwise"], ["anticlockwise"]],
  [["forward\\b"], ["reverse\\b", "backward"]],
  [["saturated"], ["unsaturated"]],
  [["soluble"], ["insoluble"]],
  [["hydrophilic"], ["hydrophobic"]],
  [["accelerat"], ["decelerat"]],
  [["upward"], ["downward"]],
  [["ionic\\b"], ["covalent"]],
  [["strong\\b", "strongly"], ["weak\\b", "weakly"]],
  [["absorb"], ["release"]],
  // Eleventh pass, from wrong answers to the new recall probes.
  [["rational"], ["irrational"]],
  [["full\\b", "fully"], ["partial", "incomplete"]],
  [["same\\b", "identical"], ["different\\b"]],
  [["acidic"], ["basic\\b", "alkaline"], ["amphoteric"]],
].map((group) => ({
  terms: group.map((alts) => new RegExp("^(?:" + alts.join("|") + ")")),
  labels: group.map((alts) => alts[0]!.replace(/\\b|\(\?:.*$|\[.*?\]/g, "").replace(/s\?$/, "")),
}));

function termIndex(ws: string[], term: RegExp): number[] {
  const hits: number[] = [];
  ws.forEach((w, i) => { if (term.test(w)) hits.push(i); });
  return hits;
}

const WINDOW = 2;

/** Words too generic to tie an opposite term to the point's subject. */
const WEAK_ANCHORS = new Set(["same", "need", "needs", "produce", "condition", "conditions", "give", "gives", "because", "therefore", "effect", "change", "changes", "value", "result", "cause", "causes", "make", "makes"]);

interface OppositeHit { group: number; wanted: number; found: number; foundWord: string; wantedWord: string }

function anchorsFor(point: string, group: { terms: RegExp[] }): string[] {
  return contentWords(point).filter((w) => !WEAK_ANCHORS.has(w) && !group.terms.some((t) => t.test(w)));
}

/** True when `at` sits within WINDOW words of one of the anchors, inside one clause. */
function nearAnchor(clauseWords: string[], at: number, anchors: string[]): boolean {
  return anchors.length === 0 ||
    clauseWords.some((w, i) => i !== at && Math.abs(i - at) <= WINDOW && anchors.some((a) => sameWord(a, w)));
}

/**
 * Opposite-term hits for one piece of text: the point uses term `wanted` of a
 * group, the text never uses it, and some clause of the text uses another term
 * of the same group right next to the thing the point is about (or anywhere,
 * when the point is just the term, e.g. "Insulin"). Proximity never crosses a
 * clause boundary, so a word about a different claim cannot veto this one.
 */
function oppositeHits(point: string, text: string): OppositeHit[] {
  const pw = words(point);
  const tw = words(text);
  // Distance is counted in content words: "shifted to the right" is adjacent.
  const clauses = answerClauses(text).map((c) => words(c).filter((w) => !STOP.has(w)));
  const hits: OppositeHit[] = [];
  OPPOSITES.forEach((group, g) => {
    const used = group.terms.map((t) => pw.some((w) => t.test(w)));
    const wanted = used.indexOf(true);
    // A point that names two terms of the group is a contrast; leave it.
    if (wanted < 0 || used.filter(Boolean).length > 1) return;
    if (termIndex(tw, group.terms[wanted]!).length) return;
    const wantedWord = pw.find((w) => group.terms[wanted]!.test(w)) ?? group.labels[wanted]!;
    const anchors = anchorsFor(point, group);
    for (const cw of clauses) {
      // "the forward reaction is exothermic" restates "the reverse reaction is
      // endothermic": a clause that flips forward/reverse flips the rest too.
      if (g !== FORWARD_GROUP && flipsGroup(pw, cw, FORWARD_GROUP)) continue;
      if (g === FORWARD_GROUP && OPPOSITES.some((_, other) => other !== g && flipsGroup(pw, cw, other))) continue;
      for (const [other, term] of group.terms.entries()) {
        if (other === wanted) continue;
        const at = termIndex(cw, term).find((i) => nearAnchor(cw, i, anchors));
        if (at != null) { hits.push({ group: g, wanted, found: other, foundWord: cw[at]!, wantedWord }); return; }
      }
    }
  });
  return hits;
}

const FORWARD_GROUP = OPPOSITES.findIndex((group) => group.terms[0]!.test("forward"));

/** The point uses one term of a group and the clause only another. */
function flipsGroup(pointWords: string[], clauseWords: string[], g: number): boolean {
  const group = OPPOSITES[g];
  if (!group) return false;
  const inPoint = group.terms.map((t) => pointWords.some((w) => t.test(w)));
  const inClause = group.terms.map((t) => clauseWords.some((w) => t.test(w)));
  const wanted = inPoint.indexOf(true);
  return wanted >= 0 && inPoint.filter(Boolean).length === 1 && !inClause[wanted] && inClause.some(Boolean);
}

/**
 * A hedge: one clause offers the point's term and its opposite as
 * alternatives ("the pulmonary vein or artery", "left/right atrium"). The
 * marker cannot tell which the student means, so the mark is provisional.
 */
function contestedOpposite(point: string, text: string): boolean {
  const pw = words(point);
  return answerClauses(text).some((clause) => {
    const cw = prose(clause).split(/[^a-z0-9/]+/).flatMap((w) => (w.includes("/") ? [w.split("/")[0]!, "or", ...w.split("/").slice(1)] : [w])).filter(Boolean);
    return OPPOSITES.some((group) => {
      const used = group.terms.map((t) => pw.some((w) => t.test(w)));
      const wanted = used.indexOf(true);
      if (wanted < 0 || used.filter(Boolean).length > 1) return false;
      const wantedAt = termIndex(cw, group.terms[wanted]!);
      return group.terms.some((term, other) => other !== wanted && termIndex(cw, term).some((at) =>
        wantedAt.some((w) => Math.abs(w - at) <= 4 && cw.slice(Math.min(w, at) + 1, Math.max(w, at)).includes("or"))));
    });
  });
}

// --- 2. negation -----------------------------------------------------------

const NEGATORS = new Set(["not", "never", "no", "none", "neither", "nor", "without"]);

/** Points that already state an absence or a limit; "does not accelerate" can paraphrase "acceleration is zero". */
const NEGATIVE_MEANING = /^(?:zero|only|rules?|ruled|out|exclud\w*|negligible|unchang\w*|avoid\w*|prevent\w*|stops?|lack\w*|absent|fails?|nothing|cannot|impossible|neither|none|unable|limit\w*|less|fewer|lower|reduc\w*|decreas\w*)$/;

const NEGATION_SKIP = new Set(["be", "a", "an", "the", "always", "all", "being"]);

/** "not constant", "not be independent": a negator directly governing one of the point's own words. */
function negatedContent(point: string, text: string): string | null {
  const pw = words(point);
  if (pw.some((w) => NEGATORS.has(w) || NEGATIVE_MEANING.test(w))) return null;
  const anchors = contentWords(point);
  const tw = words(text);
  for (const [i, w] of tw.entries()) {
    if (w !== "not" && w !== "never") continue;
    // "if substrate runs out, the rate will not double" qualifies the point
    // under another condition; it does not reverse it.
    if (tw.slice(0, i).some((x) => x === "if" || x === "unless" || x === "otherwise")) continue;
    let j = i + 1;
    while (j < tw.length && NEGATION_SKIP.has(tw[j]!)) j++;
    const governed = tw[j];
    if (!governed || governed === "only") continue; // "not only … but also"
    if (anchors.some((a) => sameWord(a, governed))) return `${w} ${tw.slice(i + 1, j + 1).join(" ")}`;
  }
  return null;
}

// --- 3–4. maths: operator signs and relations -------------------------------

function mathText(text: string): string {
  return text
    .replace(/[−–—]/g, "-")
    .replace(/[₀-₉]/g, (c) => SUBSCRIPTS[c] ?? c)
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/≠/g, "!=");
}

const OPERAND = "[A-Za-z0-9²³ⁿ⁺¹θπ.]+";

function isMathOperand(token: string): boolean {
  return /[0-9²³ⁿθπ]/.test(token) || token.length <= 3;
}

/**
 * (left operand, + or −, right operand) triples, e.g. "b² − 4ac" → "b²|-|4ac".
 * The left operand must be symbolic (contain a letter): sign slips in numeric
 * working are the numeric checks' job, and substituted working ("2x − 1" for
 * "2x + c") changes the right operand, so it is not read as a flipped sign.
 * Hyphenated words are not operators.
 */
function signedTerms(text: string): Set<string> {
  const out = new Set<string>();
  const re = new RegExp("(" + OPERAND + ")\\)?\\s*([+-])\\s*\\(?(" + OPERAND + ")", "g");
  for (const m of mathText(text).matchAll(re)) {
    const left = m[1]!;
    const right = m[3]!.replace(/[.,;:]+$/, "");
    const raw = m[0]!;
    // "semi-conservative", "carbon-carbon": a bare hyphen between words.
    if (m[2] === "-" && !/\s-|-\s/.test(raw) && /[a-z]{2,}$/i.test(left) && !/\d/.test(left)) continue;
    if (!isMathOperand(left) || !/[a-zθπ]/i.test(left)) continue;
    out.add(left.toLowerCase() + "|" + m[2] + "|" + right.toLowerCase());
  }
  return out;
}

function signConflict(point: string, text: string): Contradiction | null {
  const wanted = signedTerms(point);
  if (!wanted.size) return null;
  const given = signedTerms(text);
  for (const key of wanted) {
    if (given.has(key)) continue;
    const [left, op, right] = key.split("|");
    // A worded right operand ("GPP − energy lost in respiration") is the
    // scheme describing the term; any operand after the flipped sign counts.
    const flippedOp = op === "+" ? "-" : "+";
    const prose = /^[a-z]{4,}$/.test(right!);
    const flipped = [...given].some((g) => {
      const [gl, gop, gr] = g.split("|");
      return gl === left && gop === flippedOp && (gr === right || prose);
    });
    const sameSign = [...given].some((g) => g.startsWith(`${left}|${op}|`));
    if (flipped && !sameSign) {
      const sym = (o: string) => (o === "+" ? "+" : "−");
      return { kind: "sign", said: `${left} ${sym(flippedOp)}`, needed: `${left} ${sym(op!)}` };
    }
  }
  return null;
}

/** "cos 2θ = 2cos²θ − 1" vs "cos 2θ = 1 − 2cos²θ": same left side, different signed terms. */
function equationTerms(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const clause of mathText(text).split(/[,;]|\.\s|\band\b|\bfor\b|\bwhen\b|\bwhich\b/)) {
    const m = clause.match(/([^=<>!]{1,20})=([^=<>!]{1,40})$/);
    if (!m) continue;
    const lhs = m[1]!.replace(/\s+/g, "").toLowerCase();
    const rhs = m[2]!.replace(/\s+/g, "").replace(/\.$/, "").toLowerCase();
    if (!lhs || !rhs || /[a-z]{4,}/.test(lhs.replace(/sin|cos|tan|ln|sqrt/g, "")) ) continue;
    const terms = rhs.replace(/^(?=[^+-])/, "+").match(/[+-][^+-]+/g);
    if (!lhs.match(/^[a-z0-9²³θ()]+$/)) continue;
    if (!terms || terms.length < 2 || terms.some((t) => t.length > 12 || /[()/×^\[\]]/.test(t) || /[a-z]{4,}/.test(t.replace(/sin|cos|tan|ln/g, "")))) continue;
    out.set(lhs, [...terms].sort().join(""));
  }
  return out;
}

function equationConflict(point: string, text: string): Contradiction | null {
  const wanted = equationTerms(point);
  if (!wanted.size) return null;
  const given = equationTerms(text);
  for (const [lhs, terms] of wanted) {
    const actual = given.get(lhs);
    if (actual && actual !== terms) return { kind: "sign", said: `${lhs} = ${actual.replace(/^\+/, "")}`, needed: `${lhs} = ${terms.replace(/^\+/, "")}` };
  }
  return null;
}

/**
 * "dm/dt = −km" vs "dm/dt = km", "xₙ₊₁ = xₙ − f(xₙ)/f′(xₙ)" vs "… + …":
 * the same left side and the same right side apart from its + and − signs.
 * Only an otherwise identical expression counts, so a rearranged or
 * substituted answer is never read as a sign slip.
 */
function signOnlyEquations(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const clause of mathText(text).split(/[,;]|\.\s|\band\b|\bso\b|\bgives?\b|\bwhich\b|\bwhen\b|\bwith\b|\bwhere\b|\bfor\b/)) {
    const m = clause.match(/(\S{1,12})\s*=\s*(\S(?:[^=<>!]{0,30}\S)?)\s*\.?\s*$/);
    if (!m) continue;
    const lhs = m[1]!.toLowerCase();
    const rhs = m[2]!.replace(/\s+/g, "").replace(/\.$/, "").toLowerCase();
    // Symbols only: a worded side ("energy lost") is prose, not an expression.
    const worded = (side: string) => /[a-z]{4,}/.test(side.replace(/sin|cos|tan|ln|sqrt|exp/g, ""));
    if (worded(lhs) || worded(rhs)) continue;
    if (!/[a-zθλμρσ]/.test(rhs) || !/[a-zθλμρσ]/.test(lhs)) continue;
    if (!out.has(lhs)) out.set(lhs, rhs);
  }
  return out;
}

function signOmissionConflict(point: string, text: string): Contradiction | null {
  const wanted = signOnlyEquations(point);
  if (!wanted.size) return null;
  const given = signOnlyEquations(text);
  const unsigned = (e: string) => e.replace(/[+-]/g, "");
  const minus = (e: string) => (e.match(/-/g) ?? []).length;
  for (const [lhs, rhs] of wanted) {
    const actual = given.get(lhs);
    if (!actual || actual === rhs) continue;
    if (unsigned(actual) === unsigned(rhs) && minus(actual) !== minus(rhs)) {
      return { kind: "sign", said: `${lhs} = ${actual}`, needed: `${lhs} = ${rhs}` };
    }
  }
  return null;
}

const FLIP: Record<string, string> = { "<": ">", ">": "<", "<=": ">=", ">=": "<=", "=": "=", "!=": "!=" };

const MATH_TOKEN = /^[A-Za-z0-9²³ⁿ+\-^.()ρμσλ]+$/;

function mathy(token: string): boolean {
  // Bare letters count only as single variables, so "or", "is" and "so" end an expression.
  return MATH_TOKEN.test(token) && (/[0-9²³ⁿ+\-^()]/.test(token) || token.length === 1);
}

/** The maths expression touching a relation symbol: trailing tokens before it, leading tokens after it. */
function sideExpression(tokens: string[]): string[] {
  const kept: string[] = [];
  for (const raw of tokens) {
    const token = raw.replace(/[.,;:]+$/, "");
    if (!mathy(token)) break;
    kept.push(token);
  }
  return kept;
}

function relations(text: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const t = mathText(text);
  const parts = t.split(/(<=|>=|!=|<|>|=)/);
  const num = (s: string) => /^[+-]?\d+(?:\.\d+)?$/.test(s);
  const add = (key: string, op: string) => { const set = out.get(key) ?? new Set<string>(); set.add(op); out.set(key, set); };
  for (let i = 1; i < parts.length - 1; i += 2) {
    const op = parts[i]!;
    const lhs = sideExpression(parts[i - 1]!.trim().split(/\s+/).reverse()).reverse().join("").toLowerCase();
    const rhs = sideExpression(parts[i + 1]!.trim().split(/\s+/)).join("").replace(/[.,]+$/, "").toLowerCase();
    if (!lhs || !rhs) continue;
    if (num(rhs) && !num(lhs)) add(`${lhs}|${rhs}`, op);
    else if (num(lhs) && !num(rhs)) add(`${rhs}|${lhs}`, FLIP[op]!);
  }
  return out;
}

const OP_TEXT: Record<string, string> = { "<": "<", ">": ">", "<=": "≤", ">=": "≥", "=": "=", "!=": "≠" };

function relationConflict(point: string, text: string): Contradiction | null {
  const wanted = relations(point);
  const given = relations(text);
  // "H₀: ρ = 0" vs "H₀: ρ = 1": a population parameter (ρ, μ, σ, λ) set
  // equal to a different number. Parameters only: x and other unknowns
  // take several values in working and roots ("x = 0 and x = 2").
  for (const [key, ops] of wanted) {
    if (!ops.has("=") || given.get(key)?.has("=")) continue;
    const [lhs, rhs] = key.split("|");
    if (!/[λμρσ]/.test(lhs!)) continue;
    // Working often states other values: an answer that also sets the same
    // symbol to the scheme's value (under any relation) does not conflict.
    if ([...given].some(([k]) => k.split("|")[0] === lhs && Number(k.split("|")[1]) === Number(rhs))) continue;
    const rival = [...given].find(([k, o]) => o.has("=") && k.split("|")[0] === lhs && Number(k.split("|")[1]) !== Number(rhs));
    if (rival) return { kind: "value", said: `${lhs} = ${rival[0].split("|")[1]}`, needed: `${lhs} = ${rhs}` };
  }
  for (const [key, ops] of wanted) {
    const actual = given.get(key);
    if (!actual) continue;
    for (const op of ops) {
      if (op === "=" || op === "!=" || actual.has(op)) continue;
      const rival = [...actual].find((a) => a !== op && !ops.has(a));
      if (!rival) continue;
      const [lhs, rhs] = key.split("|");
      return { kind: "relation", said: `${lhs} ${OP_TEXT[rival]} ${rhs}`, needed: `${lhs} ${OP_TEXT[op]} ${rhs}` };
    }
  }
  return null;
}

// --- 5. stated values ------------------------------------------------------

const NUMBER = "[+-]?\\d+(?:\\.\\d+)?";

function readNumber(raw: string): number {
  return Number(raw.replace(/^\+/, ""));
}

function coordinatePairs(text: string): Array<[number, number]> {
  const re = new RegExp("\\(\\s*(" + NUMBER + ")\\s*,\\s*(" + NUMBER + ")\\s*\\)", "g");
  return [...mathText(text).matchAll(re)].map((m) => [readNumber(m[1]!), readNumber(m[2]!)]);
}

/** Quantities whose stated value is the answer itself in short recall/maths points. */
const NAMED_QUANTITIES = new Set(["radius", "diameter", "gradient", "intercept", "root", "roots", "mean", "median", "mode", "period", "frequency", "amplitude", "wavelength", "centre", "center"]);

/** "radius 5", "roots are 2", "radius is 5": a named quantity followed by its value. */
function namedValues(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const re = new RegExp("\\b([a-z]{4,})\\s+(?:(?:is|are|of|=|equals)\\s+)?(" + NUMBER + ")(?![\\d.]*\\s*[)/^²³+×*=-])", "gi");
  for (const m of mathText(text).matchAll(re)) {
    const name = m[1]!.toLowerCase();
    if (!NAMED_QUANTITIES.has(name)) continue;
    if (!out.has(name)) out.set(name, readNumber(m[2]!));
  }
  return out;
}

/** Words that are units: a different reading of a measured quantity is the numeric checks' job. */
const UNIT_WORDS = new Set(["mol", "kpa", "atm", "cm", "mm", "dm", "km", "kg", "mg", "ml", "nm", "mv", "kj", "kw", "kv", "hz", "ms", "min", "hours", "hour", "seconds", "years", "days", "minutes", "per", "cent", "percent", "marks", "mark"]);

/**
 * "A net gain of 2 ATP" vs "a net gain of 38 ATP": the same counted thing
 * with a different whole number, and the scheme's number nowhere in the
 * answer. Whole numbers only, never a unit, so rounding and unit conversion
 * stay with the numeric checks.
 */
function countConflict(point: string, text: string): Contradiction | null {
  const counts = (t: string) => [...mathText(t).matchAll(/(?<![\d.,])(\d{1,4})\s+([A-Za-z]{3,})\b/g)]
    .map((m) => ({ n: Number(m[1]), word: m[2]!.toLowerCase() }))
    .filter((c) => !UNIT_WORDS.has(c.word) && !STOP.has(c.word));
  const wanted = counts(point);
  if (wanted.length !== 1) return null;
  const w = wanted[0]!;
  const stated = new Set([...mathText(text).matchAll(/(?<![\d.])\d+(?:\.\d+)?/g)].map((m) => Number(m[0])));
  if (stated.has(w.n)) return null;
  const rival = counts(text).find((c) => c.word === w.word && c.n !== w.n);
  return rival ? { kind: "value", said: `${rival.n} ${rival.word}`, needed: `${w.n} ${w.word}` } : null;
}

/** "M : M+2 = 3 : 1" vs "1 : 1": a different numeric ratio, and the scheme's ratio nowhere in the answer. */
function ratioConflict(point: string, text: string): Contradiction | null {
  const ratios = (t: string) => [...mathText(t).matchAll(/(?<![\d.:])(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)(?![\d:]|\.\d)/g)]
    .map((m) => ({ raw: `${m[1]} : ${m[2]}`, value: Number(m[2]) ? Number(m[1]) / Number(m[2]) : NaN }))
    .filter((r) => Number.isFinite(r.value));
  const wanted = ratios(point);
  if (wanted.length !== 1) return null;
  const w = wanted[0]!;
  const given = ratios(text);
  if (!given.length || given.some((g) => Math.abs(g.value - w.value) < 1e-9)) return null;
  return { kind: "value", said: given[0]!.raw, needed: w.raw };
}

function valueConflict(point: string, text: string): Contradiction | null {
  const wantedPairs = coordinatePairs(point);
  if (wantedPairs.length) {
    const given = coordinatePairs(text);
    const same = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];
    if (given.length && !wantedPairs.some((w) => given.some((g) => same(w, g)))) {
      const w = wantedPairs[0]!;
      const g = given[0]!;
      return { kind: "value", said: `(${g[0]}, ${g[1]})`, needed: `(${w[0]}, ${w[1]})` };
    }
  }
  const counted = countConflict(point, text) ?? ratioConflict(point, text);
  if (counted) return counted;
  const wanted = namedValues(point);
  if (!wanted.size) return null;
  const given = namedValues(text);
  const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-6);
  const stated = [...mathText(text).matchAll(new RegExp("(?<![\\d.])" + NUMBER, "g"))].map((m) => readNumber(m[0]!));
  for (const [name, value] of wanted) {
    const actual = given.get(name);
    // Working often names intermediate values ("width is 10.2 + 2.8 = 13.0"),
    // so a different value only contradicts when the scheme's value is
    // nowhere in the answer.
    if (stated.some((n) => close(Math.abs(n), Math.abs(value)))) continue;
    if (actual != null && !close(actual, value)) {
      return { kind: "value", said: `${name} ${actual}`, needed: `${name} ${value}` };
    }
  }
  return null;
}

// --- 6. chemical formulae --------------------------------------------------

const ELEMENTS = new Set("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Ag Sn I Xe Cs Ba Pt Au Hg Pb".split(" "));

function isFormula(f: string): boolean {
  const body = f.replace(/[+-]$/, "");
  const symbols = body.match(/[A-Z][a-z]?\d*/g) ?? [];
  if (symbols.join("") !== body || !symbols.every((sym) => ELEMENTS.has(sym.replace(/\d+$/, "")))) return false;
  // Chemistry never writes a subscript 1, so C₁V or R₁ is physics notation.
  if (/(?<!\d)1(?!\d)/.test(body)) return false;
  return /\d|[+-]$/.test(f);
}

function formulae(text: string): string[] {
  const t = text.replace(/[₀-₉]/g, (c) => SUBSCRIPTS[c] ?? c).replace(/⁺/g, "+").replace(/⁻/g, "-");
  return [...t.matchAll(/\b((?:[A-Z][a-z]?\d*){1,6})([+-]?)(?![a-z])/g)]
    .map((m) => m[1]! + m[2]!)
    .filter(isFormula);
}

function skeleton(formula: string): string {
  return formula.replace(/[\d+-]/g, "");
}

function formulaConflict(point: string, text: string): Contradiction | null {
  const wanted = formulae(point);
  if (!wanted.length) return null;
  const given = formulae(text);
  for (const f of wanted) {
    if (given.includes(f)) continue;
    const rival = given.find((g) => skeleton(g) === skeleton(f) && g !== f);
    if (rival) return { kind: "formula", said: rival, needed: f };
  }
  return null;
}

// --- public API ------------------------------------------------------------

/** Answers up to this many words get the wording (opposite-term and negation) checks. */
export const SHORT_ANSWER_WORDS = 40;
/** Answers up to this many words are also checked as a whole, not only clause by clause. */
export const VERY_SHORT_ANSWER_WORDS = 15;

/** The clauses that match the point best (several when they tie, so clause order never matters). */
function bestClauses(point: string, answer: string): string[] {
  const clauses = answerClauses(answer);
  if (clauses.length <= 1) return [answer];
  const pointWords = contentWords(point);
  // The grammatical subject decides which clause a point is about: "M is
  // oxidised …" belongs to the clause about M even when the clause about N
  // shares more of its words.
  const subject = words(point)[0];
  const scored = clauses.map((clause) => {
    const cw = contentWords(clause);
    return {
      clause,
      score: pointWords.filter((p) => cw.some((c) => sameWord(p, c))).length +
        (subject && !STOP.has(subject) && words(clause)[0] === subject ? 3 : 0),
    };
  });
  const top = Math.max(...scored.map((s) => s.score));
  return scored.filter((s) => s.score === top).map((s) => s.clause);
}

/** The clause sits in a sentence that sets another condition before it ("If substrate runs out, …"). */
function conditionalClause(clause: string, answer: string): boolean {
  const sentence = answer.split(/(?<=[.!?])\s+|\r?\n/).find((candidate) => candidate.includes(clause)) ?? clause;
  const before = sentence.slice(0, Math.max(0, sentence.indexOf(clause)));
  return /\b(?:if|unless|otherwise)\b/i.test(before);
}

function clauseContradiction(point: string, clause: string, answer: string): Contradiction | null {
  const opposite = oppositeHits(point, clause)[0];
  if (opposite) return { kind: "opposite-term", said: opposite.foundWord, needed: opposite.wantedWord };
  const negation = conditionalClause(clause, answer) ? null : negatedContent(point, clause);
  return negation ? { kind: "negation", said: negation, needed: "the positive statement" } : null;
}

/**
 * The first contradiction between a scheme point and an answer, or null.
 * Checked against the whole answer and against the clause that matches the
 * point best, so "M is reduced …; N is oxidised …" cannot borrow the right
 * word for M from the clause about N.
 */
export function schemeContradiction(point: string, answer: string): Contradiction | null {
  const text = (answer ?? "").trim();
  if (!text || !point.trim()) return null;
  // Wording checks are for short answers, where one keyword decides a mark
  // and over-credit bites. A long answer makes several claims, and an
  // opposite word or a "not" there is usually about something else.
  const length = words(text).length;
  if (length <= SHORT_ANSWER_WORDS) {
    // Across the whole answer only for a very short one ("Pulmonary artery,
    // right atrium"); in a longer answer the opposite word may belong to a
    // different claim, so only the clause the point is about can veto.
    const whole = length <= VERY_SHORT_ANSWER_WORDS ? oppositeHits(point, text)[0] : undefined;
    if (whole) return { kind: "opposite-term", said: whole.foundWord, needed: whole.wantedWord };
    // Clause level: only when every clause that matches the point best
    // contradicts it, so a tie can never turn on sentence order.
    const clauses = bestClauses(point, text);
    const perClause = clauses.map((clause) => clauseContradiction(point, clause, text));
    if (perClause.every(Boolean)) return perClause[0]!;
  }
  return signConflict(point, text) ?? equationConflict(point, text) ?? signOmissionConflict(point, text) ?? relationConflict(point, text) ??
    valueConflict(point, text) ?? formulaConflict(point, text);
}

/**
 * True when an answer that earns a point also says the opposite about the
 * same thing ("the pulmonary vein or the pulmonary artery"). It may be a
 * contrast or a hedge; the marker cannot tell, so the mark is provisional.
 */
export function schemeContested(point: string, answer: string): boolean {
  const text = (answer ?? "").trim();
  return Boolean(text && point.trim() && words(text).length <= SHORT_ANSWER_WORDS && contestedOpposite(point, text));
}

/** Learner-facing sentence for a contradicted point. */
export function contradictionExplanation(c: Contradiction): string {
  switch (c.kind) {
    case "opposite-term":
      return `Not awarded: your answer says “${c.said}” where the mark scheme needs “${c.needed}”.`;
    case "negation":
      return `Not awarded: your answer says “${c.said}”, which reverses what this point needs.`;
    case "sign":
      return `Not awarded: your answer has “${c.said}” but the mark scheme has “${c.needed}” — check the sign.`;
    case "relation":
      return `Not awarded: your answer states ${c.said}, but the mark scheme needs ${c.needed}.`;
    case "value":
      return `Not awarded: your answer gives ${c.said}, but the mark scheme needs ${c.needed}.`;
    case "formula":
      return `Not awarded: your answer gives ${c.said}, but the mark scheme needs ${c.needed}.`;
  }
}
