import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXAM_SECONDS_PER_MARK,
  examPaceState,
  examPaceTargetSeconds,
  formatClock,
  guidedOpeningTiers,
  orderByCommand,
  parseCommandParam,
  parsePracticeStepMode,
  limitStepQueue,
  STEP_QUEUE_LIMIT,
  questionUsesCommand,
  stepModeApplies,
  stepModeHintBudget,
  chooseWorkedExample,
  fitStepQueueToMinutes,
  freshAfterExample,
  hasWorkedSolution,
  parseStepMinutes,
  stepModeSupportTier,
  WORKED_STEP_TRIES,
} from "@/domain/practice-step-mode";
import { hintEvidenceSource } from "@/domain/hint-tiers";
import { learnerEvidenceTrusted } from "@/domain/content-trust";
import { unseenQuestion } from "@/domain/learning-evidence";
import type { Attempt, Question } from "@/domain/types";
import { DEFAULT_SECONDS_PER_MARK } from "@/domain/response-time-calibration";
import { HINT_TIERS } from "@/domain/hint-tiers";
import { prescribeIntervention } from "@/domain/intervention-engine";
import type { TopicIntelligence } from "@/domain/learner-intelligence";

const params = (query: string) => new URLSearchParams(query);

describe("practice step modes (repair-plan links)", () => {
  it("reads only exact flags, timed over unaided over guided", () => {
    expect(parsePracticeStepMode(params("topic=t&guided=1"))).toBe("guided");
    expect(parsePracticeStepMode(params("topic=t&timed=1"))).toBe("timed");
    expect(parsePracticeStepMode(params("topic=t&unaided=1"))).toBe("unaided");
    expect(parsePracticeStepMode(params("guided=1&timed=1"))).toBe("timed");
    expect(parsePracticeStepMode(params("topic=t&worked=1"))).toBe("worked");
    // Supported never outranks a no-hint flag.
    expect(parsePracticeStepMode(params("worked=1&unaided=1"))).toBe("unaided");
    expect(parsePracticeStepMode(params("worked=1&guided=1"))).toBe("guided");
    expect(parsePracticeStepMode(params("guided=true"))).toBeNull();
    expect(parsePracticeStepMode(params("topic=t"))).toBeNull();
  });

  it("never overrides retests, far-transfer checks, recall or adaptive rungs", () => {
    const base = { mode: "guided" as const, retest: false, farTransfer: false, recall: false, adaptiveStep: false };
    expect(stepModeApplies(base)).toBe("guided");
    expect(stepModeApplies({ ...base, retest: true })).toBeNull();
    expect(stepModeApplies({ ...base, farTransfer: true })).toBeNull();
    expect(stepModeApplies({ ...base, recall: true })).toBeNull();
    expect(stepModeApplies({ ...base, adaptiveStep: true })).toBeNull();
  });

  it("timed and unaided allow no hints; guided keeps the page default", () => {
    expect(stepModeHintBudget("timed")).toBe(0);
    expect(stepModeHintBudget("unaided")).toBe(0);
    expect(stepModeHintBudget("guided")).toBeUndefined();
    expect(stepModeHintBudget(null)).toBeUndefined();
  });

  it("guided opens every rung below the worked solution that the question has", () => {
    expect(guidedOpeningTiers(HINT_TIERS, HINT_TIERS)).toEqual(["cue", "prompt", "scaffold"]);
    // A topic without key points has no prompt rung; nothing is invented.
    expect(guidedOpeningTiers(["cue", "scaffold"], HINT_TIERS)).toEqual(["cue", "scaffold"]);
    expect(guidedOpeningTiers(HINT_TIERS, [])).toEqual([]);
  });

  it("uses the existing 90 s a mark exam baseline", () => {
    expect(EXAM_SECONDS_PER_MARK).toBe(DEFAULT_SECONDS_PER_MARK);
    expect(examPaceTargetSeconds(4)).toBe(360);
    expect(examPaceState(360, 360)).toBe("on-pace");
    expect(examPaceState(361, 360)).toBe("over");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(375)).toBe("6:15");
  });

  it("puts questions using the command word first and drops none", () => {
    const qs = [
      { id: "a", stem: "A ball is thrown.", parts: [{ prompt: "State its speed." }] },
      { id: "b", stem: "A ball is thrown.", parts: [{ prompt: "Explain why it slows." }] },
      { id: "c", stem: "Explain the shape of the graph.", parts: [{ prompt: "(i)" }] },
    ] as never[];
    expect(parseCommandParam("Explain")).toBe("explain");
    expect(parseCommandParam("nonsense")).toBeNull();
    expect(parseCommandParam(null)).toBeNull();
    expect(questionUsesCommand(qs[2], "explain")).toBe(true);
    const { ordered, matched } = orderByCommand(qs, "explain");
    expect(matched).toBe(2);
    expect(ordered.map((q: { id: string }) => q.id)).toEqual(["b", "c", "a"]);
    expect(orderByCommand(qs, null).ordered.map((q: { id: string }) => q.id)).toEqual(["a", "b", "c"]);
  });
});

describe("a plan step is a short focused try", () => {
  it("caps the queue only in a step mode", () => {
    const ids = ["a", "b", "c", "d", "e"];
    expect(limitStepQueue(ids, "guided")).toEqual(ids.slice(0, STEP_QUEUE_LIMIT));
    expect(limitStepQueue(ids, "timed")).toHaveLength(3);
    expect(limitStepQueue(ids, null)).toEqual(ids);
  });
});

describe("the repair plan's practice links carry the mode their label promises", () => {
  const topic = {
    topicId: "t1", subjectId: "s1", mastery: 0.4, recall: 0.8, application: 0.3, applicationGap: 0.5,
    retention: 0.5, uncertainty: 0.3, evidenceAttempts: 6, evidence: "some", marksLost: 4, marksRecoverable: 4,
    openMistakes: 2, recurringMistakes: 0, daysSinceSuccess: null, daysToExam: 60, proofStatus: null,
    commandWeakness: "explain", timingWeakness: false,
  } as unknown as TopicIntelligence;
  it("guided, unaided and timed (with its command word) links", () => {
    const steps = prescribeIntervention(topic, "Topic").steps;
    const byKind = new Map(steps.map((step) => [step.kind, step.href]));
    expect(byKind.get("guided-question")).toBe("/practice?topic=t1&guided=1&minutes=8");
    expect(byKind.get("exam-style-question")).toBe("/practice?topic=t1&unaided=1&minutes=10");
    expect(byKind.get("timed-question")).toBe("/practice?topic=t1&timed=1&command=explain&minutes=8");
  });
  it("the worked-example step opens a worked example in practice, not the same lesson as the explanation", () => {
    const steps = prescribeIntervention(topic, "Topic").steps;
    const worked = steps.find((step) => step.kind === "worked-example")!;
    const explain = steps.find((step) => step.kind === "explain")!;
    expect(worked.href).toBe("/practice?topic=t1&worked=1&minutes=7");
    expect(worked.countsAsProof).toBe(false);
    expect(worked.href).not.toBe(explain.href);
  });
  it("every practice step link states the step's own minutes", () => {
    const shapes = [
      topic,
      { ...topic, applicationGap: null, recurringMistakes: 2, recall: 0.4 },
      { ...topic, applicationGap: null, application: 0.4 },
    ] as TopicIntelligence[];
    for (const shape of shapes) {
      for (const step of prescribeIntervention(shape, "Topic").steps) {
        if (!step.href.startsWith("/practice")) continue;
        expect(new URL(step.href, "http://x").searchParams.get("minutes")).toBe(String(step.minutes));
      }
    }
  });
  it("no plan emits the unread transfer=1 link", () => {
    const shapes: Partial<TopicIntelligence>[] = [
      {}, { evidence: "no-evidence" } as never, { recall: 0.3 }, { recurringMistakes: 3 }, { applicationGap: null, application: 0.2 },
      { proofStatus: "awaiting-proof" } as never, { evidence: "regressed" } as never, { commandWeakness: null } as never,
    ];
    for (const shape of shapes) {
      const steps = prescribeIntervention({ ...topic, ...shape } as TopicIntelligence, "Topic").steps;
      expect(steps.some((step) => step.kind === "far-transfer-question" || step.href.includes("transfer=1"))).toBe(false);
    }
  });
});

describe("practice honours the flags (source wiring)", () => {
  const page = readFileSync("src/app/practice/page.tsx", "utf8");
  const runner = readFileSync("src/components/QuestionRunner.tsx", "utf8");
  it("the page reads the step mode and hands it to the question", () => {
    expect(page).toContain("parsePracticeStepMode(params)");
    // Clicked from a marked answer on the same route: the step must remount
    // with its own queue, not keep the answered question.
    expect(page).toContain("<Practice key={step ? `step:${step}:");
    expect(page).toContain("hintBudget={adaptiveHintBudget ?? stepModeHintBudget(stepMode)}");
    expect(page).toContain("stepMode={stepMode}");
    expect(page).toContain("fitStepQueueToMinutes(orderByCommand(ranked, timedCommand).ordered, stepMinutes)");
    expect(page).toContain("fitStepQueueToMinutes(freshAfterExample(ranked, workedExample?.example ?? null), stepMinutes, WORKED_STEP_TRIES)");
    // The worked try records support, so it can never be unaided evidence.
    expect(page).toContain("externalHintTier={stepModeSupportTier(stepMode)}");
    expect(page).toContain('const stepMode = workedUnavailable ? "guided" : appliedStepMode;');
  });
  it("the question shows guided steps and an exam-pace clock", () => {
    expect(runner).toContain('data-testid="guided-steps"');
    expect(runner).toContain("<ExamPaceTimer");
    expect(runner).toContain('guided: stepMode === "guided"');
  });
});

describe("hint text shown in a guided try reads cleanly", () => {
  it("does not repeat the tier label or double a full stop", async () => {
    const { buildHintLadder, formatHint } = await import("@/domain/hints");
    const ladder = buildHintLadder(
      { stem: "A ball is thrown.", parts: [{ id: "p", prompt: "Explain.", marks: 2, markScheme: ["a", "b"] }] } as never,
      { keyPoints: ["Velocity is the gradient."], commonErrors: ["Treating weight and normal force as a pair."] },
    );
    const lines = ladder.map(formatHint);
    expect(lines.find((line) => line.startsWith("Think about"))).toBe("Think about: Velocity is the gradient.");
    expect(lines.find((line) => line.startsWith("Scaffold"))).toMatch(/a pair\.$/);
    expect(lines.some((line) => line.includes(".."))).toBe(false);
  });
});

const q = (id: string, totalMarks: number, extra: Partial<Question> = {}): Question => ({
  id, subjectId: "s", topicIds: ["t"], kind: "short", stem: `Stem ${id}.`,
  parts: [{ id: `${id}.p`, label: "(a)", prompt: "Explain.", marks: totalMarks, markScheme: ["point"], modelAnswer: `Model ${id}.` }],
  totalMarks, calculatorAllowed: false, difficulty: 2, origin: "seed", createdAt: "2026-01-01T00:00:00Z",
  learning: { familyId: `fam-${id}`, contextId: `ctx-${id}`, demand: "application" } as never,
  ...extra,
}) as Question;
const attempt = (questionId: string, awarded: number, max: number, createdAt: string): Attempt =>
  ({ id: `a-${questionId}-${createdAt}`, questionId, awarded, max, createdAt } as unknown as Attempt);

describe("a step fits its stated minutes at exam pace", () => {
  it("reads only a whole number of minutes from 1 to 60", () => {
    expect(parseStepMinutes("8")).toBe(8);
    expect(parseStepMinutes(" 10 ")).toBe(10);
    for (const bad of [null, "", "0", "61", "7.5", "-3", "abc", "999"]) expect(parseStepMinutes(bad)).toBeNull();
  });
  it("an 8-minute step holds 5 marks of questions, not three 6-mark ones", () => {
    const qs = [q("a", 6), q("b", 2), q("c", 6), q("d", 3), q("e", 1)];
    // 8 min = 480 s = 5.3 marks at 90 s a mark: the 6-mark ones are passed over.
    const fit = fitStepQueueToMinutes(qs, 8);
    expect(fit.queue.map((x) => x.id)).toEqual(["b", "d"]);
    expect(fit.seconds).toBe(450);
    expect(fit.overrun).toBe(false);
    // Small questions still stop at three.
    expect(fitStepQueueToMinutes([q("a", 1), q("b", 1), q("c", 1), q("d", 1)], 10).queue).toHaveLength(STEP_QUEUE_LIMIT);
  });
  it("offers the first question, flagged, when nothing fits", () => {
    const fit = fitStepQueueToMinutes([q("a", 9), q("b", 12)], 8);
    expect(fit.queue.map((x) => x.id)).toEqual(["a"]);
    expect(fit.overrun).toBe(true);
    expect(fitStepQueueToMinutes([], 8)).toEqual({ queue: [], seconds: 0, overrun: false });
  });
  it("without minutes keeps the old three-question cap", () => {
    const qs = [q("a", 6), q("b", 6), q("c", 6), q("d", 6)];
    expect(fitStepQueueToMinutes(qs, null).queue.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(fitStepQueueToMinutes(qs, null, WORKED_STEP_TRIES).queue).toHaveLength(1);
  });
});

describe("worked example step", () => {
  it("records the try as viewed support, never independent", () => {
    expect(stepModeSupportTier("worked")).toBe("scaffold");
    expect(hintEvidenceSource(stepModeSupportTier("worked"))).toBe("viewed");
    for (const mode of ["guided", "timed", "unaided", null] as const) expect(stepModeSupportTier(mode)).toBeNull();
    expect(stepModeHintBudget("worked")).toBeUndefined();
  });
  it("needs a model answer on every part", () => {
    expect(hasWorkedSolution(q("a", 2))).toBe(true);
    expect(hasWorkedSolution(q("b", 2, { parts: [{ id: "p", label: "", prompt: "x", marks: 2, markScheme: [], modelAnswer: "  " }] }))).toBe(false);
  });
  it("prefers a question already answered, lost marks first, then most recent", () => {
    const pool = [q("a", 2), q("b", 2), q("c", 2)];
    const attempts = [attempt("a", 2, 2, "2026-10-10T10:00:00Z"), attempt("b", 0, 2, "2026-10-09T10:00:00Z")];
    const choice = chooseWorkedExample({ pool, attempts, questions: pool });
    expect(choice?.example.id).toBe("b");
    expect(choice?.basis).toBe("your-answer");
  });
  it("otherwise uses an unanswered practice-only question", () => {
    const pool = [q("a", 2), q("b", 2)];
    const choice = chooseWorkedExample({ pool, attempts: [], questions: pool });
    expect(choice?.example.id).toBe("a");
    expect(choice?.basis).toBe("practice-only");
  });
  it("the try is outside the example's family", () => {
    const ex = q("a", 2);
    const sibling = q("a2", 2, { learning: { familyId: "fam-a", contextId: "c", demand: "application" } as never });
    expect(freshAfterExample([ex, sibling, q("b", 2)], ex).map((x) => x.id)).toEqual(["b"]);
    expect(freshAfterExample([ex, q("b", 2)], null).map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("never spends a reviewed unseen question (real bank, fixture-only teacher approvals)", async () => {
    const { seedQuestions } = await import("@/content");
    const { trustViaWorkflow } = await import("../e2e/review-fixture");
    // Nothing in the shipped bank is approved yet, so trust the first eight
    // prioritised topics of two flagships through the real review workflow
    // (fixture only, never written to the ledger) to make this non-vacuous.
    const trusted = [...trustViaWorkflow("wjec-alevel-maths", seedQuestions.filter((x) => x.subjectId === "wjec-alevel-maths"), 8),
      ...trustViaWorkflow("wjec-alevel-physics", seedQuestions.filter((x) => x.subjectId === "wjec-alevel-physics"), 8)];
    const byId = new Map(trusted.map((t) => [t.id, t]));
    const bank = seedQuestions.filter((x) => x.subjectId === "wjec-alevel-maths" || x.subjectId === "wjec-alevel-physics").map((x) => byId.get(x.id) ?? x);
    expect(bank.filter((x) => learnerEvidenceTrusted(x)).length).toBeGreaterThan(10);
    const topics = [...new Set(trusted.flatMap((x) => x.topicIds))];
    let practiceOnly = 0;
    let none = 0;
    for (const topicId of topics) {
      const pool = bank.filter((x) => x.topicIds.includes(topicId) && x.kind !== "mcq");
      const choice = chooseWorkedExample({ pool, attempts: [], questions: bank });
      if (!choice) { none++; continue; }
      practiceOnly++;
      expect(choice.basis).toBe("practice-only");
      expect(learnerEvidenceTrusted(choice.example)).toBe(false);
      const asIfAnswered = [{ questionId: choice.example.id } as Attempt];
      for (const other of bank) {
        if (other.subjectId !== choice.example.subjectId || !learnerEvidenceTrusted(other)) continue;
        expect(unseenQuestion(other, asIfAnswered, bank)).toBe(true);
      }
    }
    expect(practiceOnly + none).toBe(topics.length);
    expect(practiceOnly).toBeGreaterThan(0);
  }, 100_000);
});
