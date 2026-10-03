import { describe, expect, it } from "vitest";
import { buildCommandCentre, COMMAND_CENTRE_DAYS, TIME_BOXES, timeBoxPlan, type TimeBoxContext } from "@/domain/pre-exam-plan";
import { buildMarksAtRisk } from "@/domain/marks-at-risk";
import { buildMarkRecovery } from "@/domain/mark-recovery";
import { buildMistakePatterns } from "@/domain/mistake-patterns";
import { diagnoseLoss } from "@/domain/loss-diagnosis";
import { dimensionOf, quickDiagnosticReport, selectQuickDiagnostic, QUICK_MAX_MINUTES } from "@/domain/quick-diagnostic";
import { effectivenessReport, effectivenessWeight, outcomeKindFor, rankedWeight } from "@/domain/effectiveness";
import { learnerState, topicEvidenceSummary } from "@/domain/learner-state";
import type { TopicLifecycle } from "@/domain/proof-lifecycle";
import type { InterventionOutcomeRecord, Question } from "@/domain/types";
import { attempt, bank, mistake, question } from "./helpers-recovery";

const ctx = (over: Partial<TimeBoxContext> = {}): TimeBoxContext => ({
  daysToExam: 30, hasRecurringError: true, recurringLabel: "unit errors", delayedProofDue: false, hasOpenLoss: true, paperAvailable: true, untouchedHighValue: true, dueCards: 0, ...over,
});

describe("pre-exam time boxes", () => {
  it("fills each box exactly and uses different strategies, not a scaled session", () => {
    for (const days of [90, 30, 10, 2]) {
      for (const m of TIME_BOXES) {
        const plan = timeBoxPlan(m, ctx({ daysToExam: days }));
        expect(plan.steps.reduce((s, x) => s + x.minutes, 0)).toBe(m);
      }
    }
    const plans = TIME_BOXES.map((m) => timeBoxPlan(m, ctx({ daysToExam: 10 })));
    expect(new Set(plans.map((p) => p.strategy)).size).toBeGreaterThanOrEqual(4);
    expect(plans[0].strategy).toBe("recurring-error-repair");
    expect(plans[3].strategy).toBe("timed-section");
    expect(plans[4].strategy).toBe("autopsy-correction");
  });

  it("changes strategy as the exam approaches and avoids new content in the final days", () => {
    expect(timeBoxPlan(20, ctx({ daysToExam: 90 })).strategy).toBe("first-pass-and-repair");
    expect(timeBoxPlan(20, ctx({ daysToExam: 30 })).strategy).toBe("targeted-application");
    expect(timeBoxPlan(20, ctx({ daysToExam: 8 })).strategy).toBe("repair-and-retest");
    for (const m of TIME_BOXES) expect(timeBoxPlan(m, ctx({ daysToExam: 2 })).introducesNewContent).toBe(false);
    expect(timeBoxPlan(60, ctx({ daysToExam: 2 })).strategy).toBe("final-consolidation");
  });

  it("leaves repair out when there is nothing to repair, and still fills the box", () => {
    for (const m of TIME_BOXES) {
      const plan = timeBoxPlan(m, ctx({ daysToExam: 30, hasRecurringError: false, hasOpenLoss: false, untouchedHighValue: false }));
      expect(plan.steps.some((x) => x.kind === "technique-intervention" || x.kind === "mistake-recovery")).toBe(false);
      expect(plan.steps.reduce((n, x) => n + x.minutes, 0)).toBe(m);
    }
  });

  it("prefers a due delayed check for short boxes", () => {
    expect(timeBoxPlan(10, ctx({ delayedProofDue: true })).strategy).toBe("proof-check");
    expect(timeBoxPlan(5, ctx({ hasRecurringError: false, delayedProofDue: false })).strategy).toBe("retrieval-check");
  });

  it("is only active in the countdown window", () => {
    const ms = [mistake("m1", { workingErrorKind: "unit-error" }), mistake("m2", { workingErrorKind: "unit-error", questionId: "q-a2", createdAt: "2026-09-22T09:00:00.000Z" })];
    const make = (days: number | null) => buildCommandCentre({
      daysToExam: days, marksAtRisk: buildMarksAtRisk({ mistakes: ms, attempts: [], questions: bank }),
      patterns: buildMistakePatterns({ mistakes: ms, attempts: [], questions: bank }),
      recovery: buildMarkRecovery({ mistakes: ms, attempts: [], questions: bank }).totals, missions: [], delayedProofDue: 0, untouchedHighValue: [],
    });
    expect(make(COMMAND_CENTRE_DAYS + 1).active).toBe(false);
    const cc = make(20);
    expect(cc.active).toBe(true);
    expect(cc.actions).toHaveLength(5);
    expect(cc.recurring[0].label).toMatch(/unit/);
    expect(cc.actions[0].strategy).toBe("recurring-error-repair");
  });
});

describe("quick diagnostic", () => {
  const demand = (id: string, topicId: string, d: NonNullable<Question["learning"]>["demand"], over: Partial<Question> = {}) =>
    question(id, topicId, { learning: { familyId: `fam-${id}`, contextId: "c", demand: d, expectedMinutes: 2 }, ...over });
  const pool = [
    demand("r1", "t1", "recall", { kind: "short", totalMarks: 1 }), demand("a1", "t1", "application"), demand("c1", "t2", "calculation", { kind: "calculation" }),
    demand("u1", "t2", "transfer"), demand("e1", "t3", "explanation", { kind: "extended", totalMarks: 4 }),
    demand("big", "t3", "application", { totalMarks: 40 }),
  ];

  it("samples different dimensions within 5-10 minutes", () => {
    const sel = selectQuickDiagnostic({ questions: pool, topicIds: ["t1", "t2", "t3"], budgetMinutes: 10 });
    const dims = new Set(sel.items.map((i) => i.dimension));
    expect(dims.size).toBeGreaterThanOrEqual(4);
    expect(sel.minutes).toBeLessThanOrEqual(QUICK_MAX_MINUTES);
    expect(sel.items.find((i) => i.questionId === "big")).toBeUndefined();
    expect(sel.uncovered).toContain("prerequisite");
    expect(dimensionOf(pool[3])).toBe("unfamiliar-application");
  });

  it("reports thin evidence as unproven or unmeasured, never as strength", () => {
    const r = quickDiagnosticReport({ topicIds: ["t1", "t2", "t3"], probes: [{ topicId: "t1", dimension: "recall", awarded: 1, max: 1 }] });
    expect(r.findings.find((f) => f.topicId === "t1")?.verdict).toBe("unproven");
    expect(r.findings.find((f) => f.topicId === "t2")?.verdict).toBe("unmeasured");
    expect(r.firstMission).toBeNull();
    expect(r.caveat).toMatch(/initial signal, not a predicted grade/);
  });

  it("finds weaknesses, repeated errors and a first mission", () => {
    const r = quickDiagnosticReport({
      topicIds: ["t1", "t2"], topicTitle: (id) => (id === "t1" ? "Mechanics" : "Electricity"),
      probes: [
        { topicId: "t1", dimension: "recall", awarded: 1, max: 1 }, { topicId: "t1", dimension: "standard-application", awarded: 3, max: 3 },
        { topicId: "t2", dimension: "calculation", awarded: 0, max: 3, cause: "unit-error" }, { topicId: "t2", dimension: "standard-application", awarded: 1, max: 4, cause: "unit-error" },
      ],
    });
    expect(r.findings.find((f) => f.topicId === "t1")?.verdict).toBe("strong");
    expect(r.repeatedErrors[0]).toEqual({ cause: "unit-error", count: 2 });
    expect(r.firstMission?.topicId).toBe("t2");
    expect(r.lines.next).toMatch(/Electricity/);
  });
});

describe("loss diagnosis", () => {
  it("explains what happened, why, the pattern and the fix", () => {
    const ms = [
      mistake("m1", { workingErrorKind: "conversion-error", firstIncorrectStep: 2, createdAt: "2026-09-18T09:00:00.000Z" }),
      mistake("m2", { workingErrorKind: "unit-error", questionId: "q-a2", createdAt: "2026-09-20T09:00:00.000Z" }),
      mistake("m3", { workingErrorKind: "unit-error", questionId: "q-a3", createdAt: "2026-09-22T09:00:00.000Z" }),
    ];
    const d = diagnoseLoss(ms[0], buildMistakePatterns({ mistakes: ms, attempts: [], questions: bank }));
    expect(d.confident).toBe(true);
    expect(d.why).toMatch(/step 2/);
    expect(d.pattern).toMatch(/3 different questions/);
    expect(d.bestFix).toMatch(/technique drill/);
  });

  it("says so when the evidence is weak", () => {
    const m = mistake("m1", { category: "unclassified" });
    const d = diagnoseLoss(m, []);
    expect(d.confident).toBe(false);
    expect(d.why).toMatch(/not enough evidence/);
    expect(d.pattern).toBeNull();
  });
});

describe("effectiveness", () => {
  const record = (i: number, over: Partial<InterventionOutcomeRecord> = {}, repeat = false): InterventionOutcomeRecord => ({
    id: `o${i}`, userId: "u", subjectId: "maths", topicId: "algebra", capabilityId: "cap", kind: "guided", priorState: "weak", priorAccuracy: 0.3,
    evidenceVersion: 2, timeMeasured: true, immediateFamilyId: "f1", plannedMinutes: 10, actualMinutes: 10, support: "none",
    immediate: { awarded: 3, max: 4, independent: true, attemptId: "a", at: "2026-09-01T09:00:00.000Z", trusted: true },
    transfer: { awarded: 3, max: 4, independent: true, questionId: "q2", attemptId: "b", at: "2026-09-02T09:00:00.000Z", familyId: repeat ? "f1" : "f2", trusted: true },
    delayedRetention: { awarded: 3, max: 4, independent: true, questionId: "q3", attemptId: "c", at: "2026-09-12T09:00:00.000Z", familyId: "f3", trusted: true },
    createdAt: "2026-09-01T09:00:00.000Z", updatedAt: "2026-09-12T09:00:00.000Z", ...over,
  });

  it("measures marks per hour from durable chains only", () => {
    const [row] = effectivenessReport([record(1), record(2)]);
    expect(row.durableChains).toBe(2);
    expect(row.marksGained).toBeGreaterThan(0);
    expect(row.marksPerHour).toBeGreaterThan(0);
    expect(row.reliable).toBe(false);
    expect(row.weight).toBe(1);
  });

  it("gives same-family repeats no durable credit", () => {
    const [row] = effectivenessReport([record(1, {}, true)]);
    expect(row.durableChains).toBe(0);
    expect(row.repeatOnly).toBe(1);
    expect(row.marksGained).toBeNull();
  });

  it("down-weights an intervention that keeps failing and favours one that works", () => {
    const bad = Array.from({ length: 6 }, (_, i) => record(i, { priorAccuracy: 0.8, delayedRetention: { ...record(i).delayedRetention!, awarded: 1 } }));
    const good = Array.from({ length: 6 }, (_, i) => record(i, { kind: "independent", priorAccuracy: 0.2, delayedRetention: { ...record(i).delayedRetention!, awarded: 4 } }));
    const report = effectivenessReport([...bad, ...good]);
    expect(effectivenessWeight(report, "guided")).toBeLessThan(1);
    expect(effectivenessWeight(report, "independent")).toBeGreaterThan(1);
    expect(effectivenessReport(bad)[0].regressionRate).toBe(1);
    expect(rankedWeight(report, "technique-intervention")).toBeLessThan(1);
    expect(rankedWeight(report, "independent-set")).toBeGreaterThan(1);
    expect(rankedWeight(report, "full-paper")).toBeGreaterThan(1);
    expect(rankedWeight([], "technique-intervention")).toBe(1);
    expect(outcomeKindFor("delayed-proof-retest")).toBe("retention");
  });
});

describe("learner-facing states", () => {
  const life = (stage: TopicLifecycle["stage"], over: Partial<TopicLifecycle> = {}): TopicLifecycle => ({ topicId: "algebra", stage, label: stage, line: "line", claim: null, dueNow: false, memorised: false, ...over });
  it("projects the lifecycle onto six plain states", () => {
    expect(learnerState(life("not-started")).label).toBe("Not checked");
    expect(learnerState(life("weak")).label).toBe("Needs work");
    expect(learnerState(life("practising")).label).toBe("Improving");
    expect(learnerState(life("looks-learned")).label).toBe("Awaiting proof");
    expect(learnerState(life("holding")).label).toBe("Proven");
    expect(learnerState(life("slipped")).label).toBe("Regressed");
  });
  it("explains proof from the actual evidence on demand", () => {
    const attempts = [attempt("a1", "q-a1", 3, 3, "2026-09-01T09:00:00.000Z"), attempt("a2", "q-a2", 3, 3, "2026-09-07T09:00:00.000Z")];
    const ev = topicEvidenceSummary("algebra", attempts, bank);
    expect(ev).toMatchObject({ differentQuestions: 2, spanDays: 6 });
    expect(learnerState(life("proven"), ev).detail).toMatch(/Based on 2 different questions, answered independently/);
    expect(learnerState(life("awaiting-proof")).detail).toMatch(/check this again later on a different question/);
  });
});
