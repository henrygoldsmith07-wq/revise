// ---------------------------------------------------------------------------
// Physics-aware transfer novelty.
//
// The generic comparison (`compareTransferStructures` on `deriveVerifiedGraph`)
// recognises reasoning by vocabulary written for the Maths, Biology and
// Chemistry depth packs ("titre", "membrane", "enzyme"). A Physics answer
// shows its reasoning as relations and substitutions instead, so on Physics
// the derived graphs are nearly empty and the verdict rests on chance word
// matches: an oscillation answer that says "the mass cancels" can earn an
// "enzyme-mechanism" operation, and a capacitor answer an "osmosis" one.
//
// For WJEC A-level Physics this module asks the three questions a Physics
// teacher would ask of a "transfer" item against its baseline:
//
//   1. Which physical relations does each worked solution actually use?
//      (P = IV, Q = CV, T = 2π√(m/k), ε = NΔΦ/Δt …), recognised from the
//      mark scheme and model answer, each bound to the step that shows it.
//   2. What is each prompt asking the student to find? (the unknowns named
//      in its instruction sentences: "Determine the resistance…").
//   3. Is the context different? (a different authored context id AND a
//      prompt whose content words mostly differ, so a renamed copy fails).
//
// Verdict: novel only when relations and unknowns are recognised on BOTH
// sides (it fails closed when it cannot see them), the context changed, and
// the transfer makes the student do something the baseline did not: solve
// for an unknown the baseline never asked for, or bring in a relation the
// baseline never used. A number swap, a renamed context or a reworded copy
// of the same relation solved for the same unknown is not novel.
//
// Used for Physics only (`transferNoveltyVerdict`). Every other subject keeps
// the generic comparison exactly as before.
//
// Pure and deterministic; no storage, network or model calls.
// ---------------------------------------------------------------------------

import type { QuestionPart } from "./types";

export const PHYSICS_SUBJECT_ID = "wjec-alevel-physics";

/** A relation family, recognised in one worked step. */
export interface PhysicsRelationHit {
  relation: string;
  /** The worked step (trimmed, at most 140 characters) that shows it. */
  evidence: string;
}

/**
 * Physical relations of the WJEC A-level Physics units that the linked
 * transfer items exercise. A relation is recognised only by its symbolic
 * form, an unambiguous numerical form with units, or a fixed phrase that
 * names the step ("parallel combination"). `requires`, when present, must
 * also match the same step, so "/√2" counts as an rms conversion only in a
 * step that talks about rms or peak values.
 */
const RELATIONS: ReadonlyArray<{ relation: string; pattern: RegExp; requires?: RegExp }> = [
  // Electricity and circuits
  { relation: "power-current-voltage", pattern: /\bP\s*=\s*(?:I\s*V|V\s*I)\b|\bI(?:_?\w{0,4})?\s*=\s*P\s*\/\s*V|\bV\s*=\s*P\s*\/\s*I\b/ },
  // Numerical Ohm's law ("I = 24/14 = 1.71 A") only in a step that names a resistance.
  { relation: "ohms-law", pattern: /\bI[^\s=]{0,4}\s*=\s*[\d.]+\s*\/\s*[\d.]+\s*=\s*[\d.]+\s*A\b/, requires: /Ω|ohm|\bR\b|resist|branch/i },
  { relation: "ohms-law", pattern: /\bR\s*=\s*V(?:_?\w{0,4})?\s*\/\s*I|\bV\s*=\s*I\s*R\b|\bI\s*=\s*(?:V|ε|emf)\s*\/\s*R\b|\bV\s*\/\s*\d[\d\s.,]*\s*(?:Ω|ohm)|\d\s*V\s*\/\s*\d[\d\s.,]*\s*(?:Ω|ohm)|resistance is [\d.]+\s*\/\s*[\d.]+/i },
  { relation: "joule-heating", pattern: /I\s*(?:²|\^\s*2)\s*[Rr]\b|V(?:_\w+)?\s*(?:²|\^\s*2)\s*\/\s*[RP]\b|P_?loss/ },
  { relation: "rms-peak", pattern: /√\s*2|sqrt\s*\(?\s*2\s*\)?/i, requires: /rms|peak|₀/i },
  { relation: "energy-power-time", pattern: /\bP\s*=\s*E\s*\/\s*t\b|\bE\s*=\s*P\s*t\b|\d\s*J\s*\/\s*\d[\d\s.,]*s\b/ },
  { relation: "transformer-turns", pattern: /N\s*[sₛ]\s*\/\s*N\s*[pₚ]|V\s*[sₛ]\s*\/\s*V\s*[pₚ]/ },
  { relation: "resistor-combination", pattern: /\b1\s*\/\s*R\b|parallel\s+(?:pair|combination)|\(\s*[\d.]+\s*[×x]\s*[\d.]+\s*\)\s*\/\s*\(\s*[\d.]+\s*\+\s*[\d.]+\s*\)|total\s+R\s*=|circuit\s+totals/i },
  { relation: "emf-internal-resistance", pattern: /\(\s*R\s*\+\s*r\s*\)|lost\s+volts|terminal\s+p\.?d/i },
  { relation: "supply-efficiency", pattern: /\befficiency\b|\bR\s*\/\s*\(\s*R\s*\+\s*r\s*\)/i },
  { relation: "potential-divider", pattern: /[\d.]+\s*[×x]\s*[\d.]+\s*\/\s*[\d.]+\s*=\s*[\d.]+\s*V\b|potential\s+divider/i },
  { relation: "pd-sharing", pattern: /rest\s+of\s+the\s+emf|summing\s+to\s+the\s+[\d.]+\s*V|shar(?:e|es|ing)\s+[\d.]+\s*V|\b[\d.]+\s*[−-]\s*[\d.]+\s*=\s*[\d.]+\s*V\b|check\s+[\d.]+\s*\+\s*[\d.]+\s*=\s*[\d.]+/i },
  // Capacitance
  { relation: "charge-capacitance", pattern: /\bQ\s*=\s*C(?:_?\w{0,6})?\s*V\b|\bC\s*=\s*Q\s*\/\s*V\b|\bV\w{0,3}\s*=\s*Q\s*\/\s*C\b|\bQ\s*=\s*[\d.]+\s*μF\s*[×x]/ },
  { relation: "parallel-plate", pattern: /ε\s*[₀0rᵣ]?\s*A\s*\/\s*d|ε\s*[₀0]?\s*A\s*\/\s*C|relative\s+permittivity|ε\s*[rᵣ]\s*=/ },
  { relation: "capacitor-energy", pattern: /(?:½|0\.5|1\/2)\s*(?:×\s*)?(?:C\s*V|Q\s*V|Q\s*(?:²|\^\s*2)\s*\/\s*C)|\(\s*C\s*\/\s*2\s*\)\s*V|U\s*=\s*0\.5\s*C/ },
  { relation: "capacitor-combination", pattern: /\b1\s*\/\s*C\b|parallel\s+strings\s+add|capacitances?\s+add/i },
  // Circular motion and SHM
  { relation: "angular-frequency", pattern: /ω\s*=\s*2\s*π\s*(?:f|\/\s*T)|T\s*=\s*2\s*π\s*\/\s*ω|f\s*=\s*ω\s*\/\s*\(?\s*2\s*π|2\s*π\s*\/\s*60|\/\s*\(\s*2\s*π\s*\)/ },
  { relation: "linear-angular-speed", pattern: /\bv\s*=\s*ω\s*r\b|\br\s*=\s*v\s*\/\s*ω/ },
  { relation: "centripetal-force", pattern: /v\s*(?:²|\^\s*2)\s*\/\s*\(?\s*g?\s*r\b|ω\s*(?:²|\^\s*2)\s*r\b|centripetal/i },
  { relation: "friction-limit", pattern: /μ\s*(?:m\s*g|N\b|≥|m\s*ω)/ },
  { relation: "shm-defining-equation", pattern: /a\s*=\s*[−-]?\s*ω\s*(?:²|\^\s*2)\s*x|ω\s*(?:²|\^\s*2)\s*=\s*a\s*\/\s*x|\ba\s*\/\s*x\b/ },
  { relation: "shm-maxima", pattern: /v_?\s*max\s*=\s*ω\s*A|a_?\s*max\s*=\s*ω\s*(?:²|\^\s*2)\s*A|\bω\s*A\b|ω\s*(?:²|\^\s*2)\s*A\b/ },
  { relation: "mass-spring-period", pattern: /T\s*=\s*2\s*π\s*√\s*\(?\s*m\s*\/\s*k|4\s*π\s*(?:²|\^\s*2)\s*m\s*\/\s*T|k\s*T\s*(?:²|\^\s*2)\s*\/\s*\(?\s*4\s*π/ },
  { relation: "elastic-energy", pattern: /(?:½|1\/2|0\.5)\s*k\s*[Axₓ]/ },
  { relation: "kinetic-energy", pattern: /(?:½|1\/2|0\.5)\s*m\s*v|√\s*\(\s*2\s*K\s*\/\s*m|sqrt\s*\(\s*2\s*K\s*\/\s*m/ },
  // Electromagnetic induction
  { relation: "faraday-law", pattern: /N\s*Δ\s*Φ|flux\s+linkage|rate\s+of\s+change\s+of\s+flux/i },
  { relation: "magnetic-flux", pattern: /Φ\s*=\s*B\s*A|flux\s+by\s+(?:2)?BA|\b2?BA\b/ },
  { relation: "charge-current-time", pattern: /\bQ\s*=\s*I\s*Δ?\s*t\b|\bQ\s*=\s*ε\s*t\s*\/\s*R|\bQ\s*=\s*N\s*Δ\s*Φ\s*\/\s*R|\bB\s*=\s*Q\s*R/ },
] as const;

/**
 * Quantities a prompt can ask for, longest phrase first so "rms current" is
 * read before "current". Matched only inside instruction sentences.
 */
const UNKNOWNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["current-rms", /\brms\s+current\b/i],
  ["current-peak", /\bpeak\s+current\b/i],
  ["turns-ratio", /\bturns\s+ratio\b/i],
  ["arrangement", /\b(?:smallest|minimum)\s+number\s+of\b|\bhow\s+they\s+are\s+arranged\b/i],
  ["friction-coefficient", /\bfriction\s+coefficient\b|\bcoefficient\s+of\s+friction\b/i],
  ["rotation-rate", /\brotation\s+rate\b|\brevolutions\s+per\s+minute\b/i],
  ["angular-velocity", /\bangular\s+(?:velocity|frequency|speed)\b/i],
  ["spring-constant", /\bspring\s+constant\b/i],
  ["flux-density", /\bmagnetic\s+flux\s+density\b|\bfield\s+strength\b/i],
  ["shm-test", /\bconsistent\s+with\s+simple\s+harmonic\s+motion\b/i],
  ["acceleration", /\bacceleration\b/i],
  ["speed", /\b(?:tip\s+|maximum\s+)?speed\b/i],
  ["capacitance", /\bcapacitances?\b/i],
  ["resistance", /\bresistances?\b/i],
  ["current", /\bcurrent\b/i],
  ["power", /\bpower\b|\b(?:cable|line)\s+loss\b|\bpower\s+dissipated\b/i],
  ["energy", /\benergy\b/i],
  ["charge", /\bcharge\b/i],
  ["pd", /\bpd\b|\bvoltages?\b|\breading\b/i],
  ["emf", /\bemf\b/i],
  ["separation", /\bseparation\b/i],
  ["radius", /\bradius\b/i],
  ["period", /\bperiod\b/i],
  ["frequency", /\bfrequency\b/i],
  ["amplitude", /\bamplitude\b/i],
  ["mass", /\bmass\b/i],
  ["efficiency", /\befficiency\b/i],
] as const;

const ASSUMPTION_CLAUSE = /,?\s*\b(?:neglecting|ignoring|assuming|treating|taking)\b[^,.;]*/gi;

const INSTRUCTION = /\b(?:calculate|determine|find|compare|show|deduce|estimate|work\s+out)\b/i;

const STOP = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into", "is", "it", "its", "of",
  "on", "or", "the", "this", "that", "to", "with", "each", "then", "when", "which", "while", "what",
  "calculate", "determine", "find", "compare", "show", "give", "answer", "value", "values", "total",
]);

function normalise(text: string): string {
  return text.replace(/[−–—]/g, "−").replace(/\bp\.\s?d\./gi, "pd").replace(/\s+/g, " ");
}

/** Worked steps: each mark-scheme point, then the model answer split at sentence ends (never inside a decimal). */
function workedSteps(part: QuestionPart): string[] {
  const answerSteps = normalise(part.modelAnswer).split(/(?<=[.;!?])\s+(?=[A-Z(])|\n+/);
  return [...(part.markScheme ?? []).map(normalise), ...answerSteps].map((step) => step.trim()).filter(Boolean);
}

function clip(text: string): string {
  return text.length > 140 ? `${text.slice(0, 137).trimEnd()}…` : text;
}

/** The physical relations a part's worked solution uses, each with the step that shows it. */
export function physicsRelationsUsed(part: QuestionPart): PhysicsRelationHit[] {
  const steps = workedSteps(part);
  const hits: PhysicsRelationHit[] = [];
  for (const { relation, pattern, requires } of RELATIONS) {
    if (hits.some((hit) => hit.relation === relation)) continue;
    const step = steps.find((candidate) => pattern.test(candidate) && (!requires || requires.test(candidate)));
    if (step) hits.push({ relation, evidence: clip(step) });
  }
  return hits;
}

/** The quantities a prompt asks the student to find, read from its instruction sentences only. */
export function physicsUnknowns(prompt: string): string[] {
  const sentences = normalise(prompt).split(/(?<=[.?!])\s+/).filter((sentence) => INSTRUCTION.test(sentence));
  const found = new Set<string>();
  for (const sentence of sentences) {
    // Only the clause after the instruction verb names what is asked for:
    // "Use the area under the line to find the energy" asks for energy.
    // A modelling assumption ("neglecting the spring's mass") is not an
    // unknown, so its clause is dropped before matching.
    const verb = sentence.search(INSTRUCTION);
    let rest = sentence.slice(Math.max(0, verb)).replace(ASSUMPTION_CLAUSE, " ");
    for (const [unknown, pattern] of UNKNOWNS) {
      if (pattern.test(rest)) {
        found.add(unknown);
        rest = rest.replace(new RegExp(pattern.source, "gi"), " ");
      }
    }
  }
  return [...found].sort();
}

function contentWords(prompt: string): Set<string> {
  return new Set(
    normalise(prompt)
      .toLowerCase()
      .replace(/[^a-z]+/g, " ")
      .split(" ")
      .filter((word) => word.length >= 4 && !STOP.has(word)),
  );
}

/** Share of content words two prompts have in common (Jaccard, 0..1). */
export function promptWordOverlap(left: string, right: string): number {
  const a = contentWords(left);
  const b = contentWords(right);
  if (!a.size && !b.size) return 1;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Above this word overlap a prompt is treated as the same setting, renamed or re-numbered. */
export const MAX_CONTEXT_WORD_OVERLAP = 0.5;

export interface PhysicsTransferComparison {
  isNovel: boolean;
  baselineRelations: string[];
  transferRelations: string[];
  baselineUnknowns: string[];
  transferUnknowns: string[];
  /** Relations the transfer uses that the baseline does not. */
  newRelations: string[];
  /** Unknowns the transfer asks for that the baseline does not. */
  newUnknowns: string[];
  contextChanged: boolean;
  promptWordOverlap: number;
  /** True when the only change is solving the baseline's own relations for a different unknown. */
  rearrangementOnly: boolean;
  /** Why it is not novel; empty when it is. */
  reasons: string[];
}

function contextKey(part: QuestionPart): string {
  return (part.learning?.contextId ?? "").trim().toLowerCase();
}

/** Compare a Physics transfer part against its baseline by relation, unknown and context. */
export function comparePhysicsTransfer(baseline: QuestionPart, transfer: QuestionPart): PhysicsTransferComparison {
  const baselineRelations = physicsRelationsUsed(baseline).map((hit) => hit.relation);
  const transferRelations = physicsRelationsUsed(transfer).map((hit) => hit.relation);
  const baselineUnknowns = physicsUnknowns(baseline.prompt);
  const transferUnknowns = physicsUnknowns(transfer.prompt);
  const baselineRelationSet = new Set(baselineRelations);
  const baselineUnknownSet = new Set(baselineUnknowns);
  const newRelations = transferRelations.filter((relation) => !baselineRelationSet.has(relation));
  const newUnknowns = transferUnknowns.filter((unknown) => !baselineUnknownSet.has(unknown));
  const overlap = promptWordOverlap(baseline.prompt, transfer.prompt);
  const baselineContext = contextKey(baseline);
  const transferContext = contextKey(transfer);
  const contextChanged = overlap <= MAX_CONTEXT_WORD_OVERLAP && (!baselineContext || !transferContext || baselineContext !== transferContext);
  const reasons: string[] = [];
  if (!baselineRelations.length) reasons.push("no physical relation recognised in the baseline's worked solution");
  if (!transferRelations.length) reasons.push("no physical relation recognised in the transfer's worked solution");
  if (!baselineUnknowns.length) reasons.push("the baseline prompt names no recognisable unknown");
  if (!transferUnknowns.length) reasons.push("the transfer prompt names no recognisable unknown");
  if (!contextChanged) reasons.push(`the context is unchanged (prompt word overlap ${overlap.toFixed(2)})`);
  if (!newRelations.length && !newUnknowns.length) reasons.push("same relations solved for the same unknowns as the baseline");
  return {
    isNovel: reasons.length === 0,
    baselineRelations,
    transferRelations,
    baselineUnknowns,
    transferUnknowns,
    newRelations,
    newUnknowns,
    contextChanged,
    promptWordOverlap: overlap,
    rearrangementOnly: newRelations.length === 0 && newUnknowns.length > 0,
    reasons,
  };
}

/** Human-readable failure detail for the subject audit. */
export function physicsNoveltyDetail(comparison: PhysicsTransferComparison): string {
  return `Physics transfer is not novel against its explicit baseline: ${comparison.reasons.join("; ")} (relations ${comparison.baselineRelations.join(", ") || "none"} → ${comparison.transferRelations.join(", ") || "none"}; unknowns ${comparison.baselineUnknowns.join(", ") || "none"} → ${comparison.transferUnknowns.join(", ") || "none"}) (transfer-not-novel).`;
}
