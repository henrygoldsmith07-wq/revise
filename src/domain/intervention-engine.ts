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

function topicHref(topicId: Id, kind: InterventionStepKind): string {
  switch (kind) {
    case "retrieve":
      return `/review?topic=${encodeURIComponent(topicId)}`;
    case "explain":
      return `/lesson?topic=${encodeURIComponent(topicId)}`;
    case "worked-example":
      return `/lesson?topic=${encodeURIComponent(topicId)}&worked=1`;
    case "misconception-repair":
      return `/tutor?topic=${encodeURIComponent(topicId)}`;
    case "guided-question":
      return `/practice?topic=${encodeURIComponent(topicId)}&guided=1`;
    case "exam-style-question":
      return `/practice?topic=${encodeURIComponent(topicId)}`;
    case "timed-question":
      return `/practice?topic=${encodeURIComponent(topicId)}&timed=1`;
    case "far-transfer-question":
      return `/practice?topic=${encodeURIComponent(topicId)}&transfer=1`;
    case "delayed-proof":
      return `/adaptive-session?topic=${encodeURIComponent(topicId)}&start=1&proof=1`;
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
      href: topicHref(topic.topicId, "worked-example"),
    });
    steps.push({
      kind: "guided-question",
      title: `Guided try: ${topicTitle}`,
      minutes: 8,
      countsAsProof: false,
      why: "A guided question with help available — practice, not proof.",
      href: topicHref(topic.topicId, "guided-question"),
    });
    steps.push({
      kind: "exam-style-question",
      title: `Unaided exam question: ${topicTitle}`,
      minutes: 10,
      countsAsProof: true,
      why: "An unseen exam question with no hints. This is the first answer that counts as evidence.",
      href: topicHref(topic.topicId, "exam-style-question"),
    });
    reasons.push("recall is strong but application is weaker");
  } else if (appWeak) {
    steps.push({
      kind: "guided-question",
      title: `Guided practice: ${topicTitle}`,
      minutes: 8,
      countsAsProof: false,
      why: "Support first, so the method is practised correctly before it is tested.",
      href: topicHref(topic.topicId, "guided-question"),
    });
    steps.push({
      kind: "exam-style-question",
      title: `Unaided exam question: ${topicTitle}`,
      minutes: 10,
      countsAsProof: true,
      why: "An unseen question with no hints checks whether the repair holds.",
      href: topicHref(topic.topicId, "exam-style-question"),
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
      href: topicHref(topic.topicId, "timed-question"),
    });
    reasons.push(`“${topic.commandWeakness}” questions cost marks`);
  }

  if (topic.proofStatus === "awaiting-proof" || topic.daysSinceSuccess !== null) {
    steps.push({
      kind: "delayed-proof",
      title: `Proof check: ${topicTitle}`,
      minutes: 8,
      countsAsProof: true,
      why: "This question is new and you have no hints. Your answer will count as evidence.",
      href: topicHref(topic.topicId, "delayed-proof"),
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
): InterventionPrescription {
  const base = prescribeIntervention(topic, topicTitle);
  return {
    ...base,
    headline: `Not yet — repair again: ${topicTitle}`,
    reason: `The earlier improvement did not transfer yet on ${topicTitle}. A shorter repair with a new example comes before the next proof check.`,
  };
}
