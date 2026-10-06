// ---------------------------------------------------------------------------
// Study pathway — how Revise will run a session, in the learner's words.
//
// The adaptive planner already chooses and orders the steps from evidence
// (buildAdaptiveSession / replanAdaptiveSession). This only names the
// sequence it chose, so Today and the session intro can say "Revise knows how
// you should study this" instead of offering a menu. It never reorders,
// adds or removes a step.
// Pure domain: no React, no storage.
// ---------------------------------------------------------------------------

import { STEP_LABELS, type AdaptiveSessionPlan, type AdaptiveStepKind } from "./adaptive-contract";

export type PathwayKind = "repair" | "foundation" | "learn" | "stretch" | "practise" | "recall";

/** The planner's own step labels, so the intro, Today and the runner use one vocabulary. */
export const PATHWAY_STEP_LABEL: Record<AdaptiveStepKind, string> = STEP_LABELS;

const HEADLINE: Record<PathwayKind, string> = {
  repair: "Fix the mistake, then prove it on a fresh question",
  foundation: "Fix the foundation first, then come back to this",
  learn: "Learn it, recall it, then try a question",
  stretch: "Use what you know on questions you have not seen",
  practise: "Exam-style questions, with support only if you need it",
  recall: "Bring it back to mind before it fades",
};

const WHY: Record<PathwayKind, string> = {
  repair: "Your recent answers show a specific mistake, so the session starts by fixing it.",
  foundation: "An earlier topic this depends on looks shaky, so it comes first.",
  learn: "There is little evidence on this yet, so the session teaches before it tests.",
  stretch: "You do well on familiar questions; the next proof is a question you have not seen.",
  practise: "You know the basics; marks now come from applying them to exam questions.",
  recall: "Some of what you learned is due to be recalled, which is when it is cheapest to keep.",
};

export interface StudyPathway {
  kind: PathwayKind;
  headline: string;
  why: string;
  /** Distinct steps in the order the planner chose, consecutive repeats merged. */
  steps: string[];
  /** True when the plan ends by scheduling a later check. */
  endsWithDelayedCheck: boolean;
}

export function describePathway(plan: Pick<AdaptiveSessionPlan, "steps">): StudyPathway {
  const kinds = plan.steps.map((s) => s.kind);
  const has = (k: AdaptiveStepKind) => kinds.includes(k);
  const kind: PathwayKind = has("prerequisite-repair") ? "foundation"
    : has("misconception-repair") ? "repair"
    : has("explanation") || plan.steps.some((s) => s.teaching) ? "learn"
    : has("transfer") ? "stretch"
    : has("supported-practice") || has("independent-application") ? "practise"
    : "recall";
  const steps: string[] = [];
  for (const k of kinds) {
    const label = PATHWAY_STEP_LABEL[k];
    if (steps[steps.length - 1] !== label) steps.push(label);
  }
  return { kind, headline: HEADLINE[kind], why: WHY[kind], steps, endsWithDelayedCheck: kinds[kinds.length - 1] === "delayed-retrieval" };
}
