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
} from "@/domain/practice-step-mode";
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
    expect(byKind.get("guided-question")).toBe("/practice?topic=t1&guided=1");
    expect(byKind.get("exam-style-question")).toBe("/practice?topic=t1&unaided=1");
    expect(byKind.get("timed-question")).toBe("/practice?topic=t1&timed=1&command=explain");
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
    expect(page).toContain("limitStepQueue(orderByCommand(ranked, timedCommand)");
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
