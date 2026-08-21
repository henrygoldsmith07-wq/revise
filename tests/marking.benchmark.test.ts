import { describe, expect, it } from "vitest";
import { markQuestion } from "@/domain/marking";
import { HUMAN_MARKING_CORPUS, scoreHumanMarkingCorpus } from "@/domain/human-marking-corpus";
import { firstIncorrectStep } from "@/domain/working-analysis";
import type { Question } from "@/domain/types";

// ---------------------------------------------------------------------------
// Examiner-style marking validation + AI vs human benchmark (offline harness).
//
// The real "AI vs human" comparison happens when a provider is configured
// (see docs/benchmark.md). This harness proves the *rubric* floor — the
// examiner-style behaviour that must hold even with no AI — and measures it
// against a human-labelled gold set (teacher/examiner awards) so a later AI
// run can extend the same contract.
// ---------------------------------------------------------------------------

function probeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "seed-q:probe",
    subjectId: "wjec-alevel-chemistry",
    topicIds: ["wjec-alevel-chemistry.moles"],
    kind: "structured",
    stem: "Probe",
    parts: [
      { id: "seed-q:probe:0", label: "(a)", prompt: "Calculate the concentration", marks: 2, markScheme: ["Uses n=cV with correct units", "Answer 0.25 mol dm-3 (accept 0.24-0.26)"], modelAnswer: "n=cV", aos: ["AO2"], specPointIds: ["wjec-alevel-chemistry.moles.sp-01"], learningClaims: ["perform calculations using n=cV"] },
      { id: "seed-q:probe:1", label: "(b)", prompt: "Explain the trend", marks: 2, markScheme: ["References increased nuclear charge and similar shielding", "Links to first ionisation energy"], modelAnswer: "Trend", aos: ["AO1"], specPointIds: ["wjec-alevel-chemistry.atomic-structure.sp-01"], learningClaims: ["explain ionisation trends"] },
    ],
    totalMarks: 4,
    calculatorAllowed: true,
    difficulty: 3,
    origin: "seed",
    source: "authored",
    verification: "checked",
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function algebraQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "seed-q:algebra",
    subjectId: "aqa-gcse-maths",
    topicIds: ["aqa-gcse-maths.algebra"],
    kind: "structured",
    stem: "Expand (x+2)(x-3).",
    parts: [
      {
        id: "seed-q:algebra:0",
        label: "(a)",
        prompt: "Expand (x+2)(x-3).",
        marks: 3,
        markScheme: ["Expands the brackets", "Collects like terms", "x^2 - x - 6"],
        modelAnswer: "(x+2)(x-3)\n= x^2 - 3x + 2x - 6\n= x^2 - x - 6",
        learningClaims: ["expands two linear brackets", "collects like terms", "states the simplified quadratic"],
        aos: ["AO2"],
        specPointIds: ["aqa-gcse-maths.algebra.sp-01"],
      },
    ],
    totalMarks: 3,
    calculatorAllowed: false,
    difficulty: 2,
    origin: "seed",
    source: "authored",
    verification: "checked",
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("examiner-style marking validation", () => {
  it("credits the exact mark-scheme wording and tolerates alternative phrasing", () => {
    const question = probeQuestion();
    // Exact wording
    const full = markQuestion(question, {
      "seed-q:probe:0": "I used n=cV, got 0.25 mol dm-3.",
      "seed-q:probe:1": "Nuclear charge rises, shielding similar, so ionisation energy rises.",
    });
    expect(full.awarded).toBeGreaterThanOrEqual(3);
    // No answer -> 0
    const blank = markQuestion(question, {});
    expect(blank.awarded).toBe(0);
    // Partial: only one part answered
    const partial = markQuestion(question, { "seed-q:probe:0": "0.25 mol dm-3" });
    expect(partial.awarded).toBeGreaterThan(0);
    expect(partial.awarded).toBeLessThan(4);
  });

  it("numeric match credits a correct number even with flaky prose", () => {
    const question = probeQuestion();
    const r = markQuestion(question, { "seed-q:probe:0": "0.25", "seed-q:probe:1": "no idea" });
    expect(r.marked.find((m) => m.partId === "seed-q:probe:0")!.awarded).toBeGreaterThan(0);
  });

  it("does not reward implication: a wrong answer scores 0", () => {
    const question = probeQuestion();
    const r = markQuestion(question, { "seed-q:probe:0": "The sky is blue", "seed-q:probe:1": "The sky is blue" });
    expect(r.awarded).toBe(0);
    expect(r.feedback).toMatch(/scheme|missing|not yet/i);
  });

  it("feedback is examiner-voice: states score and next steps", () => {
    const question = probeQuestion();
    const r = markQuestion(question, {});
    expect(r.feedback).toContain("/4");
    expect(r.feedback.length).toBeGreaterThan(40);
  });
});

describe("AI vs human benchmark — offline harness", () => {
  const GOLD = HUMAN_MARKING_CORPUS.rows;

  interface RowResult {
    label: string;
    humanTotal: number;
    rubricTotal: number;
    partMae: number;
    exact: boolean;
    firstWrongStep?: { studentStep: string; expected: string };
  }

  const corpusReport = scoreHumanMarkingCorpus(HUMAN_MARKING_CORPUS, (question, answers) => markQuestion(question, answers));
  const results: RowResult[] = corpusReport.rows.map((row) => {
    const source = GOLD.find((candidate) => candidate.id === row.rowId)!;
    const analysis = firstIncorrectStep(source.question.parts[0]!, source.answers[source.question.parts[0]!.id] ?? "");
    return {
      label: row.label,
      humanTotal: row.humanTotal,
      rubricTotal: row.predictedTotal,
      partMae: row.partMae,
      exact: row.exact,
      firstWrongStep:
        analysis.firstIncorrect && !analysis.consistentWithModel
          ? { studentStep: analysis.firstIncorrect.studentStep, expected: analysis.firstIncorrect.expected }
          : undefined,
    };
  });

  it("rubric accuracy against the human-labelled gold set is stable (the AI floor)", () => {
    const exact = results.filter((r) => r.exact).length;
    const accuracy = exact / results.length;
    const mae = results.reduce((a, r) => a + r.partMae, 0) / results.length;

    console.log(
      `marking benchmark: ${results.length} labelled scripts, exact-match ${accuracy.toFixed(3)} ` +
        `(${exact}/${results.length}), per-part MAE ${mae.toFixed(3)}`,
    );

    // The floor: the rubric must agree with a human marker on at least half
    // the scripts and stay within 0.8 marks per part on average. If this
    // drifts, partial-credit calibration regressed.
    expect(accuracy).toBeGreaterThanOrEqual(0.5);
    expect(exact).toBeGreaterThanOrEqual(6);
    expect(mae).toBeLessThanOrEqual(0.8);
  });

  it("the symbolic layer fixes the algebra precision hole the rubric used to have", () => {
    // Before symbolic matching, "x^2 + x - 6" was credited because it shares
    // digits (2, 6) with the scheme "x^2 - x - 6". Now a wrong pure expression
    // is rejected even though the digit overlap remains.
    const wrong = markQuestion(algebraQuestion(), { "seed-q:algebra:0": "x^2 + x - 6" });
    const wrongPoint = wrong.marked.find((m) => m.partId === "seed-q:algebra:0")!;
    expect(wrongPoint.creditedPoints).not.toContain("x^2 - x - 6");

    // While an equivalent form is still credited.
    const factored = markQuestion(algebraQuestion(), { "seed-q:algebra:0": "(x+2)(x-3)" });
    expect(factored.marked[0]!.creditedPoints).toContain("x^2 - x - 6");
  });

  it("multi-step gold rows pinpoint the first incorrect step", () => {
    const signError = results.find((r) => r.label.includes("sign error mid-working"))!;
    expect(signError.firstWrongStep).toBeDefined();
    expect(signError.firstWrongStep!.studentStep).toContain("3x + 2x");

    const fullWorking = results.find((r) => r.label === "full correct working")!;
    expect(fullWorking.firstWrongStep).toBeUndefined();
  });
});
