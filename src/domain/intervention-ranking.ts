// ---------------------------------------------------------------------------
// Intervention ranking — choose the best *kind* of revision, not just a topic.
//
// Each eligible intervention gets an expected gain (percentage points of the
// qualification it could plausibly recover) divided by its minutes. Gain comes
// from what the exam is worth, how big the learner's gap is, and how well the
// intervention type fits that gap. Priors are policy constants, not learned
// effects; evidence confidence discounts everything except interventions whose
// job is to create evidence. Interventions with no trusted, unseen supply are
// ineligible rather than silently repeating familiar questions.
// ---------------------------------------------------------------------------

import type { Id } from "./types";

export type InterventionKind =
  | "first-pass-lesson"
  | "retrieval-set"
  | "spaced-repetition"
  | "prerequisite-repair"
  | "misconception-correction"
  | "technique-intervention"
  | "supported-question"
  | "independent-set"
  | "transfer-set"
  | "mistake-recovery"
  | "timed-sprint"
  | "paper-section"
  | "full-paper"
  | "delayed-proof-retest";

export type ExamPhase = "early" | "mid" | "late" | "none" | "past";

export interface InterventionContext {
  topicId: Id;
  subjectId: Id;
  topicTitle: string;
  paperName?: string;
  /** Share of the qualification this topic sits under (paper weight × topic share), 0–1. */
  qualificationShare: number;
  daysToExam: number | null;
  /** Null = unknown; unknown is never treated as zero or full. */
  mastery: number | null;
  recall: number | null;
  application: number | null;
  transferProven: boolean;
  /** Trusted attempts feeding the figures above. */
  evidenceAttempts: number;
  openMistakeMarks: number;
  recurringMistakes: number;
  repeatedMisconception: boolean;
  repeatedTechniqueError: boolean;
  dueCards: number;
  /** 0–1 chance recently-learned material has been forgotten. */
  forgettingRisk: number;
  /** Trusted, unseen-family questions available per depth. */
  unseen: { recall: number; application: number; transfer: number };
  prerequisiteWeak: { topicId: Id; title: string } | null;
  delayedProofDue: boolean;
  /** 0–1 fatigue from recent study load. */
  fatigue: number;
  /** Whether timed paper material is available for this topic's paper. */
  paperMaterial: boolean;
}

export interface RankedIntervention {
  topicId: Id;
  subjectId: Id;
  kind: InterventionKind;
  minutes: number;
  eligible: boolean;
  /** Why an ineligible option was rejected. */
  blockedBy?: string;
  /** Expected gain per minute; internal ordering only, never shown. */
  valuePerMinute: number;
}

export const INTERVENTION_MINUTES: Record<InterventionKind, number> = {
  "first-pass-lesson": 12,
  "retrieval-set": 6,
  "spaced-repetition": 5,
  "prerequisite-repair": 10,
  "misconception-correction": 8,
  "technique-intervention": 10,
  "supported-question": 8,
  "independent-set": 15,
  "transfer-set": 12,
  "mistake-recovery": 10,
  "timed-sprint": 15,
  "paper-section": 35,
  "full-paper": 90,
  "delayed-proof-retest": 8,
};

export const INTERVENTION_LABEL: Record<InterventionKind, string> = {
  "first-pass-lesson": "first-pass lesson",
  "retrieval-set": "recall session",
  "spaced-repetition": "spaced-repetition review",
  "prerequisite-repair": "prerequisite repair",
  "misconception-correction": "misconception repair",
  "technique-intervention": "exam-technique session",
  "supported-question": "guided question session",
  "independent-set": "application session",
  "transfer-set": "unfamiliar-context session",
  "mistake-recovery": "mistake recovery session",
  "timed-sprint": "timed sprint",
  "paper-section": "paper section",
  "full-paper": "full paper",
  "delayed-proof-retest": "delayed proof check",
};

const ORDER = Object.keys(INTERVENTION_MINUTES) as InterventionKind[];
const LOW = 0.6;
const SECURE = 0.75;

export function examPhase(days: number | null): ExamPhase {
  if (days === null) return "none";
  if (days < 0) return "past";
  if (days <= 21) return "late";
  if (days <= 60) return "mid";
  return "early";
}

function urgency(phase: ExamPhase): number {
  return { past: 0.2, none: 1, early: 1, mid: 1.15, late: 1.5 }[phase];
}

/** Gap, in percentage points of the qualification, with unknown mastery treated as a half-gap. */
export function gapPoints(ctx: InterventionContext): number {
  const mastery = ctx.mastery ?? 0.5;
  return Math.max(0, ctx.qualificationShare * 100 * (1 - mastery));
}

function confidence(ctx: InterventionContext): number {
  return Math.min(1, ctx.evidenceAttempts / 8);
}

interface Fit {
  eligible: boolean;
  blockedBy?: string;
  /** Fraction of the gap this intervention can plausibly close. */
  fraction: number;
  /** True when the intervention exists mainly to produce evidence. */
  evidenceBuilding?: boolean;
}

function fit(kind: InterventionKind, ctx: InterventionContext, phase: ExamPhase): Fit {
  const { recall, application } = ctx;
  const recallOk = recall !== null && recall >= LOW;
  const applicationLow = application === null || application < SECURE;
  const none = (blockedBy: string): Fit => ({ eligible: false, blockedBy, fraction: 0 });
  switch (kind) {
    case "first-pass-lesson":
      return ctx.evidenceAttempts === 0 && recall === null ? { eligible: true, fraction: 0.5, evidenceBuilding: true } : none("already has evidence");
    case "retrieval-set":
      return ctx.dueCards > 0 || (recall !== null && recall < LOW)
        ? { eligible: true, fraction: 0.3 + 0.2 * ctx.forgettingRisk, evidenceBuilding: true } : none("recall is not the gap");
    case "spaced-repetition":
      return ctx.dueCards > 0 ? { eligible: true, fraction: 0.15 + 0.25 * ctx.forgettingRisk, evidenceBuilding: true } : none("no cards due");
    case "prerequisite-repair":
      return ctx.prerequisiteWeak ? { eligible: true, fraction: 0.55 } : none("no weak prerequisite");
    case "misconception-correction":
      return ctx.repeatedMisconception ? { eligible: true, fraction: 0.5 } : none("no repeated misconception");
    case "technique-intervention":
      return ctx.repeatedTechniqueError ? { eligible: true, fraction: 0.45 } : none("no repeated technique error");
    case "supported-question":
      return recall !== null && !recallOk && ctx.unseen.application > 0 ? { eligible: true, fraction: 0.25 } :
        application === null && recallOk && ctx.unseen.application > 0 ? { eligible: true, fraction: 0.3, evidenceBuilding: true } : none("not a supported-practice case");
    case "independent-set":
      if (!(recallOk || recall === null) || !applicationLow) return none("application is not the gap");
      return ctx.unseen.application >= 2 ? { eligible: true, fraction: 0.45, evidenceBuilding: application === null } : none("fewer than two unseen application questions");
    case "transfer-set":
      if (ctx.transferProven) return none("transfer already proven");
      if (application === null || application < 0.65) return none("application not yet secure enough to transfer");
      return ctx.unseen.transfer > 0 ? { eligible: true, fraction: 0.4, evidenceBuilding: true } : none("no unseen unfamiliar-context question");
    case "mistake-recovery":
      return ctx.openMistakeMarks > 0
        ? { eligible: true, fraction: Math.min(0.7, 0.3 + ctx.openMistakeMarks / Math.max(1, gapPoints(ctx) * 5)) } : none("no open mistakes");
    case "timed-sprint":
      return phase === "late" && application !== null && application >= 0.55 && ctx.unseen.application > 0 ? { eligible: true, fraction: 0.3, evidenceBuilding: true } : none("not late enough or application too weak");
    case "paper-section":
      return phase === "late" && ctx.paperMaterial && ctx.evidenceAttempts >= 8 && ctx.daysToExam !== null && ctx.daysToExam <= 21
        ? { eligible: true, fraction: 0.3, evidenceBuilding: true } : none("needs paper material, broad evidence and a close exam");
    case "full-paper":
      return phase === "late" && ctx.paperMaterial && ctx.evidenceAttempts >= 12 && ctx.daysToExam !== null && ctx.daysToExam <= 10
        ? { eligible: true, fraction: 0.35, evidenceBuilding: true } : none("needs a paper within 10 days and broad evidence");
    case "delayed-proof-retest":
      return ctx.delayedProofDue && ctx.unseen.application + ctx.unseen.transfer > 0 ? { eligible: true, fraction: 0.35, evidenceBuilding: true } : none("no proof test due");
  }
}

export function rankInterventions(contexts: readonly InterventionContext[], options: { maxMinutes?: number } = {}): RankedIntervention[] {
  const out: RankedIntervention[] = [];
  for (const ctx of contexts) {
    const phase = examPhase(ctx.daysToExam);
    const gap = gapPoints(ctx);
    for (const kind of ORDER) {
      const minutes = INTERVENTION_MINUTES[kind];
      const f = fit(kind, ctx, phase);
      const overBudget = options.maxMinutes !== undefined && minutes > options.maxMinutes;
      const eligible = f.eligible && !overBudget;
      let gain = gap * f.fraction * urgency(phase);
      if (!f.evidenceBuilding) gain *= 0.6 + 0.4 * confidence(ctx);
      if (phase === "late" && kind === "first-pass-lesson") gain *= 0.7;
      if (minutes > 20) gain *= 1 - 0.4 * ctx.fatigue;
      out.push({
        topicId: ctx.topicId,
        subjectId: ctx.subjectId,
        kind,
        minutes,
        eligible,
        ...(eligible ? {} : { blockedBy: overBudget ? "longer than the time available" : f.blockedBy }),
        valuePerMinute: eligible ? Math.round((gain / minutes) * 10_000) / 10_000 : 0,
      });
    }
  }
  return out
    .filter((row) => row.eligible)
    .sort((a, b) => b.valuePerMinute - a.valuePerMinute || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.topicId.localeCompare(b.topicId));
}

export interface InterventionExplanation {
  headline: string;
  lines: string[];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Student-facing reasons only: plain counts and rounded percentages, no scores. */
export function explainIntervention(ctx: InterventionContext, pick: Pick<RankedIntervention, "kind" | "minutes">): InterventionExplanation {
  const lines: string[] = [];
  if (ctx.qualificationShare > 0) lines.push(`${ctx.topicTitle} is about ${Math.max(1, Math.round(ctx.qualificationShare * 100))}% of the qualification${ctx.paperName ? `, under ${ctx.paperName}` : ""}.`);
  if (ctx.recall === null && ctx.application === null) lines.push("There is not enough evidence yet to say how secure this is.");
  else {
    if (ctx.recall !== null && ctx.application !== null && ctx.recall >= LOW && ctx.application < LOW) lines.push(`Recall is reasonably secure (${pct(ctx.recall)}), but application is weak (${pct(ctx.application)}).`);
    else {
      if (ctx.recall !== null) lines.push(`Recall is ${pct(ctx.recall)} on checked answers.`);
      if (ctx.application !== null) lines.push(`Application is ${pct(ctx.application)} on checked answers.`);
    }
  }
  if (ctx.recurringMistakes > 0) lines.push(`${ctx.recurringMistakes === 1 ? "One mistake has" : `${ctx.recurringMistakes} mistakes have`} repeated across separate questions.`);
  else if (ctx.openMistakeMarks > 0) lines.push(`${Math.round(ctx.openMistakeMarks)} marks lost here are still unrecovered.`);
  if (ctx.prerequisiteWeak) lines.push(`${ctx.prerequisiteWeak.title} underpins this and is shaky.`);
  if (!ctx.transferProven && ctx.application !== null && ctx.application >= 0.65) lines.push("You have not yet succeeded on an unfamiliar-context question here.");
  if (ctx.dueCards > 0) lines.push(`${ctx.dueCards} card${ctx.dueCards === 1 ? " is" : "s are"} due for review.`);
  if (ctx.daysToExam !== null && ctx.daysToExam >= 0) lines.push(`The exam is in ${ctx.daysToExam} day${ctx.daysToExam === 1 ? "" : "s"}.`);
  else if (ctx.daysToExam === null) lines.push("No exam date is set, so timing is not a factor.");
  return { headline: `${pick.minutes}-minute ${ctx.topicTitle.toLowerCase()} ${INTERVENTION_LABEL[pick.kind]}`, lines };
}
