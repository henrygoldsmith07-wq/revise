import { describe, expect, it } from "vitest";
import { getSubject } from "@/domain/curriculum";
import { deriveCapabilityProfiles } from "@/domain/capability-source";
import { buildAdaptiveSession } from "@/domain/adaptive-session";
import { readinessStopFor } from "@/domain/adaptive-stop";
import { buildExamReadiness } from "@/domain/exam-readiness";
import type { GradePrediction } from "@/domain/grades";
import type { ApplicationMasteryRow } from "@/domain/application-mastery";
import type { RecallMasteryRow } from "@/domain/recall-mastery";
import type { Attempt, Card, ExamDate, Mistake, Question, Topic, TopicMastery } from "@/domain/types";

// The continuous tutor loop: every answer updates recall, explanation,
// application, transfer, retention, confidence and support-used evidence, and
// the next action is recomputed from it. These tests pin the wiring — the
// evidence attribution, the readiness-gated stop, and the question the runner
// must answer after each attempt — without mounting the app.

const SUBJECT = "bio";
const TOPIC = "bio.respiration";
const NOW = new Date("2026-09-05T12:00:00.000Z");

function topic(): Topic {
  return {
    id: TOPIC,
    subjectId: SUBJECT,
    unitId: "bio.unit-1",
    title: "Respiration",
    order: 1,
    intrinsicDifficulty: 3,
    summary: "How cells release usable energy.",
    keyPoints: ["ATP is regenerated through linked reactions."],
    commonErrors: ["Confusing aerobic and anaerobic pathways."],
  };
}

function question(id: string, kind: Question["kind"] = "short", difficulty: Question["difficulty"] = 3): Question {
  return {
    id,
    subjectId: SUBJECT,
    topicIds: [TOPIC],
    kind,
    stem: `Question ${id}`,
    parts: [{ id: `${id}.a`, label: "", prompt: "Explain.", marks: 2, markScheme: ["ATP"], modelAnswer: "ATP" }],
    totalMarks: 2,
    calculatorAllowed: true,
    difficulty,
    origin: "seed",
    createdAt: NOW.toISOString(),
  };
}

function attempt(id: string, questionId: string, awarded: number, overrides: Partial<Attempt> = {}): Attempt {
  return {
    id,
    userId: "u",
    questionId,
    subjectId: SUBJECT,
    topicIds: [TOPIC],
    answers: {},
    marked: [],
    awarded,
    max: 10,
    feedback: "feedback",
    markedBy: "rubric",
    elapsedMs: 1000,
    mode: "practice",
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}

function card(id: string): Card {
  return {
    id,
    userId: "u",
    subjectId: SUBJECT,
    topicId: TOPIC,
    kind: "basic",
    front: "What is ATP?",
    back: "The cell's immediate energy currency.",
    tags: [],
    origin: "seed",
    due: "2026-09-01",
    stability: 2,
    difficulty: 5,
    reps: 2,
    lapses: 1,
    state: 2,
    lastReviewedAt: "2026-08-01T12:00:00.000Z",
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
  };
}

function mastery(value: number): TopicMastery {
  return {
    topicId: TOPIC,
    subjectId: SUBJECT,
    mastery: value,
    retention: value,
    confidence: value,
    cardsTotal: 3,
    cardsDue: 1,
    attempts: 2,
    accuracy: value,
    lastStudiedAt: "2026-08-20T12:00:00.000Z",
    weak: value < 0.55,
  };
}

function recallRow(): RecallMasteryRow {
  return {
    topicId: TOPIC,
    subjectId: SUBJECT,
    mastery: 0.7,
    currentRetention: 0.7,
    trueRetention: 0.7,
    cardsTotal: 3,
    cardsDue: 1,
    reviews: 4,
    recalled: 3,
    lastReviewedAt: "2026-08-20T12:00:00.000Z",
    evidence: "emerging",
  };
}

function applicationRow(): ApplicationMasteryRow {
  return {
    topicId: TOPIC,
    subjectId: SUBJECT,
    mastery: 0.5,
    accuracy: 0.5,
    recentAccuracy: 0.5,
    marksAwarded: 5,
    marksAvailable: 10,
    attempts: 1,
    questionsAttempted: 1,
    averageDifficulty: 3,
    lastAttemptAt: NOW.toISOString(),
    evidence: "emerging",
  };
}

describe("continuous tutor-loop evidence", () => {
  it("records extended-kind answers as explanation evidence, not application double-counting", () => {
    const questions = [question("q-ext", "extended")];
    const attempts = [attempt("a1", "q-ext", 8)];
    const profiles = deriveCapabilityProfiles({
      recallMastery: [],
      applicationMastery: [],
      attempts,
      questions,
    });
    expect(profiles[TOPIC]?.explanation.score).toBeCloseTo(0.8, 5);
    // Application rows still own application evidence; the per-attempt
    // extended answer must not add a second application observation.
    expect(profiles[TOPIC]?.application.evidence ?? 0).toBe(0);
  });

  it("downgrades hint-assisted answers to weaker evidence than independent ones", () => {
    const questions = [question("q1", "extended"), question("q2", "extended")];
    const independent = deriveCapabilityProfiles({
      recallMastery: [],
      applicationMastery: [],
      attempts: [attempt("a1", "q1", 10)],
      questions,
    });
    const assisted = deriveCapabilityProfiles({
      recallMastery: [],
      applicationMastery: [],
      attempts: [attempt("a2", "q2", 10, { hintTier: "worked-solution" })],
      questions,
    });
    // Same marks, different support: the assisted explanation observation
    // carries less evidence because the success needed a worked solution.
    // Scores match (both full marks); the evidence weight is the honesty.
    const indieEvidence = independent[TOPIC]?.explanation.evidence ?? 0;
    const assistedEvidence = assisted[TOPIC]?.explanation.evidence ?? 0;
    expect(indieEvidence).toBeGreaterThan(0);
    expect(assistedEvidence).toBeGreaterThan(0);
    expect(indieEvidence).toBeGreaterThan(assistedEvidence);
    expect(independent[TOPIC]?.explanation.score).toBeCloseTo(
      assisted[TOPIC]?.explanation.score ?? 0,
      5,
    );
  });

  it("records caller-scored explanations as independent explanation evidence", () => {
    const profiles = deriveCapabilityProfiles({
      recallMastery: [],
      applicationMastery: [],
      attempts: [],
      explanations: [{ topicId: TOPIC, score: 0.6 }],
    });
    expect(profiles[TOPIC]?.explanation.score).toBeCloseTo(0.6, 5);
    expect(profiles[TOPIC]?.explanation.evidence).toBeGreaterThan(0);
  });

  it("keeps unknown capabilities unknown when there is no evidence", () => {
    const profiles = deriveCapabilityProfiles({ recallMastery: [], applicationMastery: [], attempts: [] });
    expect(profiles[TOPIC]).toBeUndefined();
  });
});

describe("readiness-gated adaptive stopping", () => {
  const exam: ExamDate = { id: "exam", userId: "u", subjectId: SUBJECT, date: "2026-09-20", label: "Paper 1" };

  function readyRow() {
    const subject = getSubject("wjec-alevel-chemistry")!;
    const prediction: GradePrediction = {
      subjectId: subject.id,
      percent: 74,
      grade: "A",
      bestCase: "A",
      worstCase: "C",
      confidence: 0.75,
      trend: 0,
      headroom: [],
    };
    return buildExamReadiness({
      subject,
      prediction,
      targetGrade: "A",
      examDays: 42,
      coverage: { average: 0.82, topics: 10, evidencedTopics: 9 },
      retention: { average: 0.86, cards: 80, reviews: 24 },
      timed: { accuracy: 0.84, attempts: 10, marks: 48 },
      pace: { ratio: 1, attempts: 8 },
      transfer: { passRate: 0.9, completed: 3, due: 0 },
    });
  }

  function sessionInput(readiness: ReturnType<typeof buildExamReadiness>[]) {
    const mistake: Mistake = {
      id: "m1",
      userId: "u",
      subjectId: SUBJECT,
      topicId: TOPIC,
      marksLost: 2,
      description: "miss",
      category: "interpretation",
      resolved: false,
      createdAt: "2026-09-04T12:00:00.000Z",
    };
    return {
      topics: [topic()],
      subjectIds: [SUBJECT],
      cards: [card("c1"), card("c2"), card("c3")],
      reviewLogs: [],
      questions: [question("q1", "short", 1), question("q2", "short", 3), question("q3", "short", 5)],
      attempts: [],
      mistakes: [mistake],
      mastery: [mastery(0.25)],
      exams: [exam],
      targetMinutes: 20 as const,
      recallMastery: [recallRow()],
      applicationMastery: [applicationRow()],
      readiness,
      now: NOW,
    };
  }

  it("stops the independent/transfer rungs only when readiness proves the topic", () => {
    const row = readyRow();
    expect(row.status).toBe("ready");
    const stop = readinessStopFor([{ ...row, subjectId: SUBJECT }], SUBJECT);
    expect(stop.stop).toBe(true);
    expect(stop.reason).toContain("evidence");

    const plan = buildAdaptiveSession(sessionInput([{ ...row, subjectId: SUBJECT }]));
    expect(plan).not.toBeNull();
    expect(plan!.stoppedEarly?.reason).toContain("evidence");
    expect(plan!.steps.some((step) => step.kind === "independent-application")).toBe(false);
    expect(plan!.steps.some((step) => step.kind === "transfer")).toBe(false);
    // Retrieval and delayed proof survive the stop.
    expect(plan!.steps.at(-1)!.kind).toBe("delayed-retrieval");
  });

  it("keeps the full loop when the exam is imminent, even for ready topics", () => {
    const row = { ...readyRow(), subjectId: SUBJECT, examDays: 7 };
    expect(readinessStopFor([row], SUBJECT).stop).toBe(false);
    const plan = buildAdaptiveSession(sessionInput([row]));
    expect(plan!.stoppedEarly).toBeUndefined();
    expect(plan!.steps.some((step) => step.kind === "independent-application")).toBe(true);
  });

  it("hands each step back to the same tutor run after the work is done", () => {
    const plan = buildAdaptiveSession({
      topics: [topic()],
      subjectIds: [SUBJECT],
      cards: [card("c1"), card("c2"), card("c3")],
      reviewLogs: [],
      questions: [question("q1", "short", 1), question("q2", "short", 3), question("q3", "short", 5)],
      attempts: [],
      mistakes: [],
      mastery: [mastery(0.25)],
      exams: [],
      targetMinutes: 20 as const,
      now: NOW,
    });
    expect(plan).not.toBeNull();
    for (const step of plan!.steps) {
      expect(step.href, step.kind).toContain("from=adaptive");
      expect(step.href, step.kind).toContain("return=");
      expect(step.href, step.kind).toContain(encodeURIComponent(plan!.topicId));
    }
    const supported = plan!.steps.find((step) => step.kind === "supported-practice")!;
    expect(supported.href).toContain("adaptiveStep=supported");
    expect(plan!.steps.find((step) => step.kind === "independent-application")!.href).toContain("adaptiveStep=independent");
  });
  it("keeps the full loop without readiness rows and explains each step's why", () => {
    const plan = buildAdaptiveSession(sessionInput([]));
    expect(plan!.stoppedEarly).toBeUndefined();
    expect(plan!.steps.map((step) => step.kind)).toEqual([
      "overdue-retrieval",
      "misconception-repair",
      "explanation",
      "supported-practice",
      "independent-application",
      "transfer",
      "delayed-retrieval",
    ]);
    for (const step of plan!.steps) {
      expect(step.why, step.kind).toBeTruthy();
    }
  });
});
