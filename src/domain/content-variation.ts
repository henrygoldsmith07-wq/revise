// ---------------------------------------------------------------------------
// Content variation — honest depth, not coverage gaming.
//
// Flags shallow variants before they inflate family counts:
//   - near-duplicate stems (same reasoning path, superficial context change)
//   - repeated numerical templates (same numbers with swapped labels)
//   - duplicated mark-scheme logic or implausibly similar model answers
//   - families incorrectly counted as independent
//
// Pure and conservative: flags candidates for human authoring review, never
// auto-merges or auto-approves. Demand diversity (recall/application/transfer)
// is measured from authored part metadata, not inferred scores.
// ---------------------------------------------------------------------------

import { questionFamilies, questionReasoningMoves } from "./learning-evidence";
import type { Id, Question } from "./types";

export interface ShallowVariantIssue {
  kind: "near-duplicate" | "same-reasoning-path" | "numerical-template" | "duplicate-mark-scheme" | "similar-model-answer" | "weak-family-independence";
  questionIds: Id[];
  detail: string;
}

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9.+\-*/= ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / (a.size + b.size - shared);
}

function numbersIn(text: string): string[] {
  return (text.match(/-?\d+(?:\.\d+)?(?:\s*[×x*]\s*10\s*\^?\s*-?\d+)?/g) ?? []).map((s) => s.replace(/\s+/g, ""));
}

function stripNumbers(text: string): string {
  return text.replace(/-?\d+(?:\.\d+)?/g, "#");
}

/** Flag question pairs that share surface form but no independent reasoning. */
export function detectShallowVariants(questions: readonly Question[]): ShallowVariantIssue[] {
  const out: ShallowVariantIssue[] = [];
  const list = [...questions];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      if (a.subjectId !== b.subjectId) continue;
      const stemSim = jaccard(tokens(a.stem), tokens(b.stem));
      const movesA = new Set(questionReasoningMoves(a));
      const movesB = new Set(questionReasoningMoves(b));
      const sharedMoves = [...movesA].filter((m) => movesB.has(m));
      const familiesA = new Set(questionFamilies(a));
      const familiesB = new Set(questionFamilies(b));
      const sharedFamily = [...familiesA].some((f) => familiesB.has(f));

      if (stemSim >= 0.85 && sharedFamily) {
        out.push({ kind: "near-duplicate", questionIds: [a.id, b.id], detail: `Stems ${(stemSim * 100).toFixed(0)}% similar within family ${[...familiesA].join(",")}; likely a wording reskin.` });
      }
      if (stripNumbers(a.stem) === stripNumbers(b.stem) && numbersIn(a.stem).length && numbersIn(a.stem).join(",") !== numbersIn(b.stem).join(",")) {
        out.push({ kind: "numerical-template", questionIds: [a.id, b.id], detail: "Identical stem after number-stripping: number-swap variant, not an independent family." });
      }
      if (sharedMoves.length > 0 && movesA.size === sharedMoves.length && movesB.size === sharedMoves.length && !sharedFamily && stemSim >= 0.2) {
        out.push({ kind: "same-reasoning-path", questionIds: [a.id, b.id], detail: `Identical reasoning [${sharedMoves.join("; ")}] with new context; counted as separate families but not independent.` });
      }
      const schemeA = a.parts.flatMap((p) => p.markScheme).join(" | ").toLowerCase();
      const schemeB = b.parts.flatMap((p) => p.markScheme).join(" | ").toLowerCase();
      if (schemeA && schemeA === schemeB && a.id !== b.id) {
        out.push({ kind: "duplicate-mark-scheme", questionIds: [a.id, b.id], detail: "Identical mark-scheme logic across questions; points are not independently authored." });
      }
      const modelA = a.parts.map((p) => p.modelAnswer).join(" ").toLowerCase();
      const modelB = b.parts.map((p) => p.modelAnswer).join(" ").toLowerCase();
      if (modelA.length > 40 && modelB.length > 40 && jaccard(tokens(modelA), tokens(modelB)) >= 0.9) {
        out.push({ kind: "similar-model-answer", questionIds: [a.id, b.id], detail: "Model answers ≥90% similar; worked solutions are not independently authored." });
      }
      if (sharedFamily && movesA.size && movesB.size && sharedMoves.length === 0 && stemSim < 0.3) {
        // Shared family but disjoint reasoning and dissimilar stems: suspicious
        // family grouping, flagged so family counts stay honest.
        out.push({ kind: "weak-family-independence", questionIds: [a.id, b.id], detail: "Shared family with disjoint reasoning and dissimilar stems; verify the family is a real skill, not a bucket." });
      }
    }
  }
  return out;
}

/** Demand diversity per spec statement from authored metadata (never inferred). */
export function demandDiversity(specPointId: Id, questions: readonly Question[]): { demands: string[]; families: number; weak: boolean } {
  const covering = questions.filter((q) =>
    (q.specPointIds ?? []).includes(specPointId) ||
    q.parts.some((p) => p.specPointIds?.includes(specPointId)));
  const demands = [...new Set(covering.flatMap((q) => [
    q.learning?.demand,
    ...q.parts.map((p) => p.learning?.demand),
  ]).filter(Boolean))] as string[];
  const families = new Set(covering.flatMap(questionFamilies)).size;
  return { demands, families, weak: demands.length < 2 || families < 2 };
}
