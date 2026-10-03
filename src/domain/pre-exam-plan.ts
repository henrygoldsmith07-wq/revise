// ---------------------------------------------------------------------------
// Pre-exam command centre: the highest-value use of the remaining time, and a
// different strategy per time box (not one session scaled up or down).
// Phases come from exam-countdown; the content of each box comes from what the
// learner's evidence says is outstanding.
// ---------------------------------------------------------------------------

import { APPLICATION_DAYS, countdownGuidance, type CountdownPhase } from "./exam-countdown";
import type { InterventionKind } from "./intervention-ranking";
import type { MarksAtRiskReport } from "./marks-at-risk";
import type { RecoveryTotals } from "./mark-recovery";
import type { ExamMission } from "./exam-mission";
import type { MistakePattern } from "./mistake-patterns";
import { ROOT_CAUSE_LABEL } from "./mistake-patterns";
import type { Id } from "./types";

export const COMMAND_CENTRE_DAYS = APPLICATION_DAYS;
export const TIME_BOXES = [5, 10, 20, 45, 60] as const;
export type TimeBox = (typeof TIME_BOXES)[number];

export type StrategyId =
  | "recurring-error-repair"
  | "retrieval-check"
  | "proof-check"
  | "repair-and-retest"
  | "targeted-application"
  | "first-pass-and-repair"
  | "mixed-sprint"
  | "timed-section"
  | "autopsy-correction"
  | "final-consolidation";

export interface TimeBoxStep {
  label: string;
  minutes: number;
  kind: InterventionKind;
}

export interface TimeBoxPlan {
  minutes: TimeBox;
  strategy: StrategyId;
  label: string;
  steps: TimeBoxStep[];
  reason: string;
  /** False in the final days unless the evidence strongly justifies it. */
  introducesNewContent: boolean;
  phase: CountdownPhase;
}

export interface TimeBoxContext {
  daysToExam: number | null;
  hasRecurringError: boolean;
  recurringLabel?: string;
  delayedProofDue: boolean;
  hasOpenLoss: boolean;
  paperAvailable: boolean;
  untouchedHighValue: boolean;
  dueCards: number;
}

const step = (label: string, minutes: number, kind: InterventionKind): TimeBoxStep => ({ label, minutes, kind });

export function timeBoxPlan(minutes: TimeBox, ctx: TimeBoxContext): TimeBoxPlan {
  const g = countdownGuidance(ctx.daysToExam);
  const phase = g.phase;
  const rec = ctx.recurringLabel ?? "your recurring error";
  const needsRepair = ctx.hasRecurringError || ctx.hasOpenLoss;
  const make = (strategy: StrategyId, label: string, raw: TimeBoxStep[], reason: string, introducesNewContent = false): TimeBoxPlan => {
    // Nothing to repair: drop repair steps and give their time to the longest remaining step.
    const isRepair = (k: InterventionKind) => k === "technique-intervention" || k === "mistake-recovery";
    const steps = needsRepair ? raw : raw.filter((x) => !isRepair(x.kind));
    const spare = raw.reduce((n, x) => n + x.minutes, 0) - steps.reduce((n, x) => n + x.minutes, 0);
    if (spare > 0 && steps.length) {
      const longest = steps.reduce((a, b) => (b.minutes > a.minutes ? b : a));
      longest.minutes += spare;
    }
    return { minutes, strategy, label, steps, reason, introducesNewContent, phase };
  };

  if (minutes === 5) {
    if (ctx.hasRecurringError && phase !== "final") {
      return make("recurring-error-repair", "Fix one recurring error", [step(`Repair ${rec}`, 5, "technique-intervention")], `${rec} keeps costing marks, and five minutes is enough to correct one thing.`);
    }
    if (ctx.delayedProofDue) return make("proof-check", "Quick proof check", [step("One different question to confirm a repair", 5, "delayed-proof-retest")], "A delayed check is due and fits in five minutes.");
    return make("retrieval-check", "Short retrieval check", [step("Recall from memory, no notes", 5, "retrieval-set")], "A short retrieval check keeps recall fresh without starting anything big.");
  }
  if (minutes === 10) {
    if (ctx.delayedProofDue) return make("proof-check", "Delayed proof check", [step("Two different questions on a repaired topic", 8, "delayed-proof-retest"), step("Review what you missed", 2, "retrieval-set")], "A delayed check is due; ten minutes is enough to find out if the repair held.");
    if (ctx.hasRecurringError) return make("recurring-error-repair", "Repair and check", [step(`Repair ${rec}`, 6, "technique-intervention"), step("One question that uses it", 4, "supported-question")], `${rec} is the most repeatable loss, so fix it and test it straight away.`);
    return make("retrieval-check", "Retrieval check", [step("Recall check on your highest-value topic", 10, "retrieval-set")], "No repair or proof is outstanding, so keep recall sharp.");
  }
  if (minutes === 20) {
    if (phase === "foundation" && ctx.untouchedHighValue) return make("first-pass-and-repair", "Learn, then repair", [step("First-pass lesson on an untouched high-value topic", 12, "first-pass-lesson"), step("Quick recall of it", 8, "retrieval-set")], "There is plenty of time and high-value content has not been touched.", true);
    if (phase === "application" || phase === "foundation") return make("targeted-application", "Targeted application set", [step("Short repair", 6, "technique-intervention"), step("Application questions on a weak area", 14, "independent-set")], "This stage rewards applying ideas to unfamiliar questions.");
    if (ctx.hasOpenLoss || ctx.hasRecurringError) return make("repair-and-retest", "Repair and independent retest", [step(`Repair ${rec}`, 8, "technique-intervention"), step("Retest on a different question", 12, "independent-set")], "Fix one cause, then prove it on a different question.");
    return make("final-consolidation", "Consolidate", [step("Recall your highest-value gaps", 10, "retrieval-set"), step("Delayed proof check", 10, "delayed-proof-retest")], "Late on, consolidate rather than start new areas.");
  }
  if (minutes === 45) {
    if (phase === "final") return make("final-consolidation", "Consolidate what is open", [step(`Repair ${rec}`, 10, "technique-intervention"), step("Delayed proof checks", 15, "delayed-proof-retest"), step("Recall high-value gaps", 20, "retrieval-set")], "In the final days, close open errors and proofs instead of introducing new areas.");
    if (phase === "technique" && ctx.paperAvailable) return make("timed-section", "Timed paper section", [step("Timed paper section", 30, "paper-section"), step("Correct the lost marks", 15, "mistake-recovery")], "Close to the exam, timed practice and correcting it is the best use of 45 minutes.");
    return make("mixed-sprint", "Mixed high-value sprint", [step("Repair", 10, "technique-intervention"), step("Application set", 20, "independent-set"), step("Transfer questions", 15, "transfer-set")], "A mix of repair, application and transfer in the highest-value areas.");
  }
  if (phase === "final") return make("final-consolidation", "Final consolidation", [step(`Repair ${rec}`, 15, "technique-intervention"), step("Delayed proof checks", 20, "delayed-proof-retest"), step("Recall high-value gaps", 25, "retrieval-set")], "Nothing new this close to the exam unless evidence strongly demands it.");
  if (phase === "technique" && ctx.paperAvailable) return make("autopsy-correction", "Timed section + autopsy", [step("Timed paper section", 35, "paper-section"), step("Autopsy: why marks were lost", 10, "mistake-recovery"), step("Targeted correction", 15, "technique-intervention")], "An hour allows a timed section, then working out exactly where marks went and fixing it.");
  if (phase === "foundation" && ctx.untouchedHighValue) return make("first-pass-and-repair", "Learn and repair", [step("First-pass lesson", 15, "first-pass-lesson"), step("Recall check", 10, "retrieval-set"), step("Repair open losses", 15, "mistake-recovery"), step("Application set", 20, "independent-set")], "Plenty of time left: build coverage and repair together.", true);
  return make("mixed-sprint", "Mixed high-value sprint", [step("Repair", 15, "technique-intervention"), step("Application set", 25, "independent-set"), step("Transfer questions", 20, "transfer-set")], "A longer mix of repair, application and transfer in the highest-value areas.");
}

export interface CommandCentreInput {
  daysToExam: number | null;
  examDate?: string | null;
  marksAtRisk: MarksAtRiskReport;
  patterns: readonly MistakePattern[];
  recovery: RecoveryTotals;
  missions: readonly ExamMission[];
  delayedProofDue: number;
  untouchedHighValue: ReadonlyArray<{ topicId: Id; label: string; share: number }>;
  recentPaper?: { title: string; marksLost: number; open: number } | null;
  recommendedPaper?: { id: Id; title: string } | null;
  confidenceGaps?: readonly string[];
  dueCards?: number;
}

export interface CommandCentre {
  active: boolean;
  examDate: string | null;
  daysToExam: number | null;
  phase: CountdownPhase;
  strategy: string;
  headline: string;
  marksAtRisk: number;
  weakAreas: Array<{ topicId: Id; label: string; marks: number }>;
  recurring: Array<{ label: string; marks: number }>;
  delayedProofDue: number;
  untouchedHighValue: Array<{ topicId: Id; label: string }>;
  recentPaper: CommandCentreInput["recentPaper"];
  recommendedPaper: CommandCentreInput["recommendedPaper"];
  confidenceGaps: string[];
  recovery: RecoveryTotals;
  actions: TimeBoxPlan[];
}

export function buildCommandCentre(input: CommandCentreInput): CommandCentre {
  const days = input.daysToExam;
  const g = countdownGuidance(days);
  const active = days !== null && days >= 0 && days <= COMMAND_CENTRE_DAYS;
  const recurring = input.patterns.filter((p) => p.recurring && !p.repaired && p.openMarks > 0 && p.cause !== "unclassified");
  const topRecurring = recurring[0];
  const ctx: TimeBoxContext = {
    daysToExam: days,
    hasRecurringError: recurring.length > 0,
    recurringLabel: topRecurring ? ROOT_CAUSE_LABEL[topRecurring.cause] : undefined,
    delayedProofDue: input.delayedProofDue > 0,
    hasOpenLoss: input.marksAtRisk.totalMarks > 0,
    paperAvailable: Boolean(input.recommendedPaper),
    untouchedHighValue: input.untouchedHighValue.length > 0,
    dueCards: input.dueCards ?? 0,
  };
  const weak = input.marksAtRisk.topics.slice(0, 3);
  const lead = input.missions[0];
  const headline = !active
    ? "No exam in the final stretch yet."
    : lead
      ? `Highest value: ${lead.title.toLowerCase()}, with ${lead.marksAtStake} marks at stake.`
      : input.marksAtRisk.totalMarks > 0
        ? `${input.marksAtRisk.totalMarks} marks are at risk. Start with ${weak[0]?.label ?? "your weakest topic"}.`
        : input.marksAtRisk.evidence === "none" ? "Little evidence yet. Answer some questions so Revise can find where marks are." : "Nothing open. Keep delayed checks and recall going.";
  return {
    active,
    examDate: input.examDate ?? null,
    daysToExam: days,
    phase: g.phase,
    strategy: g.strategy,
    headline,
    marksAtRisk: input.marksAtRisk.totalMarks,
    weakAreas: weak.map((t) => ({ topicId: t.topicId, label: t.label, marks: t.marks })),
    recurring: recurring.slice(0, 3).map((p) => ({ label: ROOT_CAUSE_LABEL[p.cause], marks: p.openMarks })),
    delayedProofDue: input.delayedProofDue,
    untouchedHighValue: [...input.untouchedHighValue].sort((a, b) => b.share - a.share).slice(0, 3).map(({ topicId, label }) => ({ topicId, label })),
    recentPaper: input.recentPaper ?? null,
    recommendedPaper: input.recommendedPaper ?? null,
    confidenceGaps: [...(input.confidenceGaps ?? [])],
    recovery: input.recovery,
    actions: TIME_BOXES.map((m) => timeBoxPlan(m, ctx)),
  };
}
