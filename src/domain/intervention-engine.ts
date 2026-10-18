// ---------------------------------------------------------------------------
// Explicit intervention engine.
//
// Builds on mistakes, remediation, tutor grounding and recommendation
// systems. For each significant weakness the engine prescribes an ordered
// repair path that depends on the actual failure mode — not the same
// workflow for every weakness.
//
// Failure modes:
// - recall gap      → retrieve + explain
// - application gap → explain + worked example + guided + unseen exam question
// - misconception   → misconception repair before practice
// - technique       → exam-technique + timed question
// - transfer gap    → far-transfer (unfamiliar context)
// - forgetting      → revisit (spaced retrieval)
// - proof due       → delayed proof (unaided, unseen, delayed)
//
// Help never counts as proof: guided steps are marked `countsAsProof: false`.
// Only independent, unseen, delayed success counts (see proof-of-improvement).
// ---------------------------------------------------------------------------

import type { Id } from "./types";
import type { TopicIntelligence } from "./learner-intelligence";

export type InterventionStepKind =
  | "retrieve"
  | "explain"
  | "worked-example"
  | "misconception-repair"
  | "guided-question"
  | "exam-style-question"
  | "timed-question"
  | "far-transfer-question"
  | "delayed-proof"
  | "revisit";

export interface InterventionStep {
  kind: InterventionStepKind;
  title: string;
  minutes: number;
  /** Guided/helped steps never count as proof. */
  countsAsProof: boolean;
  why: string;
  href: string;
}

export interface InterventionPrescription {
  topicId: Id;
  subjectId: Id;
  steps: InterventionStep[];
  totalMinutes: number;
  /** One sentence shown on Today / Repair cards. */
  headline: string;
  /** Longer evidence-backed reason for "Why this?". */
  reason: string;
  proofRequired: boolean;
}

export const INTERVENTION_STEP_LABEL: Record<InterventionStepKind, string> = {
  retrieve: "Quick recall",
  explain: "Targeted explanation",
  "worked-example": "Worked example",
  "misconception-repair": "Fix the misconception",
  "guided-question": "Guided application",
  "exam-style-question": "Unseen exam question",
  "timed-question": "Timed question",
  "far-transfer-question": "Unfamiliar-context question",
  "delayed-proof": "Proof check",
  revisit: "Revisit",
};

/**
 * Each practice link carries the mode its label promises, and /practice
 * honours it (src/domain/practice-step-mode.ts): guided=1 opens the question
 * with its steps shown, unaided=1 and timed=1 remove hints, timed=1 adds an
 * exam-pace clock and command= puts questions using that verb first.
 * worked=1 shows one question worked through, then a fresh one to try (it
 * opened the topic's lesson before, the same page as "Targeted explanation").
 * minutes= is the step's stated minutes, so the step's questions fit them at
 * exam pace instead of a flat three.
 */
function practiceHref(topicId: Id, flag: string, minutes: number | undefined, extra = ""): string {
  return `/practice?topic=${encodeURIComponent(topicId)}&${flag}=1${extra}${minutes ? `&minutes=${minutes}` : ""}`;
}

/**
 * The standalone proof check (`ProofCheckMode` on /practice?proof=…): the
 * same reviewed, unseen, no-hint questions as a mission's delayed-proof
 * stage. Same shape as `proofHref` in mission-session (not imported, to keep
 * this module's imports minimal; tests/proof-links.test.ts pins them equal).
 * Until the thirtieth pass this step linked to /adaptive-session with a proof=1 flag,
 * a flag the page ignored, so it ran an ordinary adaptive session.
 */
function proofCheckHref(topicId: Id, subjectId?: Id): string {
  return `/practice?proof=${encodeURIComponent(topicId)}${subjectId ? `&subject=${encodeURIComponent(subjectId)}` : ""}`;
}

function topicHref(topicId: Id, kind: InterventionStepKind, command?: string | null, minutes?: number, subjectId?: Id): string {
  switch (kind) {
    case "retrieve":
      return `/review?topic=${encodeURIComponent(topicId)}`;
    case "explain":
      return `/lesson?topic=${encodeURIComponent(topicId)}`;
    case "worked-example":
      return practiceHref(topicId, "worked", minutes);
    case "misconception-repair":
      return `/tutor?topic=${encodeURIComponent(topicId)}`;
    case "guided-question":
      return practiceHref(topicId, "guided", minutes);
    case "exam-style-question":
      return practiceHref(topicId, "unaided", minutes);
    case "timed-question":
      return practiceHref(topicId, "timed", minutes, command ? `&command=${encodeURIComponent(command)}` : "");
    case "far-transfer-question":
      // Never prescribed: prescribeIntervention emits no far-transfer step,
      // and /practice does not read transfer=1. The real unfamiliar-context
      // check is the delayed far-transfer retest (/practice?retest=…).
      // tests/practice-step-mode.test.ts fails if a plan starts emitting it.
      return `/practice?topic=${encodeURIComponent(topicId)}&transfer=1`;
    case "delayed-proof":
      return proofCheckHref(topicId, subjectId);
    case "revisit":
      return `/review?topic=${encodeURIComponent(topicId)}`;
  }
}

/**
 * Prescribe an ordered repair path for one topic. Deterministic: the same
 * intelligence always yields the same steps in the same order.
 */
export function prescribeIntervention(
  topic: TopicIntelligence,
  topicTitle: string,
  options: PrescribeOptions = {},
): InterventionPrescription {
  const prescription = prescribeFromEvidence(topic, topicTitle);
  return options.reviewedQuestions === 0 ? practiceOnlyPrescription(prescription) : prescription;
}

/** What the caller knows about the topic's question supply. */
export interface PrescribeOptions {
  /**
   * Questions on this topic that can carry learner evidence
   * (`learnerEvidenceTrusted`: a flagship question with two-check teacher
   * review). When 0, no step can count as proof whatever the learner does,
   * so the plan must not say an unaided or timed answer "counts as
   * evidence". Omitted when the caller does not know; the plan then keeps
   * the generic wording, which elsewhere is hedged "where reviewed
   * questions exist".
   */
  reviewedQuestions?: number;
}

/**
 * Wording for the steps that would count as proof on reviewed questions,
 * when the topic has none. Each still says what the step does (no hints,
 * timed, after a delay) and that the mark is recorded; none promises proof.
 * The " (practice, not proof)" suffix the panels add follows each.
 */
const PRACTICE_ONLY_WHY: Partial<Record<InterventionStepKind, string>> = {
  "exam-style-question": "An unseen exam question with no hints, so the mark shows what you can do on your own. No question on this topic has been checked by a teacher yet, so it is recorded as practice",
  "timed-question": "One timed answer with no hints checks the technique under pressure. No question on this topic has been checked by a teacher yet, so it is recorded as practice",
  "delayed-proof": "A new question after a delay, with no hints, checks whether it stuck. No question on this topic has been checked by a teacher yet, so it is recorded as practice",
};

function practiceOnlyPrescription(prescription: InterventionPrescription): InterventionPrescription {
  const steps = prescription.steps.map((step) =>
    step.countsAsProof ? { ...step, countsAsProof: false, why: PRACTICE_ONLY_WHY[step.kind] ?? step.why } : step);
  return {
    ...prescription,
    steps,
    headline: prescription.headline.startsWith("Proof check: ")
      ? `Check it held: ${prescription.headline.slice("Proof check: ".length)}`
      : prescription.headline,
    proofRequired: false,
  };
}

/**
 * The label a panel shows for a step. A delayed check that cannot prove
 * anything (no reviewed questions on the topic) is not called a "Proof check".
 */
export function interventionStepLabel(step: Pick<InterventionStep, "kind" | "countsAsProof">): string {
  if (step.kind === "delayed-proof" && !step.countsAsProof) return "Delayed check";
  return INTERVENTION_STEP_LABEL[step.kind];
}

function prescribeFromEvidence(
  topic: TopicIntelligence,
  topicTitle: string,
): InterventionPrescription {
  const steps: InterventionStep[] = [];
  const reasons: string[] = [];

  if (topic.evidence === "no-evidence") {
    steps.push({
      kind: "retrieve",
      title: `First recall check: ${topicTitle}`,
      minutes: 6,
      countsAsProof: false,
      why: "There are no checked answers here yet, so the first step creates evidence rather than judging ability.",
      href: topicHref(topic.topicId, "retrieve"),
    });
    return finish(topic, topicTitle, steps, [
      "No checked answers yet — this first check creates the evidence later steps need.",
    ]);
  }

  const recallWeak = topic.recall !== null && topic.recall < 0.6;
  const appWeak =
    topic.application === null ||
    topic.application < 0.65 ||
    topic.applicationGap !== null;

  if (recallWeak) {
    steps.push({
      kind: "retrieve",
      title: `Recall: ${topicTitle}`,
      minutes: 6,
      countsAsProof: false,
      why: "Recall is not yet secure, so application practice would waste the gap.",
      href: topicHref(topic.topicId, "retrieve"),
    });
    steps.push({
      kind: "explain",
      title: `Understand: ${topicTitle}`,
      minutes: 8,
      countsAsProof: false,
      why: "A short targeted explanation repairs the missing foundation before practice.",
      href: topicHref(topic.topicId, "explain"),
    });
    reasons.push("recall is not yet secure");
  }

  if (topic.recurringMistakes > 0) {
    steps.push({
      kind: "misconception-repair",
      title: `Fix the repeat: ${topicTitle}`,
      minutes: 8,
      countsAsProof: false,
      why: `The same wrong idea has cost marks more than once here, so it is repaired directly before new questions.`,
      href: topicHref(topic.topicId, "misconception-repair"),
    });
    reasons.push("the same mistake has repeated");
  }

  if (topic.applicationGap !== null) {
    // The signature path: knows the fact, cannot yet apply it.
    if (!recallWeak) {
      steps.push({
        kind: "explain",
        title: `Why it works: ${topicTitle}`,
        minutes: 5,
        countsAsProof: false,
        why: "You remember the definition but struggle when the question changes context, so this explains the underlying mechanism once.",
        href: topicHref(topic.topicId, "explain"),
      });
    }
    steps.push({
      kind: "worked-example",
      title: `Worked example: ${topicTitle}`,
      minutes: 7,
      countsAsProof: false,
      why: "One fully worked application shows how the fact turns into marks.",
      href: topicHref(topic.topicId, "worked-example", null, 7),
    });
    steps.push({
      kind: "guided-question",
      title: `Guided try: ${topicTitle}`,
      minutes: 8,
      countsAsProof: false,
      why: "A guided question with help available — practice, not proof.",
      href: topicHref(topic.topicId, "guided-question", null, 8),
    });
    steps.push({
      kind: "exam-style-question",
      title: `Unaided exam question: ${topicTitle}`,
      minutes: 10,
      countsAsProof: true,
      why: "An unseen exam question with no hints. This is the first answer that can count as evidence.",
      href: topicHref(topic.topicId, "exam-style-question", null, 10),
    });
    reasons.push("recall is strong but application is weaker");
  } else if (appWeak) {
    steps.push({
      kind: "guided-question",
      title: `Guided practice: ${topicTitle}`,
      minutes: 8,
      countsAsProof: false,
      why: "Support first, so the method is practised correctly before it is tested.",
      href: topicHref(topic.topicId, "guided-question", null, 8),
    });
    steps.push({
      kind: "exam-style-question",
      title: `Unaided exam question: ${topicTitle}`,
      minutes: 10,
      countsAsProof: true,
      why: "An unseen question with no hints checks whether the repair holds.",
      href: topicHref(topic.topicId, "exam-style-question", null, 10),
    });
    if (!recallWeak && topic.recurringMistakes === 0) reasons.push("application is weaker than recall");
  }

  if (topic.commandWeakness) {
    steps.push({
      kind: "timed-question",
      title: `Command-word check: “${topic.commandWeakness}”`,
      minutes: 8,
      countsAsProof: true,
      why: `“${topic.commandWeakness}” questions cost the most here, so one timed answer checks the technique under pressure.`,
      href: topicHref(topic.topicId, "timed-question", topic.commandWeakness, 8),
    });
    reasons.push(`“${topic.commandWeakness}” questions cost marks`);
  }

  if (topic.proofStatus === "awaiting-proof" || topic.daysSinceSuccess !== null) {
    steps.push({
      kind: "delayed-proof",
      title: `Proof check: ${topicTitle}`,
      minutes: 8,
      countsAsProof: true,
      why: "This question is new and you have no hints, so on a teacher-reviewed question your answer counts as evidence.",
      href: topicHref(topic.topicId, "delayed-proof", null, undefined, topic.subjectId),
    });
  }

  if (!steps.length) {
    steps.push({
      kind: "revisit",
      title: `Keep it fresh: ${topicTitle}`,
      minutes: 5,
      countsAsProof: false,
      why: "Nothing is urgently weak here; a short revisit protects what is learned.",
      href: topicHref(topic.topicId, "revisit"),
    });
    reasons.push("this is holding well");
  }

  if (topic.evidence === "regressed") {
    reasons.push("earlier improvement did not transfer yet");
  }

  return finish(topic, topicTitle, steps, reasons);
}

function finish(
  topic: TopicIntelligence,
  topicTitle: string,
  steps: InterventionStep[],
  reasons: string[],
): InterventionPrescription {
  const totalMinutes = steps.reduce((s, x) => s + x.minutes, 0);
  const first = steps[0]?.kind ?? "revisit";
  const headline =
    first === "delayed-proof"
      ? `Proof check: ${topicTitle}`
      : topic.applicationGap !== null
        ? `You remember it — now make it score: ${topicTitle}`
        : `Repair: ${topicTitle}`;
  const reason =
    reasons.length > 0
      ? `${topicTitle}: ${reasons.join("; ")}${topic.marksLost > 0 ? `; ${topic.marksLost} marks still open` : ""}.`
      : topic.marksLost > 0
        ? `${topicTitle}: ${topic.marksLost} marks still open.`
        : `${topicTitle}: chosen from your recent answers.`;
  return {
    topicId: topic.topicId,
    subjectId: topic.subjectId,
    steps,
    totalMinutes,
    headline,
    reason,
    proofRequired: steps.some((s) => s.kind === "delayed-proof" || (s.countsAsProof && s.kind === "exam-style-question")),
  };
}

/** Failed proof triggers another appropriate intervention, never punishment. */
export function prescriptionAfterFailedProof(
  topic: TopicIntelligence,
  topicTitle: string,
  options: PrescribeOptions = {},
): InterventionPrescription {
  const base = prescribeIntervention(topic, topicTitle, options);
  return {
    ...base,
    headline: `Not yet — repair again: ${topicTitle}`,
    reason: `The earlier improvement did not transfer yet on ${topicTitle}. A shorter repair with a new example comes before the next proof check.`,
  };
}
