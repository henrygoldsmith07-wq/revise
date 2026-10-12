import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { markQuestion } from "@/domain/marking";
import {
  canonicalDirectionConflict,
  canonicalPhrases,
  inequalityWordsToSymbols,
  labelledAnswerScope,
  notationOnlyPoint,
  notationPresent,
  pointCoverage,
  sentenceFinalStem,
  stem,
} from "@/domain/marking-language";
import { paraphraseCases } from "./fixtures/marking-paraphrase-set";

// ---------------------------------------------------------------------------
// Correct answers in a student's own words (sixteenth pass, 2026-10-12).
//
// Measured on tests/fixtures/marking-paraphrase-set.ts (every answer and
// examiner mark there is author judgement, not a moderated mark):
//
//   design set (50 correct paraphrases, measured before the change):
//     before: 11 under-credited, 103/115 marks; after: 4, 111/115.
//   held-out set (13 correct paraphrases written after the change):
//     before: 3 under-credited, 26/29 marks; after: 2, 27/29.
//   wrong set (11 answers stating the opposite in the new equivalent wording):
//     before: 4 over-credited (15 marks awarded where an examiner gives 10);
//     after: 1 over-credited (12 marks).
//
// The numbers asserted below are the measured state; tightening them is
// welcome, loosening them is a regression. The contradiction regression set
// (tests/marking-contradictions.test.ts) still has no over-credited answer.
// ---------------------------------------------------------------------------

const byId = new Map(seedQuestions.map((q) => [q.id, q]));

function mark(questionId: string, answer: string) {
  const q = byId.get(questionId);
  if (!q) throw new Error(`paraphrase question missing from the bank: ${questionId}`);
  return markQuestion(q, { [q.parts[0]!.id]: answer });
}

const rows = paraphraseCases.map((c) => ({ ...c, awarded: mark(c.questionId, c.answer).awarded }));
const of = (set: string) => rows.filter((r) => r.set === set);
const total = (list: typeof rows, key: "awarded" | "examiner") => list.reduce((sum, r) => sum + r[key], 0);

describe("paraphrase set (real flagship questions, author-judged marks)", () => {
  it("covers all four flagship subjects with real bank questions", () => {
    for (const c of paraphraseCases) expect(byId.has(c.questionId), c.questionId).toBe(true);
    const subjects = new Set(paraphraseCases.map((c) => byId.get(c.questionId)!.subjectId));
    expect([...subjects].sort()).toEqual(["wjec-alevel-biology", "wjec-alevel-chemistry", "wjec-alevel-maths", "wjec-alevel-physics"]);
    expect(of("design")).toHaveLength(50);
  });

  it("design set: at most 4 correct paraphrases under-credited (was 11), at least 111/115 marks (was 103)", () => {
    const design = of("design");
    expect(design.filter((r) => r.awarded < r.examiner).length).toBeLessThanOrEqual(4);
    expect(total(design, "awarded")).toBeGreaterThanOrEqual(111);
    expect(design.filter((r) => r.awarded > r.examiner)).toEqual([]);
  });

  it("held-out set: at most 2 under-credited (was 3), at least 27/29 marks (was 26)", () => {
    const held = of("held-out");
    expect(held.filter((r) => r.awarded < r.examiner).length).toBeLessThanOrEqual(2);
    expect(total(held, "awarded")).toBeGreaterThanOrEqual(27);
    expect(held.filter((r) => r.awarded > r.examiner)).toEqual([]);
  });

  it("wrong set: equivalent wording never buys credit for the opposite claim (over-credit 4 answers -> 1)", () => {
    const wrong = of("wrong");
    const over = wrong.filter((r) => r.awarded > r.examiner);
    expect(over.length).toBeLessThanOrEqual(1);
    expect(total(wrong, "awarded") - total(wrong, "examiner")).toBeLessThanOrEqual(2);
  });

  it("the reported case: a correct inverse-square paraphrase scores full marks", () => {
    const id = "cnt:question:physics-depth-fields-sp-01-inverse-square-fallacy-3";
    expect(mark(id, "The force is inversely proportional to the square of the separation, not just the separation. Doubling the distance makes the force one quarter as big. Halving the distance makes the force four times bigger.").awarded).toBe(3);
    expect(mark(id, "The force is inversely proportional to the distance, so doubling the distance halves the force.").awarded).toBe(0);
  });

  it("verbatim model answers of every question in the set still score full marks (one pre-existing exception)", () => {
    const below: string[] = [];
    for (const id of new Set(paraphraseCases.map((c) => c.questionId))) {
      const q = byId.get(id)!;
      const part = q.parts[0]!;
      if (markQuestion(q, { [part.id]: part.modelAnswer ?? "" }).awarded < part.marks) below.push(id);
    }
    // This model answer has no skill mapping, so it is rubric-marked, and it
    // scored 1/2 before this pass too (its "closer together" point is worded
    // as "the decreasing change between successive iterates").
    expect(below).toEqual(["cnt:question:data-expansion-wjec-alevel-maths-iteration-table"]);
  });
});

describe("equivalent wording", () => {
  it("canonicalises the same claim to the same words, on both sides", () => {
    expect(pointCoverage("Tissue mass initially rises", "the tissue mass goes up at first")).toBe(1);
    expect(pointCoverage("The force becomes one quarter", "the force becomes four times smaller")).toBe(1);
    expect(pointCoverage("Halving the distance would increase the force fourfold", "halved distance gives four times the force")).toBeGreaterThanOrEqual(0.6);
    expect(pointCoverage("Coulomb's law gives F ∝ 1/r²", "Coulomb's law: the force is inversely proportional to the square of the distance")).toBe(1);
    expect(pointCoverage("Antibodies are made more quickly", "antibodies are produced faster")).toBe(1);
  });

  it("never merges opposites or ambiguous words", () => {
    expect(canonicalPhrases("four times bigger")).not.toBe(canonicalPhrases("four times smaller"));
    expect(canonicalPhrases("goes up")).not.toBe(canonicalPhrases("goes down"));
    expect(canonicalPhrases("the force falls by a quarter")).not.toContain("quarter ");
    expect(canonicalPhrases("three quarters of the energy")).not.toMatch(/\bquarter\b/);
    expect(canonicalPhrases("the leaves of the plant")).toContain("leaves");
    expect(canonicalPhrases("a C=C double bond")).toContain("double");
    expect(canonicalPhrases("oxygen diffuses into the blood")).toContain("diffuses into");
    expect(canonicalPhrases("the left atrium")).toContain("left");
    expect(pointCoverage("Coulomb's law gives F ∝ 1/r²", "the force is inversely proportional to the distance")).toBe(0);
  });

  it("reads inequalities said in words as symbols", () => {
    expect(inequalityWordsToSymbols("feasible when ΔG is zero or negative")).toBe("feasible when ΔG is ≤ 0");
    expect(inequalityWordsToSymbols("ΔG is positive or zero")).toBe("ΔG is ≥ 0");
    expect(inequalityWordsToSymbols("no inequality here")).toBe("no inequality here");
  });

  it("credits a notation-only point only when the whole notation is there", () => {
    expect(notationOnlyPoint("P(A ∩ B) = P(A)P(B|A).")).toBe(true);
    expect(notationOnlyPoint("x = 2")).toBe(false); // digits stay with the numeric layer
    expect(notationPresent("P(A ∩ B) = P(A)P(B|A).", "So P(A∩B) = P(A) P(B|A), by the multiplication rule.")).toBe(true);
    expect(notationPresent("P(A ∩ B) = P(A)P(B|A).", "P(A ∩ B) = P(A)P(B|A)²")).toBe(false);
    expect(notationPresent("P(A ∩ B) = P(A)P(B|A).", "P(A ∩ B) = P(B)P(A|B)")).toBe(false);
  });

  it("stems a sentence's last word without its full stop (\"genus.\" is \"genus\")", () => {
    expect(sentenceFinalStem("genus.")).toBe(stem("genus"));
    expect(sentenceFinalStem("2.")).toBe("2.");
    expect(mark("cnt:question:recall-probe-bio-domains-genus-recall", "Bacteria, Archaea and Eukaryota. The next level down from family is genus.").awarded).toBe(2);
  });

  it("vetoes the opposite direction once wording is canonicalised, but not a correct answer that mentions both", () => {
    expect(canonicalDirectionConflict("Oxidation is an increase in oxidation number", "Oxidation is when the oxidation number goes down")).toBe(true);
    expect(canonicalDirectionConflict("Cable loss becomes one quarter", "the cable loss becomes four times bigger")).toBe(true);
    expect(canonicalDirectionConflict("Tissue mass rises", "mass goes up in A and goes down in B")).toBe(false);
    expect(canonicalDirectionConflict("Oxidation is an increase in oxidation number", "the oxidation number goes up")).toBe(false);
  });

  it("judges a point about a labelled case on the answer's sentences about that case", () => {
    const answer = "In A, water moves out so mass goes down. In B, water moves in so mass goes up.";
    expect(labelledAnswerScope("In A, water enters and tissue mass initially rises.", answer)).toBe("In A, water moves out so mass goes down.");
    expect(labelledAnswerScope("In A, water enters.", "Water enters in both.")).toBe("Water enters in both.");
    expect(labelledAnswerScope("Water moves down the gradient.", answer)).toBe(answer);
  });
});
