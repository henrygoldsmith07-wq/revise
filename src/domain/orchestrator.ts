// ---------------------------------------------------------------------------
// Adaptive session orchestrator — the tutor loop.
//
//   diagnose → attempt → scaffold → teach → practise → transfer → repair →
//   retrieve later
//
// Each recommendation becomes the *sequence* the evidence says this student
// needs next, not a fixed format. The rules:
//
//   - Unknown capability ⇒ diagnose before teaching (never teach blind).
//   - Lessons start with an attempt (try → teach → try again): the student
//     meets the question before the explanation, so teaching lands on a
//     detected gap instead of a page of prose.
//   - Teaching only covers the gap the diagnosis found.
//   - Guided practice carries a hint budget and a worked-example fade level;
//     assisted success feeds back as weaker evidence.
//   - Independent practice is untimed and unhinted — the evidence rung.
//   - Transfer is a new-context question, the only tier that moves the
//     transfer capability.
//   - Every session ends on retrieval (the overnight rule from ./daily-session).
//   - Misses stay behind for repair (./mistake-repair); they never close on
//     view.
//
// The output drives the existing session UI (DailySessionCard blocks and the
// review/practice surfaces behind them). Pure and deterministic: same evidence
// in, same plan out, offline.
// ---------------------------------------------------------------------------

import { MAX_SESSION_MINUTES, MIN_SESSION_MINUTES } from "./daily-session";
import {
  capabilityState,
  focusCapability,
  isUnknown,
  type Capability,
  type CapabilityProfile,
} from "./capability-mastery";
import { fadeLevelFor } from "./worked-examples";

export type TutorPhaseKind =
  | "diagnose"
  | "attempt"
  | "teach"
  | "guided-practice"
  | "independent-practice"
  | "transfer"
  | "exit-retrieval";

export interface TutorPhase {
  kind: TutorPhaseKind;
  minutes: number;
  label: string;
  /** Why this phase, for the student, in one line. */
  why: string;
  /** Parameters the runner needs: question counts, hint budget, fade level. */
  params: {
    questionCount?: number;
    /** 0 = no hints (the evidence rung). */
    hintBudget?: number;
    fade?: ReturnType<typeof fadeLevelFor>;
    /** The capability this phase generates evidence for. */
    evidenceFor: Capability;
  };
}

export interface TutorSessionPlan {
  topicId: string;
  topicTitle: string;
  totalMinutes: number;
  /** The capability this session exists to move. */
  focus: Capability;
  /** The evidence sentence, e.g. "Your recall is strong but application is weak." */
  evidenceLine: string | null;
  phases: TutorPhase[];
  endsOnRetrieval: true;
}

export interface TutorSessionInput {
  topicId: string;
  topicTitle: string;
  profile: CapabilityProfile;
  /** Requested session length, clamped to the 12–25 minute cap. */
  totalMinutes?: number;
  /** Unresolved misses on this topic open with repair. */
  openMistakes?: number;
}

/** How much of the budget each phase type claims when present. */
const PHASE_SHARE: Record<TutorPhaseKind, number> = {
  diagnose: 0.2,
  attempt: 0.15,
  teach: 0.2,
  "guided-practice": 0.25,
  "independent-practice": 0.3,
  transfer: 0.2,
  "exit-retrieval": 0.1,
};

const PHASE_LABELS: Record<TutorPhaseKind, string> = {
  diagnose: "Diagnose",
  attempt: "Try it first",
  teach: "Teach the gap",
  "guided-practice": "Guided practice",
  "independent-practice": "On your own",
  transfer: "Transfer",
  "exit-retrieval": "Exit retrieval",
};

const PHASE_WHY: Record<TutorPhaseKind, string> = {
  diagnose: "Find out what you actually know before teaching anything",
  attempt: "Meet the question before the explanation",
  teach: "Teach only the gap the attempt exposed",
  "guided-practice": "Support that fades as you get it",
  "independent-practice": "Unaided success is the only proof that counts",
  transfer: "Same idea, new context — that's the exam",
  "exit-retrieval": "End on a question, never on a page",
};

/** Minutes for one phase, minimum 2, from its share of the budget. */
function phaseMinutes(kind: TutorPhaseKind, total: number): number {
  return Math.max(2, Math.round(total * PHASE_SHARE[kind]));
}

/** Which kinds make up this session, in order, from the evidence. */
function phaseKinds(input: TutorSessionInput, focus: Capability): TutorPhaseKind[] {
  const state = capabilityState(input.profile[focus]);
  const kinds: TutorPhaseKind[] = [];

  if (state === "unknown") {
    // Diagnose opens the session; attempt and teach follow it — the runner
    // skips the teach block when the diagnosis shows the skill already lands.
    kinds.push("diagnose", "attempt", "teach");
  } else {
    // Try → teach → try again: the attempt exposes the gap, teaching fills it.
    kinds.push("attempt", "teach");
  }

  kinds.push("guided-practice", "independent-practice");

  // Transfer only once the focus capability is at least developing — a
  // transfer question before understanding is noise, not evidence.
  if (state === "developing" || state === "secure") kinds.push("transfer");

  kinds.push("exit-retrieval");
  return kinds;
}

export function buildTutorSession(input: TutorSessionInput): TutorSessionPlan {
  const total = Math.max(
    MIN_SESSION_MINUTES,
    Math.min(MAX_SESSION_MINUTES, input.totalMinutes ?? 18),
  );
  const focus = focusCapability(input.profile);
  const state = capabilityState(input.profile[focus]);
  const kinds = phaseKinds(input, focus);

  // Give one open mistake a repair-shaped open: the warm-up re-earns the lost
  // mark before anything new. The full repair plan lives in ./mistake-repair.
  const openMistakes = Math.max(0, input.openMistakes ?? 0);

  const phases: TutorPhase[] = kinds.map((kind) => {
    const phase: TutorPhase = {
      kind,
      minutes: phaseMinutes(kind, total),
      label: PHASE_LABELS[kind],
      why: PHASE_WHY[kind],
      params: { evidenceFor: focus },
    };

    if (kind === "diagnose") {
      phase.params.questionCount = 3;
      phase.params.hintBudget = 0;
    }
    if (kind === "attempt") {
      phase.params.questionCount = 1;
      phase.params.hintBudget = 0;
    }
    if (kind === "teach") {
      phase.minutes = openMistakes > 0 ? Math.max(2, phase.minutes - 1) : phase.minutes;
    }
    if (kind === "guided-practice") {
      phase.params.questionCount = state === "unknown" ? 2 : 3;
      phase.params.hintBudget = state === "emerging" ? 3 : 2;
      phase.params.fade = fadeLevelFor(input.profile, focus === "transfer" ? "transfer" : "application");
    }
    if (kind === "independent-practice") {
      phase.params.questionCount = 2;
      phase.params.hintBudget = 0;
    }
    if (kind === "transfer") {
      phase.params.questionCount = 1;
      phase.params.hintBudget = 0;
      phase.params.evidenceFor = "transfer";
    }
    if (kind === "exit-retrieval") {
      phase.params.questionCount = 1;
      phase.params.hintBudget = 0;
      // Exit retrieval is a recall hit on today's gains, not the focus skill.
      phase.params.evidenceFor = "recall";
    }
    return phase;
  });

  // Trim to the budget: shave the biggest non-retrieval phases first, then the
  // teach phase, so the plan always fits the 12–25 minute cap.
  const fixedSum = phases.reduce((a, p) => a + p.minutes, 0);
  let over = fixedSum - total;
  if (over > 0) {
    for (const phase of [...phases].reverse()) {
      if (over <= 0) break;
      if (phase.kind === "exit-retrieval") continue;
      const shave = Math.min(over, phase.minutes - 2);
      phase.minutes -= shave;
      over -= shave;
    }
  }

  return {
    topicId: input.topicId,
    topicTitle: input.topicTitle,
    totalMinutes: total,
    focus,
    evidenceLine: evidenceLineFor(input.profile),
    phases,
    endsOnRetrieval: true,
  };
}

/** The tutor's read of the evidence, or null while everything is unknown. */
function evidenceLineFor(profile: CapabilityProfile): string | null {
  const focusCap = focusCapability(profile);
  const others = (["recall", "explanation", "application", "transfer", "retention"] as Capability[])
    .filter((c) => c !== focusCap && !isUnknown(profile[c]))
    .map((c) => ({ capability: c, score: profile[c].score ?? 0 }));
  const focusScore = profile[focusCap].score;
  if (focusScore === null || !others.length) return null;
  const strongest = others.reduce((a, b) => (b.score > a.score ? b : a));
  if (strongest.score < 0.7) return null;
  const labels: Record<Capability, string> = {
    recall: "recall",
    explanation: "explanation",
    application: "application",
    transfer: "transfer",
    retention: "retention",
  };
  return `Your ${labels[strongest.capability]} is strong but ${labels[focusCap]} is weak.`;
}
