import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_MAX_QUESTION_ATTEMPTS,
  QUESTION_STEP_KINDS,
  replanAdaptiveSession,
  resultFromQuestionAttempt,
  resultFromRetrievalGrades,
  summariseAdaptiveRun,
  type AdaptiveSessionPlan,
  type AdaptiveSessionStep,
  type AdaptiveStepKind,
  type AdaptiveStepRecord,
} from "@/domain/adaptive-session";
import type { Attempt, Card, Mistake, Question } from "@/domain/types";

// ---------------------------------------------------------------------------
// Continuous in-session adaptation: after every executed step the tutor
// re-derives the remaining sequence from the evidence that step created.
// These tests pin the evidence rules — independent success removes support,
// failure raises it, misconception/retrieval/prerequisite failures route to
// their repairs, assisted success is never independent evidence, and the run
// can never loop or exceed its budget.
// ---------------------------------------------------------------------------

const SUBJECT = "bio";
const TOPIC = "bio.respiration";
const PREREQ = "bio.energetics";

function topicStep(kind: AdaptiveStepKind, index: number, extra: Partial<AdaptiveSessionStep> = {}): AdaptiveSessionStep {
  return {
    id: `${TOPIC}:${kind}${index > 0 ? `-${index}` : ""}`,
    kind,
    minutes: 4,
    label: kind,
    description: "",
    href: "/practice?from=adaptive",
    topicId: TOPIC,
    subjectId: SUBJECT,
    cardIds: [],
    questionIds: [],
    mistakeIds: [],
    ...extra,
  };
}

/** A minimal but well-formed plan; original ladder = the given step list. */
function plan(steps: AdaptiveSessionStep[], overrides: Partial<AdaptiveSessionPlan> = {}): AdaptiveSessionPlan {
  const targetMinutes = overrides.targetMinutes ?? Math.max(12, steps.reduce((sum, step) => sum + step.minutes, 0));
  return {
    key: `2026-09-05:${TOPIC}`,
    subjectId: SUBJECT,
    topicId: TOPIC,
    topicTitle: "Respiration",
    targetMinutes,
    totalMinutes: targetMinutes,
    score: 1,
    reason: "test",
    evidence: {
      dueCount: 0,
      overdueCount: 0,
      dueCardIds: [],
      openMistakes: 0,
      openMistakeIds: [],
      marksLost: 0,
      mastery: 0.3,
      retention: 0.4,
      daysSinceStudy: null,
      daysToExam: null,
      examUrgency: 0,
      questionCount: 0,
      attempts: 0,
      focus: "application",
      focusState: "emerging",
      factors: {
        fsrs: 0,
        mastery: 0.7,
        mistakes: 0,
        examProximity: 0,
        forgetting: 0,
        capabilityGap: 0.5,
        uncertainty: 0.5,
      },
    },
    steps,
    startHref: "/adaptive-session?topic=bio.respiration&start=1",
    ...overrides,
  };
}

function question(id: string, difficulty: 1 | 2 | 3 | 4 | 5, topicId = TOPIC): Question {
  return {
    id,
    subjectId: SUBJECT,
    topicIds: [topicId],
    kind: "short",
    stem: `Question ${id}`,
    parts: [
      {
        id: `${id}.a`,
        label: "",
        prompt: "Explain.",
        marks: 2,
        markScheme: [`Point ${id}`],
        modelAnswer: `Point ${id}`,
      },
    ],
    totalMarks: 2,
    calculatorAllowed: true,
    difficulty,
    origin: difficulty >= 4 ? "past-paper" : "seed",
    createdAt: "2026-09-05T12:00:00.000Z",
  };
}

function mistake(id: string, opts: { questionId?: string; resolved?: boolean; marksLost?: number } = {}): Mistake {
  return {
    id,
    userId: "u",
    subjectId: SUBJECT,
    topicId: TOPIC,
    ...(opts.questionId ? { questionId: opts.questionId } : {}),
    marksLost: opts.marksLost ?? 2,
    description: "The credited point was missing.",
    category: "recall",
    resolved: opts.resolved ?? false,
    createdAt: "2026-09-04T12:00:00.000Z",
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
    back: "The cell's energy currency.",
    tags: [],
    origin: "seed",
    due: "2026-09-01",
    stability: 2,
    difficulty: 5,
    reps: 2,
    lapses: 0,
    state: 2,
    lastReviewedAt: "2026-08-01T12:00:00.000Z",
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
  };
}

function record(partial: Partial<AdaptiveStepRecord> & Pick<AdaptiveStepRecord, "stepId" | "kind" | "result">): AdaptiveStepRecord {
  return {
    minutes: 4,
    awardedMarks: 0,
    maxMarks: 0,
    hintTier: null,
    elapsedMs: 0,
    ...partial,
  };
}

const NO_ATTEMPTS: Attempt[] = [];

function replan(
  completed: AdaptiveStepRecord[],
  opts: {
    questions?: Question[];
    cards?: Card[];
    mistakes?: Mistake[];
    attempts?: Attempt[];
    prereqQuestions?: Question[];
    prereq?: { prereqTopicId: string; prereqTopicTitle: string; kind: "prereq-first" | "prereq-unmeasured" };
    planSteps?: AdaptiveSessionStep[];
    targetMinutes?: number;
  } = {},
) {
  const steps = opts.planSteps ?? [
    topicStep("explanation", 0, { minutes: 2 }),
    topicStep("supported-practice", 0),
    topicStep("independent-application", 0),
    topicStep("transfer", 0),
    topicStep("delayed-retrieval", 0, { minutes: 1 }),
  ];
  return replanAdaptiveSession({
    plan: plan(steps, { targetMinutes: opts.targetMinutes }),
    completed,
    questions: opts.questions ?? [],
    cards: opts.cards ?? [],
    mistakes: opts.mistakes ?? [],
    attempts: opts.attempts ?? NO_ATTEMPTS,
    prereqQuestions: opts.prereqQuestions,
    prereq: opts.prereq,
  });
}

const qSupport = question("q1", 2);
const qIndep = question("q2", 3);
const qTransfer = question("q3", 5);

describe("result classification", () => {
  it("full marks with no hint is the only independent pass", () => {
    expect(resultFromQuestionAttempt({ awarded: 2, max: 2, hintTier: null })).toBe("passed-independent");
    expect(resultFromQuestionAttempt({ awarded: 2, max: 2, hintTier: "cue" })).toBe("passed-assisted");
    expect(resultFromQuestionAttempt({ awarded: 2, max: 2, hintTier: "scaffold" })).toBe("passed-assisted");
    expect(resultFromQuestionAttempt({ awarded: 2, max: 2, hintTier: null, copiedAnswer: true })).toBe("passed-assisted");
    expect(resultFromQuestionAttempt({ awarded: 1, max: 2, hintTier: null })).toBe("missed");
    expect(resultFromQuestionAttempt({ awarded: 0, max: 2, hintTier: "worked-solution" })).toBe("missed");
    expect(resultFromQuestionAttempt({ awarded: 2, max: 2, hintTier: null, gaveUp: true })).toBe("gave-up");
  });

  it("a retrieval is missed only when a card is graded again", () => {
    expect(resultFromRetrievalGrades(["good", "easy"])).toBe("passed-independent");
    expect(resultFromRetrievalGrades(["good", "again"])).toBe("missed");
    expect(resultFromRetrievalGrades(["again", "again"])).toBe("missed");
  });
});

describe("continuous adaptation", () => {
  it("independent success removes the unneeded teaching step", () => {
    const result = replan(
      [
        record({
          stepId: `${TOPIC}:supported-practice`,
          kind: "supported-practice",
          result: "passed-independent",
          awardedMarks: 2,
          maxMarks: 2,
          itemId: qSupport.id,
        }),
      ],
      { questions: [qSupport, qIndep, qTransfer] },
    );
    // Explanation was still pending in the original ladder, but independent
    // success proves the gap is closed — teaching is dropped, not kept.
    expect(result.steps.some((step) => step.kind === "explanation")).toBe(false);
    expect(result.steps[0]?.kind).toBe("independent-application");
  });

  it("a failure raises support before the next rung", () => {
    const result = replan(
      [
        record({
          stepId: `${TOPIC}:independent-application`,
          kind: "independent-application",
          result: "missed",
          itemId: qIndep.id,
        }),
      ],
      {
        planSteps: [topicStep("independent-application", 0), topicStep("transfer", 0), topicStep("delayed-retrieval", 0, { minutes: 1 })],
        targetMinutes: 20,
        questions: [qSupport, qIndep, qTransfer],
        // No mistake is recorded, so repair cannot be the route.
      },
    );
    const first = result.steps[0];
    expect(first?.kind).toBe("supported-practice");
    expect(first?.params?.hintBudget).toBeGreaterThan(0);
    // The independent rung is owed again afterwards — support alone is not proof.
    expect(result.steps.some((step) => step.kind === "independent-application")).toBe(true);
    expect(result.steps.some((step) => step.kind === "transfer")).toBe(true);
  });

  it("assisted success is weaker evidence: the independent rung is still owed", () => {
    const result = replan(
      [
        record({
          stepId: `${TOPIC}:supported-practice`,
          kind: "supported-practice",
          result: "passed-assisted",
          awardedMarks: 2,
          maxMarks: 2,
          hintTier: "cue",
          itemId: qSupport.id,
        }),
      ],
      {
        planSteps: [topicStep("supported-practice", 0), topicStep("independent-application", 0), topicStep("transfer", 0), topicStep("delayed-retrieval", 0, { minutes: 1 })],
        questions: [qSupport, qIndep, qTransfer],
      },
    );
    expect(result.steps[0]?.kind).toBe("independent-application");
  });

  it("a misconception is repaired with an independent retest of its own question", () => {
    const open = mistake("m1", { questionId: qIndep.id });
    const result = replan(
      [
        record({
          stepId: `${TOPIC}:independent-application`,
          kind: "independent-application",
          result: "missed",
          itemId: qIndep.id,
        }),
      ],
      { questions: [qSupport, qIndep, qTransfer], mistakes: [open] },
    );
    const repair = result.steps.find((step) => step.kind === "misconception-repair");
    expect(repair).toBeDefined();
    expect(repair!.questionIds).toContain(qIndep.id);
    expect(repair!.mistakeIds).toContain("m1");
    expect(repair!.params?.hintBudget).toBe(0); // repair is an independent retest
  });

  it("repeated failure triggers a bounded prerequisite detour when one exists", () => {
    const prereqQ = question("p1", 1, PREREQ);
    const result = replan(
      [
        record({ stepId: `${TOPIC}:supported-practice`, kind: "supported-practice", result: "missed", itemId: "a" }),
        record({ stepId: `${TOPIC}:independent-application`, kind: "independent-application", result: "missed", itemId: "b" }),
      ],
      {
        targetMinutes: 20,
        planSteps: [topicStep("supported-practice", 0), topicStep("independent-application", 0), topicStep("transfer", 0), topicStep("delayed-retrieval", 0, { minutes: 1 })],
        questions: [qSupport, qIndep, qTransfer],
        prereqQuestions: [prereqQ],
        prereq: { prereqTopicId: PREREQ, prereqTopicTitle: "Energetics", kind: "prereq-first" },
      },
    );
    const detour = result.steps[0];
    expect(detour?.kind).toBe("prerequisite-repair");
    expect(detour?.topicId).toBe(PREREQ);
    expect(detour?.questionIds).toContain(prereqQ.id);

    // After the detour passes, the tutor returns to the original topic family.
    const afterDetour = replan(
      [
        record({ stepId: `${TOPIC}:supported-practice`, kind: "supported-practice", result: "missed", itemId: "a" }),
        record({ stepId: `${TOPIC}:independent-application`, kind: "independent-application", result: "missed", itemId: "b" }),
        record({ stepId: `${PREREQ}:prerequisite-repair`, kind: "prerequisite-repair", result: "passed-independent", awardedMarks: 2, maxMarks: 2, itemId: prereqQ.id }),
      ],
      {
        targetMinutes: 20,
        planSteps: [topicStep("supported-practice", 0), topicStep("independent-application", 0), topicStep("transfer", 0), topicStep("delayed-retrieval", 0, { minutes: 1 })],
        questions: [qSupport, qIndep, qTransfer],
        prereqQuestions: [prereqQ],
        prereq: { prereqTopicId: PREREQ, prereqTopicTitle: "Energetics", kind: "prereq-first" },
      },
    );
    expect(afterDetour.steps.some((step) => step.kind === "prerequisite-repair")).toBe(false);
    expect(afterDetour.steps.some((step) => step.topicId === TOPIC && step.kind === "independent-application")).toBe(true);
  });

  it("transfer success schedules delayed retrieval and does not drill more", () => {
    const scheduledStep = plan(
      [topicStep("independent-application", 0), topicStep("transfer", 0), topicStep("delayed-retrieval", 0, { minutes: 1 })],
      { targetMinutes: 12 },
    );
    let result = replanAdaptiveSession({
      plan: scheduledStep,
      completed: [
        record({ stepId: `${TOPIC}:independent-application`, kind: "independent-application", result: "passed-independent", awardedMarks: 2, maxMarks: 2 }),
        record({ stepId: `${TOPIC}:transfer`, kind: "transfer", result: "passed-independent", awardedMarks: 2, maxMarks: 2 }),
      ],
      questions: [qSupport, qIndep, qTransfer],
      cards: [],
      mistakes: [],
      attempts: [],
    });
    expect(result.steps.map((step) => step.kind)).toEqual(["delayed-retrieval"]);
    expect(result.done).toBe(false);

    result = replanAdaptiveSession({
      plan: scheduledStep,
      completed: [
        record({ stepId: `${TOPIC}:independent-application`, kind: "independent-application", result: "passed-independent", awardedMarks: 2, maxMarks: 2 }),
        record({ stepId: `${TOPIC}:transfer`, kind: "transfer", result: "passed-independent", awardedMarks: 2, maxMarks: 2 }),
        record({ stepId: `${TOPIC}:delayed-retrieval`, kind: "delayed-retrieval", result: "scheduled", minutes: 1 }),
      ],
      questions: [qSupport, qIndep, qTransfer],
      cards: [],
      mistakes: [],
      attempts: [],
    });
    expect(result.steps).toHaveLength(0);
    expect(result.done).toBe(true);
  });

  it("retrieval failure retries the missed cards once, then teaches instead of cycling", () => {
    const c = card("c1");
    const cards = [c];
    const steps = [topicStep("overdue-retrieval", 0, { cardIds: [c.id], minutes: 2 }), topicStep("delayed-retrieval", 0, { minutes: 1 })];
    const base = plan(steps, { targetMinutes: 12 });

    const first = replanAdaptiveSession({
      plan: base,
      completed: [
        record({ stepId: `${TOPIC}:overdue-retrieval`, kind: "overdue-retrieval", result: "missed", missedItemIds: [c.id], minutes: 2 }),
      ],
      questions: [],
      cards,
      mistakes: [],
      attempts: [],
    });
    expect(first.steps[0]?.kind).toBe("overdue-retrieval");
    expect(first.steps[0]?.cardIds).toEqual([c.id]);

    const second = replanAdaptiveSession({
      plan: base,
      completed: [
        record({ stepId: `${TOPIC}:overdue-retrieval`, kind: "overdue-retrieval", result: "missed", missedItemIds: [c.id], minutes: 2 }),
        record({ stepId: `${TOPIC}:overdue-retrieval-1`, kind: "overdue-retrieval", result: "missed", missedItemIds: [c.id], minutes: 2 }),
      ],
      questions: [qSupport],
      cards,
      mistakes: [],
      attempts: [],
    });
    // No third retrieval cycle: teaching (then supported application) replaces it.
    expect(second.steps[0]?.kind).toBe("explanation");
    expect(second.steps.some((step) => step.kind === "overdue-retrieval")).toBe(false);
  });

  it("never repeats an executed step and cannot loop past the attempt cap", () => {
    const completed = Array.from({ length: ADAPTIVE_MAX_QUESTION_ATTEMPTS }, (_, i) =>
      record({
        stepId: `${TOPIC}:attempt-${i}`,
        kind: i % 2 === 0 ? "supported-practice" : "independent-application",
        result: "missed",
        itemId: `missed-q-${i}`,
      }),
    );
    const result = replan(completed, {
      questions: [qSupport, qIndep, qTransfer, question("q4", 3), question("q5", 2), question("q6", 4)],
      attempts: [],
    });
    const executedIds = new Set(completed.map((entry) => entry.stepId));
    for (const step of result.steps) {
      expect(executedIds.has(step.id)).toBe(false);
    }
    // With the cap reached, no new question rung may be queued — only the
    // structural delayed-retrieval step remains.
    expect(result.steps.some((step) => QUESTION_STEP_KINDS.has(step.kind))).toBe(false);
    expect(result.stopped).toBe(true);
  });

  it("stays inside the time budget even when the tutor wants more steps", () => {
    const steps = [
      topicStep("independent-application", 0),
      topicStep("transfer", 0),
      topicStep("delayed-retrieval", 0, { minutes: 1 }),
    ];
    // 19 of 20 minutes already spent by an executed independent attempt.
    const result = replanAdaptiveSession({
      plan: plan(steps, { targetMinutes: 20 }),
      completed: [
        record({ stepId: `${TOPIC}:independent-application`, kind: "independent-application", result: "passed-independent", minutes: 19 }),
      ],
      questions: [qSupport, qIndep, qTransfer],
      cards: [],
      mistakes: [],
      attempts: [],
    });
    const planned = result.steps.reduce((sum, step) => sum + step.minutes, 0);
    expect(result.steps.every((step) => step.kind === "delayed-retrieval")).toBe(true);
    expect(planned).toBeLessThanOrEqual(1);
  });

  it("completed steps always stay in history and the debrief reads from records only", () => {
    const completed = [
      record({ stepId: `${TOPIC}:supported-practice`, kind: "supported-practice", result: "passed-independent", awardedMarks: 2, maxMarks: 2, itemId: qSupport.id }),
      record({ stepId: `${TOPIC}:independent-application`, kind: "independent-application", result: "missed", awardedMarks: 0, maxMarks: 2, itemId: qIndep.id }),
      record({ stepId: `${TOPIC}:delayed-retrieval`, kind: "delayed-retrieval", result: "scheduled", minutes: 1 }),
    ];
    const summary = summariseAdaptiveRun({
      plan: plan([topicStep("delayed-retrieval", 0, { minutes: 1 })]),
      completed,
      openMistakeIds: [],
    });
    expect(summary.improved.some((line) => line.includes("Supported application"))).toBe(true);
    expect(summary.fragile.some((line) => line.includes("independent application"))).toBe(true);
    expect(summary.marks).toEqual({ awarded: 2, max: 4 });
    expect(summary.bestNext.length).toBeGreaterThan(0);
  });
});
