import { describe, expect, it } from "vitest";
import { ERROR_TAXONOMY, ERROR_TAXONOMY_VERSION, isErrorCategory } from "../src/domain/error-taxonomy";
import { ERROR_TO_REMEDIATION, remediationFor } from "../src/domain/error-remediation";
import { gateClassifierLabel, localClassifyError } from "../src/domain/error-local-classifier";
import { needsDiagnosis, recordDiagnosis, diagnosisSignal } from "../src/domain/error-diagnosis";
import { diagnoseAttemptErrors, isActionable } from "../src/domain/error-diagnosis-plan";
import { candidateTopics, routeSpecPoints } from "../src/domain/spec-routing";
import { calibrationReport, ERROR_EVAL_DATASET, precisionRecallPerLabel } from "../src/domain/error-eval";
import { topicsFor } from "../src/domain/curriculum";
import type { Attempt, MarkedPart, Mistake, Question } from "../src/domain/types";

describe("versioned taxonomy", () => {
  it("has exactly the 12 requested labels", () => {
    expect([...ERROR_TAXONOMY]).toEqual([
      "knowledge-gap", "misconception", "formula-selection", "calculation", "unit-error",
      "terminology", "insufficient-detail", "command-word", "application", "reasoning",
      "careless-error", "other",
    ]);
  });
  it("versions and validates labels", () => {
    expect(ERROR_TAXONOMY_VERSION).toBe("error-v1");
    expect(isErrorCategory("calculation")).toBe(true);
    expect(isErrorCategory("nope")).toBe(false);
  });
});

describe("intervention mapping", () => {
  it("maps the five required pairs", () => {
    expect(remediationFor("misconception").kind).toBe("targeted-explanation");
    expect(remediationFor("calculation").kind).toBe("worked-scaffold");
    expect(remediationFor("terminology").kind).toBe("definition-recall");
    expect(remediationFor("command-word").kind).toBe("exam-technique");
    expect(remediationFor("knowledge-gap").kind).toBe("content-retrieval");
  });
  it("covers every label with a positive budget", () => {
    for (const label of ERROR_TAXONOMY) expect(ERROR_TO_REMEDIATION[label].minutes).toBeGreaterThan(0);
  });
});

describe("confidence gating and offline fallback", () => {
  it("gates a below-threshold remote label to other and keeps the raw label", () => {
    const gated = gateClassifierLabel("calculation", 0.5, ["remote"]);
    expect(gated.category).toBe("other");
    expect(gated.rawLabel).toBe("calculation");
    expect(gated.gated).toBe(true);
  });
  it("passes a confident remote label through unchanged", () => {
    const gated = gateClassifierLabel("misconception", 0.9, ["remote"]);
    expect(gated.category).toBe("misconception");
    expect(gated.gated).toBe(false);
  });
  it("refuses an unknown remote label instead of casting it", () => {
    const gated = gateClassifierLabel("nonsense", 0.95, ["remote"]);
    expect(gated.category).toBe("other");
    expect(gated.gated).toBe(true);
  });
  it("is deterministic offline and defaults to knowledge-gap on a blank answer", () => {
    const a = localClassifyError({ prompt: "Calculate", point: "v = u + at", answer: "5", awarded: 0, maxMarks: 2 });
    const b = localClassifyError({ prompt: "Calculate", point: "v = u + at", answer: "5", awarded: 0, maxMarks: 2 });
    expect(a).toEqual(b);
    expect(localClassifyError({ prompt: "x", point: "y", answer: "", awarded: 0, maxMarks: 1 }).category).toBe("knowledge-gap");
  });
});

// --- shared fixtures --------------------------------------------------------

const SUBJECT = "wjec-alevel-physics";
const TOPIC = `${SUBJECT}.kinematics-dynamics`;

function fixtureQuestion(): Question {
  return {
    id: "q1", subjectId: SUBJECT, topicIds: [TOPIC], kind: "calculation",
    stem: "A ball is thrown vertically. Calculate its velocity after 2 s.",
    parts: [{
      id: "p1", label: "(a)", prompt: "Calculate the velocity after 2 s.",
      marks: 3, markScheme: ["v = u + at", "v = 12 m/s", "3 s.f. with units"], modelAnswer: "12 m/s",
    }],
    totalMarks: 3, calculatorAllowed: true, difficulty: 3, origin: "seed", createdAt: "2026-01-01T00:00:00Z",
  };
}

function fixtureMarked(): MarkedPart {
  return { partId: "p1", awarded: 1, max: 3, creditedPoints: ["v = u + at"], missedPoints: ["v = 12 m/s"], comment: "" };
}

function fixtureAttempt(marked: MarkedPart): Attempt {
  return {
    id: "a1", userId: "local", questionId: "q1", subjectId: SUBJECT, topicIds: [TOPIC],
    answers: { p1: "v = u + at = 0 + 9.8x2 = 19.6" }, marked: [marked], awarded: 1, max: 3,
    feedback: "", markedBy: "rubric", elapsedMs: 120_000, mode: "practice",
    createdAt: "2026-05-01T00:00:00Z",
  };
}

function fixtureMistake(): Mistake {
  return {
    id: "m1", userId: "local", subjectId: SUBJECT, topicId: TOPIC, questionId: "q1", partId: "p1",
    description: "v = 12 m/s not earned", category: "arithmetic", resolved: false, marksLost: 2,
    createdAt: "2026-05-01T00:00:00Z",
  };
}

describe("post-marking pipeline", () => {
  it("only sends incorrect or partial responses to diagnosis", () => {
    expect(needsDiagnosis({ partId: "p1", awarded: 3, max: 3, creditedPoints: [], missedPoints: [], comment: "" })).toBe(false);
    expect(needsDiagnosis(fixtureMarked())).toBe(true);
  });

  it("carries the fixed mark through the signal unchanged", () => {
    const question = fixtureQuestion();
    const marked = fixtureMarked();
    const signal = diagnosisSignal({
      question, part: question.parts[0]!, marked, attempt: fixtureAttempt(marked),
      mistake: fixtureMistake(), answer: "v = u + at = 0 + 9.8x2 = 19.6",
    });
    expect(signal.awarded).toBe(marked.awarded);
    expect(signal.maxMarks).toBe(marked.max);
    expect(signal.command).toBe("calculate");
    expect(signal.point).toBe("v = 12 m/s");
  });

  it("records the diagnosis with marks, provenance and taxonomy version", () => {
    const question = fixtureQuestion();
    const marked = fixtureMarked();
    const record = recordDiagnosis(
      { question, part: question.parts[0]!, marked, attempt: fixtureAttempt(marked), mistake: fixtureMistake(), answer: "19.6" },
      { category: "unit-error", confidence: 0.88, reasons: ["no units on the final line"], provenance: "classifier-dev", gated: false },
    );
    expect(record.awarded).toBe(1);
    expect(record.max).toBe(3);
    expect(record.category).toBe("unit-error");
    expect(record.provenance).toBe("classifier-dev");
    expect(record.taxonomyVersion).toBe(ERROR_TAXONOMY_VERSION);
    expect(record.remediationKind).toBe("exam-technique");
    expect(record.gated).toBe(false);
  });

  it("never promotes a gated low-confidence label into a category", () => {
    const question = fixtureQuestion();
    const marked = fixtureMarked();
    const record = recordDiagnosis(
      { question, part: question.parts[0]!, marked, attempt: fixtureAttempt(marked), mistake: fixtureMistake(), answer: "19.6" },
      { category: "calculation", confidence: 0.5, reasons: ["below threshold"], provenance: "classifier-dev", gated: true, rawLabel: "calculation" },
    );
    expect(record.category).toBe("other");
    expect(record.rawLabel).toBe("calculation");
  });
});

describe("attempt-level diagnosis plan", () => {
  it("skips a clean attempt entirely", () => {
    const question = fixtureQuestion();
    const plan = diagnoseAttemptErrors({
      question,
      marked: [{ partId: "p1", awarded: 3, max: 3, creditedPoints: [], missedPoints: [], comment: "" }],
      answers: { p1: "12 m/s" },
    });
    expect(plan.clean).toBe(true);
    expect(plan.parts).toHaveLength(0);
    expect(plan.headline).toBeNull();
  });

  it("diagnoses only the parts that dropped marks", () => {
    const question = fixtureQuestion();
    const plan = diagnoseAttemptErrors({ question, marked: [fixtureMarked()], answers: { p1: "19.6" } });
    expect(plan.clean).toBe(false);
    expect(plan.parts).toHaveLength(1);
    expect(plan.parts[0]!.awarded).toBe(1);
    expect(plan.parts[0]!.max).toBe(3);
    expect(plan.parts[0]!.taxonomyVersion).toBe(ERROR_TAXONOMY_VERSION);
  });

  it("maps each category to its intervention and budgets minutes", () => {
    const question = fixtureQuestion();
    const plan = diagnoseAttemptErrors({
      question,
      marked: [fixtureMarked()],
      answers: { p1: "19.6" },
      classify: () => ({ category: "misconception", confidence: 0.92, reasons: ["wrong idea"], provenance: "classifier-dev", gated: false }),
    });
    expect(plan.parts[0]!.intervention.kind).toBe("targeted-explanation");
    expect(plan.minutes).toBe(plan.parts[0]!.intervention.minutes);
    expect(isActionable(plan.parts[0]!)).toBe(true);
  });

  it("demotes a low-confidence remote verdict to other and marks it unactionable", () => {
    const question = fixtureQuestion();
    const plan = diagnoseAttemptErrors({
      question,
      marked: [fixtureMarked()],
      answers: { p1: "19.6" },
      classify: () => ({ category: "formula-selection", confidence: 0.4, reasons: ["unsure"], provenance: "classifier-dev", gated: true, rawLabel: "formula-selection" }),
    });
    expect(plan.parts[0]!.category).toBe("other");
    expect(plan.parts[0]!.rawLabel).toBe("formula-selection");
    expect(isActionable(plan.parts[0]!)).toBe(false);
  });

  it("prefers the more urgent intervention for the headline", () => {
    const question: Question = {
      ...fixtureQuestion(),
      parts: [
        { id: "p1", label: "(a)", prompt: "State the unit.", marks: 1, markScheme: ["m/s"], modelAnswer: "m/s" },
        { id: "p2", label: "(b)", prompt: "Explain why.", marks: 2, markScheme: ["because of drag"], modelAnswer: "drag" },
      ],
      totalMarks: 3,
    };
    const plan = diagnoseAttemptErrors({
      question,
      marked: [
        { partId: "p1", awarded: 0, max: 1, creditedPoints: [], missedPoints: ["m/s"], comment: "" },
        { partId: "p2", awarded: 0, max: 2, creditedPoints: [], missedPoints: ["because of drag"], comment: "" },
      ],
      answers: { p1: "speed", p2: "not sure" },
      classify: (signal) =>
        signal.point === "m/s"
          ? { category: "unit-error", confidence: 0.8, reasons: ["units"], provenance: "classifier-dev", gated: false }
          : { category: "misconception", confidence: 0.8, reasons: ["wrong idea"], provenance: "classifier-dev", gated: false },
    });
    expect(plan.parts).toHaveLength(2);
    expect(plan.headline?.partId).toBe("p2");
    expect(plan.minutes).toBe(plan.parts.reduce((sum, entry) => sum + entry.intervention.minutes, 0));
  });
});

describe("hierarchical specification-point routing", () => {
  it("returns a bounded topic shortlist, not every topic in the subject", () => {
    const all = topicsFor(SUBJECT);
    const short = candidateTopics(SUBJECT, "read the gradient of a velocity-time graph to find acceleration");
    expect(short.length).toBeLessThanOrEqual(3);
    expect(short.length).toBeLessThan(all.length);
  });

  it("caps the candidate set so no request carries the whole subject", () => {
    const route = routeSpecPoints(SUBJECT, "resolve a projectile into horizontal and vertical components");
    expect(route.candidates.length).toBeLessThanOrEqual(8);
    const shortlist = route.topics.map((topic) => topic.id);
    for (const candidate of route.candidates) {
      expect(candidate.specPointId).toMatch(/^wjec-alevel-physics\./);
      expect(shortlist).toContain(candidate.topicId);
    }
  });

  it("ranks the most relevant topic first", () => {
    const shortlist = candidateTopics(SUBJECT, "Hooke law stress strain Young modulus force-extension graph");
    expect(shortlist[0]?.id).toBe(`${SUBJECT}.materials`);
  });
});

describe("labelled evaluation dataset", () => {
  it("covers the taxonomy with precision/recall per label", () => {
    const predictions = ERROR_EVAL_DATASET.map((item) => {
      const verdict = localClassifyError({ prompt: item.prompt, point: item.point, answer: item.answer, awarded: 0, maxMarks: 2 });
      return { id: item.id, predicted: verdict.category, confidence: verdict.confidence };
    });
    const perLabel = precisionRecallPerLabel(ERROR_EVAL_DATASET, predictions);
    expect(Object.keys(perLabel)).toHaveLength(ERROR_TAXONOMY.length);
    for (const label of ERROR_TAXONOMY) {
      const row = perLabel[label]!;
      expect(row.precision).toBeGreaterThanOrEqual(0);
      expect(row.precision).toBeLessThanOrEqual(1);
      expect(row.recall).toBeGreaterThanOrEqual(0);
      expect(row.recall).toBeLessThanOrEqual(1);
    }
  });

  it("bins confidence against accuracy for calibration", () => {
    const predictions = ERROR_EVAL_DATASET.map((item) => {
      const verdict = localClassifyError({ prompt: item.prompt, point: item.point, answer: item.answer, awarded: 0, maxMarks: 2 });
      return { id: item.id, predicted: verdict.category, confidence: verdict.confidence };
    });
    const bins = calibrationReport(ERROR_EVAL_DATASET, predictions);
    expect(bins.length).toBeGreaterThan(0);
    for (const bin of bins) {
      expect(bin.gap).toBeGreaterThanOrEqual(0);
      expect(bin.gap).toBeLessThanOrEqual(1);
      expect(bin.accuracy).toBeGreaterThanOrEqual(0);
      expect(bin.accuracy).toBeLessThanOrEqual(1);
    }
    expect(bins.reduce((sum, bin) => sum + bin.n, 0)).toBe(ERROR_EVAL_DATASET.length);
  });
});
