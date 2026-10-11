import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { markPart, markQuestion, rubricConfidence } from "@/domain/marking";
import { assessDeterministicMark } from "@/domain/marking-confidence";
import { schemeContested, schemeContradiction } from "@/domain/marking-contradiction";
import { aiMarkerUnavailableMark } from "@/lib/offline-mark";
import type { Question } from "@/domain/types";
import { contradictionCases, MODEL } from "./fixtures/marking-contradiction-set";

// ---------------------------------------------------------------------------
// The offline/rubric marker must not credit an answer that contradicts the
// scheme (tenth pass, 2026-10-11). Before this change, 30 of the 38
// contradictory answers in the regression set were over-credited (35 marks),
// including "Pulmonary artery, right atrium" at 2/2; after it, 5 answers
// (7 marks) remain over-credited, all documented as known gaps in the
// fixture. Across the whole bank the veto fires on 2 of 13,288 scheme points
// when the authored model answer is submitted. The numbers asserted
// below are the measured state after the change; tightening them is welcome,
// loosening them is a regression.
// ---------------------------------------------------------------------------

const byId = new Map(seedQuestions.map((q) => [q.id, q]));

function question(id: string): Question {
  const q = byId.get(id);
  if (!q) throw new Error(`regression question missing from the bank: ${id}`);
  return q;
}

function mark(id: string, answer: string) {
  const q = question(id);
  const part = q.parts[0]!;
  return markQuestion(q, { [part.id]: answer === MODEL ? part.modelAnswer ?? "" : answer });
}

describe("contradiction regression set (real bank questions)", () => {
  const rows = contradictionCases.map((c) => ({ ...c, awarded: mark(c.questionId, c.answer).awarded }));

  it("every regression question is still in the bank", () => {
    for (const c of contradictionCases) expect(byId.has(c.questionId), c.questionId).toBe(true);
  });

  it("no contradictory answer outside the documented gaps earns more than an examiner would give", () => {
    const over = rows.filter((r) => r.kind === "contradiction" && !r.knownGap && r.awarded > r.examiner);
    expect(over.map((r) => `${r.questionId}: ${r.awarded} > ${r.examiner} for “${r.answer}”`)).toEqual([]);
  });

  it("documented gaps are the only over-credited contradictions (5 answers, 7 marks)", () => {
    const over = rows.filter((r) => r.kind === "contradiction" && r.awarded > r.examiner);
    expect(over.every((r) => r.knownGap)).toBe(true);
    expect(over.length).toBeLessThanOrEqual(5);
    expect(over.reduce((sum, r) => sum + r.awarded - r.examiner, 0)).toBeLessThanOrEqual(7);
  });

  it("contradiction checks never take a mark an examiner would give", () => {
    const under = rows.filter((r) => r.kind === "contradiction" && r.awarded < r.examiner);
    expect(under.map((r) => `${r.questionId}: ${r.awarded} < ${r.examiner} for “${r.answer}”`)).toEqual([]);
  });

  it("every correct paraphrase keeps full marks", () => {
    const paraphrases = rows.filter((r) => r.kind === "paraphrase");
    expect(paraphrases.length).toBeGreaterThanOrEqual(9);
    expect(paraphrases.filter((r) => r.awarded !== r.examiner).map((r) => r.answer)).toEqual([]);
  });

  it("authored model answers are not marked down by the contradiction checks", () => {
    // Three bank model answers already scored below full before this change
    // (keyword coverage, not contradiction); none may get worse.
    const correct = rows.filter((r) => r.kind === "correct");
    expect(correct.filter((r) => r.awarded < r.examiner).length).toBeLessThanOrEqual(3);
    for (const r of correct) {
      const q = question(r.questionId);
      const answer = q.parts[0]!.modelAnswer ?? "";
      for (const point of q.parts[0]!.markScheme) expect(schemeContradiction(point, answer), `${r.questionId}: ${point}`).toBeNull();
    }
  });
});

describe("schemeContradiction", () => {
  it("catches opposite terms next to the point's subject", () => {
    expect(schemeContradiction("Pulmonary vein", "Pulmonary artery, right atrium")).toMatchObject({ kind: "opposite-term", said: "artery", needed: "vein" });
    expect(schemeContradiction("Left atrium", "Pulmonary artery, right atrium")).toMatchObject({ kind: "opposite-term", said: "right" });
    expect(schemeContradiction("Electrophilic addition", "Nucleophilic addition")).toMatchObject({ said: "nucleophilic" });
    expect(schemeContradiction("An acid is a proton (H⁺) donor", "An acid is a proton acceptor.")).toMatchObject({ said: "acceptor" });
    expect(schemeContradiction("β (beta) cells of the islets of Langerhans in the pancreas", "Insulin, from the α cells of the islets.")).toMatchObject({ said: "alpha" });
  });

  it("reads the clause the point is about, so one clause cannot borrow another's word", () => {
    const answer = "M is reduced because it gains electrons; N ions are oxidised because they lose electrons.";
    expect(schemeContradiction("M is oxidised because it loses electrons", answer)).not.toBeNull();
    expect(schemeContradiction("N ions are reduced because they gain electrons", answer)).not.toBeNull();
  });

  it("catches a negated claim", () => {
    expect(schemeContradiction("The acceleration must be constant", "v² = u² + 2as, which applies when the acceleration is not constant.")).toMatchObject({ kind: "negation" });
    expect(schemeContradiction("Both alleles are expressed in the phenotype of a heterozygote", "Both alleles are not expressed in the heterozygote.")).toMatchObject({ kind: "negation" });
  });

  it("catches flipped signs, relations, values and formulae", () => {
    expect(schemeContradiction("Discriminant = b² − 4ac", "The discriminant is b² + 4ac.")).toMatchObject({ kind: "sign" });
    expect(schemeContradiction("v² = u² + 2as", "v² = u² − 2as")).toMatchObject({ kind: "sign" });
    expect(schemeContradiction("cos 2θ = 2cos²θ − 1", "cos 2θ = 1 − 2cos²θ")).toMatchObject({ kind: "sign" });
    expect(schemeContradiction("Two distinct real roots when b² − 4ac > 0", "Two distinct real roots when b² − 4ac < 0.")).toMatchObject({ kind: "relation" });
    expect(schemeContradiction("The quadratic is negative between the roots: 2 < x < 3", "x < 2 or x > 3")).toMatchObject({ kind: "relation" });
    expect(schemeContradiction("Centre (3, −2) and radius 5", "Centre (−3, 2), radius 25.")).toMatchObject({ kind: "value" });
    expect(schemeContradiction("NH₃", "The conjugate base is NH₂⁻.")).toMatchObject({ kind: "formula", said: "NH2-", needed: "NH3" });
  });

  it("leaves correct answers, contrasts and paraphrases alone", () => {
    expect(schemeContradiction("Pulmonary vein", "The pulmonary vein, not the pulmonary artery.")).toBeNull();
    expect(schemeContradiction("Left atrium", "It enters the left atrium.")).toBeNull();
    expect(schemeContradiction("Each new DNA molecule contains one original (parental) strand", "Replication is semi-conservative: one original strand in each new molecule.")).toBeNull();
    expect(schemeContradiction("Iron is oxidised and is the reducing agent", "Iron loses electrons, so it is oxidised; it is the reducing agent.")).toBeNull();
    expect(schemeContradiction("Use y = 2x + c", "3 = 2(2) + c, so c = −1. The equation is y = 2x − 1.")).toBeNull();
    expect(schemeContradiction("A thin wall gives a short diffusion distance", "An alveolus has a wall one cell thick, giving a short diffusion distance.")).toBeNull();
    expect(schemeContradiction("Increasing temperature favours the endothermic reverse reaction", "The forward reaction is exothermic, so a higher temperature favours the reactants.")).toBeNull();
    expect(schemeContradiction("Discriminant = b² − 4ac", "Δ = b² − 4ac")).toBeNull();
    expect(schemeContradiction("Two distinct real roots when b² − 4ac > 0", "b² − 4ac > 0 gives two distinct real roots")).toBeNull();
  });
});

describe("marking with the contradiction veto", () => {
  const pulmonary = "cnt:question:recall-probe-bio-pulmonary-vein-recall";

  it("scores the reported over-credit case 0/2 and says why", () => {
    const result = mark(pulmonary, "Pulmonary artery, right atrium");
    expect(result.awarded).toBe(0);
    const explanations = result.marked[0]!.evidence!.map((e) => e.explanation);
    expect(explanations.some((e) => /artery/.test(e) && /vein/.test(e))).toBe(true);
    expect(explanations.some((e) => /right/.test(e) && /left/.test(e))).toBe(true);
  });

  it("a hedge between the right term and its opposite is awarded only provisionally", () => {
    const q = question(pulmonary);
    const part = q.parts[0]!;
    const answer = "The pulmonary vein or the pulmonary artery, into the left atrium.";
    expect(schemeContested("Pulmonary vein", answer)).toBe(true);
    const result = markQuestion(q, { [part.id]: answer });
    const assessment = assessDeterministicMark({ marked: result.marked, rubricConfidence: rubricConfidence(result.marked) });
    expect(assessment.provisional).toBe(true);
    expect(assessment.checks.find((c) => c.id === "answer-evidence")?.passed).toBe(false);
  });

  it("the offline (no-AI) envelope uses the same veto", () => {
    const q = question(pulmonary);
    const out = aiMarkerUnavailableMark(q, { [q.parts[0]!.id]: "Pulmonary artery, right atrium" });
    expect(out.data.marked[0]!.awarded).toBe(0);
  });

  it("a contradicted authored-answer shortcut no longer passes as complete", () => {
    const q = question("cnt:question:recall-probe-math-double-angle-recall");
    const marked = markPart(q.parts[0]!, "sin 2θ = 2 sin θ cos θ and cos 2θ = 1 − 2cos²θ.");
    expect(marked.awarded).toBe(1);
  });

  it("a trailing full stop no longer hides a short scheme term", () => {
    const q = question("cnt:question:recall-probe-math-binomial-conditions-recall");
    const result = mark(q.id, "A fixed number n of trials which are independent; each trial has only two outcomes, success or failure, and the probability p of success is constant. E(X) = np.");
    expect(result.awarded).toBe(3);
  });
});
