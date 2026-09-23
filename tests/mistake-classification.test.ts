import { describe, expect, it } from "vitest";
import {
  classifyMistake,
  MISTAKE_CLASSES,
  MISTAKE_CLASS_MEANING,
  type ClassificationInput,
} from "../src/domain/mistake-classification";
import type { Attempt, MarkedPart, Mistake, Question, QuestionPart } from "../src/domain/types";

// ---------------------------------------------------------------------------
// One decisive fixture per class. Classification must be deterministic and
// specific-first, so each case is crafted so only its own rule can fire.
// ---------------------------------------------------------------------------

const SUBJECT = "wjec-alevel-biology";
const TOPIC = `${SUBJECT}.enzymes`;

function mistake(overrides: Partial<Mistake> = {}): Mistake {
  return {
    id: "m1",
    userId: "local",
    subjectId: SUBJECT,
    topicId: TOPIC,
    questionId: "q1",
    description: "miss",
    category: "unclassified",
    resolved: false,
    marksLost: 1,
    createdAt: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

function part(overrides: Partial<QuestionPart>): QuestionPart {
  return {
    id: "p1",
    label: "(a)",
    prompt: "Describe what happens.",
    marks: 2,
    markScheme: ["point one", "point two"],
    modelAnswer: "answer",
    ...overrides,
  };
}

function question(partOverride: Partial<QuestionPart>, questionOverride: Partial<Question> = {}): Question {
  return {
    id: "q1",
    subjectId: SUBJECT,
    topicIds: [TOPIC],
    kind: "short",
    stem: partOverride.prompt ?? "Answer the question.",
    parts: [part(partOverride)],
    totalMarks: partOverride.marks ?? 2,
    calculatorAllowed: false,
    difficulty: 3,
    origin: "seed",
    createdAt: "2026-01-01T00:00:00Z",
    ...questionOverride,
  };
}

function marked(markedOverride: Partial<MarkedPart>): MarkedPart {
  return {
    partId: "p1",
    awarded: 0,
    max: 2,
    creditedPoints: [],
    missedPoints: ["point one"],
    comment: "",
    ...markedOverride,
  };
}

function attempt(answers: Record<string, string>, markedPart: MarkedPart, awarded = 0, max = 2): Attempt {
  return {
    id: "a1",
    userId: "local",
    questionId: "q1",
    subjectId: SUBJECT,
    topicIds: [TOPIC],
    answers,
    marked: [markedPart],
    awarded,
    max,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 60_000,
    mode: "practice",
    createdAt: "2026-05-01T00:00:00Z",
  };
}

function run(input: Omit<ClassificationInput, "mistake">, m?: Partial<Mistake>) {
  return classifyMistake({ mistake: mistake(m), ...input });
}

describe("the nine mistake classes", () => {
  it("are exactly the requested taxonomy, in order", () => {
    expect(MISTAKE_CLASSES).toEqual([
      "knowledge gap",
      "application",
      "calculation",
      "command word",
      "interpretation",
      "careless error",
      "terminology",
      "structure",
      "timing",
    ]);
    for (const klass of MISTAKE_CLASSES) {
      expect(MISTAKE_CLASS_MEANING[klass].length).toBeGreaterThan(10);
    }
  });
});

describe("knowledge gap", () => {
  it("is called when no answer evidence reached the point at all", () => {
    const p = part({ prompt: "State one role of ATP.", marks: 1, markScheme: ["ATP provides energy for muscle contraction"] });
    const q = question(p, { kind: "short" });
    const result = run({ question: q, part: p, attempt: attempt({ p1: "" }, marked({ awarded: 0, max: 1 }), 0, 1) });
    expect(result.klass).toBe("knowledge gap");
    expect(result.confidence).toBe("high");
  });

  it("is called when something was written but the point was not reached", () => {
    const p = part({ prompt: "Describe the induced-fit model.", marks: 3, markScheme: ["active site changes shape"] });
    const q = question(p);
    const result = run({
      question: q,
      part: p,
      attempt: attempt({ p1: "enzymes speed up reactions" }, marked({ awarded: 1, max: 3, missedPoints: ["active site changes shape"] }), 1, 3),
    });
    expect(result.klass).toBe("knowledge gap");
    expect(result.confidence).toBe("medium");
  });
});

describe("application", () => {
  it("is called when an AO2/AO3 point needs the fact applied to the context", () => {
    const p = part({
      prompt: "Explain why this patient has a rapid heart rate after blood loss.",
      marks: 3,
      markScheme: ["adrenaline increases heart rate to maintain blood pressure"],
      aos: ["AO2"],
    });
    const q = question(p);
    const result = run({
      question: q,
      part: p,
      attempt: attempt({ p1: "the heart beats faster due to adrenaline" }, marked({ awarded: 0, max: 3, missedPoints: p.markScheme }), 0, 3),
    });
    expect(result.klass).toBe("application");
    expect(result.reasons.some((r) => r.includes("AO2"))).toBe(true);
  });
});

describe("calculation", () => {
  it("is called when the lost point is numeric or the command was calculate", () => {
    const p = part({
      prompt: "Calculate the mass of carbon dioxide produced from 0.5 mol.",
      marks: 3,
      markScheme: ["mass = 22 g", "working shown"],
    });
    const q = question(p);
    const result = run({
      question: q,
      part: p,
      attempt: attempt({ p1: "0.5 mol of CO2" }, marked({ awarded: 1, max: 3, missedPoints: ["mass = 22 g"] }), 1, 3),
    });
    expect(result.klass).toBe("calculation");
    expect(result.confidence).toBe("high");
  });
});

describe("command word", () => {
  it("is called when a compare answer gives only one side", () => {
    const p = part({
      prompt: "Compare the structure of arteries and veins.",
      marks: 2,
      markScheme: ["arteries have thick muscular walls compared with veins", "veins have valves, arteries do not"],
    });
    const q = question(p);
    const result = run({
      question: q,
      part: p,
      attempt: attempt({ p1: "arteries have thick muscular walls" }, marked({ awarded: 1, max: 2, missedPoints: ["veins have valves, arteries do not"] }), 1, 2),
    });
    expect(result.klass).toBe("command word");
    expect(result.confidence).toBe("high");
    expect(result.reasons.some((r) => r.includes("compare"))).toBe(true);
  });

  it("is called when an evaluate answer states without weighing", () => {
    const p = part({
      prompt: "Evaluate the use of antibiotics for viral infections.",
      marks: 3,
      markScheme: ["antibiotics do not act on viruses"],
    });
    const q = question(p);
    const result = run({
      question: q,
      part: p,
      attempt: attempt({ p1: "antibiotics do not act on viruses" }, marked({ awarded: 0, max: 3, missedPoints: p.markScheme }), 0, 3),
    });
    expect(result.klass).toBe("command word");
  });

  it("beats calculation when a compare is one-sided even over a numeric mark scheme", () => {
    // The lost point quantifies the comparison ("ten times lower"), but the
    // student's failure is giving one side of the compare — the verb, not the
    // arithmetic, is what needs fixing.
    const p = part({
      prompt: "Compare the hydrogen-ion concentrations before and after treatment.",
      marks: 2,
      markScheme: ["[H⁺] at pH 4 is 1.0 × 10⁻⁴ mol dm⁻³", "[H⁺] at pH 5 is 1.0 × 10⁻⁵ mol dm⁻³, so it is ten times lower"],
    });
    const q = question(p);
    const result = run({
      question: q,
      part: p,
      attempt: attempt(
        { p1: "at pH 4 the hydrogen-ion concentration is 1.0 × 10⁻⁴ mol dm⁻³" },
        marked({ awarded: 1, max: 2, missedPoints: [p.markScheme[1] ?? ""] }),
        1,
        2,
      ),
    });
    expect(result.klass).toBe("command word");
    expect(result.reasons.some((r) => r.includes("compare"))).toBe(true);
  });
});

describe("interpretation", () => {
  it("is called when the loss is reading a graph, not the content", () => {
    const p = part({
      prompt: "Describe the trend shown on the graph.",
      marks: 2,
      markScheme: ["rate increases then plateaus"],
    });
    const q = question(p);
    const result = run({
      question: q,
      part: p,
      attempt: attempt({ p1: "the line goes up" }, marked({ awarded: 0, max: 2, missedPoints: p.markScheme }), 0, 2),
    });
    expect(result.klass).toBe("interpretation");
    expect(result.confidence).toBe("high");
  });
});

describe("timing", () => {
  it("is called when the run was rushed on a part that was mostly earned", () => {
    const p = part({ prompt: "Describe the cardiac cycle.", marks: 6, markScheme: ["atria contract", "ventricles contract"] });
    const q = question(p);
    const result = run(
      {
        question: q,
        part: p,
        attempt: attempt({ p1: "atria contract then ventricles contract" }, marked({ awarded: 5, max: 6, missedPoints: ["ventricles relax"] }), 5, 6),
      },
      { timing: "rushed", secondsSpent: 14, marksLost: 1 },
    );
    expect(result.klass).toBe("timing");
  });
});

describe("terminology", () => {
  it("is called when the point demands a term the answer talked around", () => {
    const p = part({
      prompt: "Explain how water moves in osmosis.",
      marks: 2,
      markScheme: ["water moves down its water potential gradient"],
      aos: ["AO1"],
    });
    const q = question(p);
    const result = run({
      question: q,
      part: p,
      attempt: attempt(
        { p1: "water moves from where there is a lot to where there is less" },
        marked({ awarded: 0, max: 2, missedPoints: p.markScheme }),
        0,
        2,
      ),
    });
    expect(result.klass).toBe("terminology");
    expect(result.reasons.some((r) => r.includes("water potential"))).toBe(true);
  });
});

describe("structure", () => {
  it("is called when several points of a multi-point part were lost together", () => {
    const p = part({
      prompt: "Describe how ATP is synthesised during respiration.",
      marks: 4,
      markScheme: ["ATP is produced by ATP synthase", "energy comes from the proton gradient", "oxygen is the final electron acceptor"],
      aos: ["AO1"],
    });
    const q = question(p);
    const result = run({
      question: q,
      part: p,
      attempt: attempt(
        { p1: "ATP is produced by ATP synthase and oxygen is the final electron acceptor" },
        marked({ awarded: 2, max: 4, missedPoints: ["ATP is produced by ATP synthase", "oxygen is the final electron acceptor"] }),
        2,
        4,
      ),
    });
    expect(result.klass).toBe("structure");
  });
});

describe("careless error", () => {
  it("is called for a single mark dropped on an otherwise strong answer", () => {
    const p = part({ prompt: "Describe the appearance of a flaccid cell.", marks: 4, markScheme: ["the cell is flaccid"] });
    const q = question(p);
    const result = run({
      question: q,
      part: p,
      attempt: attempt({ p1: "the cell is flaccid and the membrane pulls away" }, marked({ awarded: 3, max: 4, missedPoints: ["the cell is flaccid"] }), 3, 4),
    });
    expect(result.klass).toBe("careless error");
    expect(result.confidence).toBe("high");
  });
});

describe("legacy fallback", () => {
  it("maps capture-time categories when no mark-scheme context exists", () => {
    const m = mistake({ category: "arithmetic" });
    // An attempt that carries evidence text but no question/part context:
    // no rich rule fires, so the stored category is mapped with low confidence.
    const attemptRow = attempt(
      { p1: "some text" },
      marked({ awarded: 0, max: 1, missedPoints: [], comment: "" }),
      0,
      1,
    );
    attemptRow.marked = [{ ...attemptRow.marked[0]!, evidence: [{ point: "x", status: "missed", evidence: "some text", evidenceStrength: "partial", confidence: 0.5, explanation: "e" }] }];
    const result = classifyMistake({ mistake: m, attempt: attemptRow });
    expect(result.klass).toBe("calculation");
    expect(result.confidence).toBe("low");
  });

  it("never claims a knowledge gap for a row whose attempt no longer exists", () => {
    // No question, no part, no attempt: nothing says what the student wrote,
    // so the honest answer is the capture-time mapping, not a guess that the
    // point was unknown.
    const m = mistake({ category: "recall" });
    const result = classifyMistake({ mistake: m });
    expect(result.klass).toBe("knowledge gap");
    expect(result.confidence).toBe("low");
    expect(result.reasons[0]).toContain("capture-time");
  });
});
