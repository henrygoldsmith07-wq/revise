// ---------------------------------------------------------------------------
// Equation balancing checks — deterministic chemistry sanity for marking.
//
// Parses simple formula equations ("2H2 + O2 -> 2H2O"), counts elements per
// side including leading coefficients, and reports whether they balance.
// Bracketed species (Ca(OH)2) and state symbols are deliberately out of scope:
// the parser returns null and callers treat the equation as unverifiable
// rather than wrong. Used by worked-solution validation as a warning-level
// quality gate — never as a hard mark decision on its own.
// ---------------------------------------------------------------------------

export interface BalanceResult {
  ok: boolean;
  left: Record<string, number>;
  right: Record<string, number>;
}

const SPECIES_RE = /^(\d+)?\s*([A-Z][a-zA-Z0-9]*)$/;
const ELEMENT_RE = /([A-Z][a-z]?)(\d*)/g;
const ARROW_RE = /->|→|⟶|==>/;

/** Element counts for one species ("H2SO4" → {H:2,S:1,O:4}); null when unparseable. */
function elementCounts(formula: string, multiplier = 1): Record<string, number> | null {
  if (!/^[A-Z]/.test(formula)) return null;
  const counts: Record<string, number> = {};
  let consumed = "";
  for (const match of formula.matchAll(ELEMENT_RE)) {
    consumed += match[0];
    const element = match[1];
    const n = match[2] ? parseInt(match[2], 10) : 1;
    counts[element] = (counts[element] ?? 0) + n * multiplier;
  }
  // Every character must have been an element-count pair — brackets, charges,
  // stray dots or lowercase starts make the equation unverifiable here.
  if (consumed !== formula) return null;
  return counts;
}

/**
 * Check one equation. Returns null when it is not a parseable two-sided
 * equation; otherwise per-side element counts plus whether they balance.
 */
export function checkEquationBalance(equation: string): BalanceResult | null {
  // Ionic equations ("Zn + 2H+ -> Zn2+ + H2") are out of scope: charges make
  // "+" ambiguous, so they are unverifiable here rather than misparsed.
  if (/[A-Za-z]\d?[+-](?![A-Za-z0-9])/.test(equation)) return null;
  const cleaned = equation.replace(/\((?:s|l|g|aq)\)/gi, "").replace(/[⇌⟶]/g, "->");
  const halves = cleaned.split(ARROW_RE);
  if (halves.length !== 2) return null;

  const sides = halves.map((half) => {
    const totals: Record<string, number> = {};
    for (const raw of half.split(/\+/)) {
      const token = raw.trim().replace(/[.,;]+$/, "");
      if (!token) continue;
      const match = token.match(SPECIES_RE);
      if (!match) return null;
      const coefficient = match[1] ? parseInt(match[1], 10) : 1;
      const counts = elementCounts(match[2], coefficient);
      if (!counts) return null;
      for (const [element, n] of Object.entries(counts)) {
        totals[element] = (totals[element] ?? 0) + n;
      }
    }
    return totals;
  });
  const [left, right] = sides;
  if (!left || !right) return null;

  const elements = new Set([...Object.keys(left), ...Object.keys(right)]);
  const ok = [...elements].every((element) => (left[element] ?? 0) === (right[element] ?? 0));
  return { ok, left, right };
}

/** Equations embedded in prose whose element counts do not balance. */
export function findUnbalancedEquations(text: string): string[] {
  const out: string[] = [];
  // Species-like tokens on both sides of an arrow, ending at punctuation or end.
  for (const match of text.matchAll(/([A-Za-z0-9][A-Za-z0-9\s+]*?(?:->|→|⟶|==>)[A-Za-z0-9+\s]+?[A-Za-z0-9])(?=$|[.,;)])/gm)) {
    const equation = match[1].trim();
    const result = checkEquationBalance(equation);
    if (result && !result.ok) out.push(equation);
  }
  return out;
}
