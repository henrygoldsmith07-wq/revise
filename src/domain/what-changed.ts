// ---------------------------------------------------------------------------
// "What changed?" — the learner-facing result of a meaningful session.
//
//   Before        the evidence the plan was built on (focus + its state)
//   This session  what the run's own step records show, rung by rung
//   Chain         Problem → Intervention → Immediate → Different question
//                 → Delayed → Outcome, with the honest status of each
//   Next proof    when a delayed check on a new question will count
//
// Reads only: the plan (adaptive-contract), the executed step records, the
// topic's proof-ledger row and proof lifecycle after the session. It reuses
// the step results the runner already classified (passed-independent /
// passed-assisted / missed) and the ledger's provableFrom date. Same-session
// success is never reported as proof; only the ledger can say "proven".
// Pure domain: no React, no storage, no clock.
// ---------------------------------------------------------------------------

import type { AdaptiveSessionPlan, AdaptiveStepKind, AdaptiveStepRecord } from "./adaptive-contract";
import type { CapabilityState } from "./capability-mastery";
import type { TopicLifecycle } from "./proof-lifecycle";
import { shortDate, type TopicProof } from "./proof-of-improvement";
import { describePathway } from "./study-pathway";

export interface WhatChangedLine { ok: boolean; text: string }

export type ChainStatus = "done" | "missed" | "pending" | "not-applicable";

export interface WhatChangedChainStep { stage: "problem" | "intervention" | "immediate" | "different" | "delayed" | "outcome"; label: string; status: ChainStatus; detail: string }

export type WhatChangedVerdict = "no-evidence" | "needs-repair" | "practised" | "fresh-success" | "new-context-held" | "proven";

export interface WhatChanged {
  verdict: WhatChangedVerdict;
  headline: string;
  before: { focus: string; state: string };
  thisSession: WhatChangedLine[];
  chain: WhatChangedChainStep[];
  nextProof: string;
  /** Shown whenever the session had a success: one session is never proof. */
  caveat: string | null;
}

const FOCUS_LABEL: Record<string, string> = {
  recall: "Remembering it",
  explanation: "Explaining it",
  application: "Using it in exam questions",
  transfer: "Using it on new kinds of question",
  retention: "Keeping it over time",
};

const STATE_LABEL: Record<CapabilityState, string> = {
  unknown: "Not measured yet",
  emerging: "Weak evidence",
  developing: "Developing",
  secure: "Secure",
};

const QUESTION_KINDS = new Set<AdaptiveStepKind>(["supported-practice", "independent-application", "transfer", "misconception-repair", "prerequisite-repair"]);

function lineFor(record: AdaptiveStepRecord): WhatChangedLine | null {
  const independent = record.result === "passed-independent";
  const assisted = record.result === "passed-assisted";
  const missed = record.result === "missed" || record.result === "gave-up";
  switch (record.kind) {
    case "overdue-retrieval":
      if (record.result === "viewed" || record.result === "scheduled") return null;
      return missed || (record.missedItemIds?.length ?? 0) > 0
        ? { ok: false, text: "Some key ideas did not come back from memory; they will come back sooner." }
        : { ok: true, text: "Recalled the key ideas from memory" };
    case "explanation":
      return record.result === "viewed" ? { ok: true, text: "Went through a short explanation of the gap" } : null;
    case "supported-practice":
      return independent ? { ok: true, text: "Solved a guided question without needing the hints" }
        : assisted ? { ok: true, text: "Solved a guided question with a hint (weaker evidence)" }
        : missed ? { ok: false, text: "Dropped marks on the guided question" } : null;
    case "independent-application":
      return independent ? { ok: true, text: "Solved a fresh exam-style question without help" }
        : assisted ? { ok: true, text: "Solved an exam-style question, but with help" }
        : missed ? { ok: false, text: "Dropped marks on a fresh exam-style question" } : null;
    case "transfer":
      return independent ? { ok: true, text: "Used it on a question in a new context" }
        : missed ? { ok: false, text: "Did not carry over to a question in a new context yet" }
        : assisted ? { ok: true, text: "Managed a new-context question with help" } : null;
    case "misconception-repair":
      return record.resolvedMistakeId ? { ok: true, text: "Re-earned marks you had lost earlier" }
        : independent || assisted ? { ok: true, text: "Worked through the mistake" }
        : missed ? { ok: false, text: "The mistake is not fixed yet" } : null;
    case "prerequisite-repair":
      return independent || assisted ? { ok: true, text: "Shored up an earlier topic this depends on" }
        : missed ? { ok: false, text: "The earlier topic still needs work" } : null;
    case "delayed-retrieval":
      return record.result === "scheduled" ? { ok: true, text: "Booked a check on a new question for later" } : null;
  }
}

export function buildWhatChanged(input: {
  plan: AdaptiveSessionPlan;
  completed: readonly AdaptiveStepRecord[];
  /** Ledger row for the topic, recomputed after the session's answers landed. */
  proof?: Pick<TopicProof, "status" | "provableFrom" | "proofDue" | "illusory"> | null;
  lifecycle?: Pick<TopicLifecycle, "stage" | "label" | "claim"> | null;
}): WhatChanged {
  const { plan, completed } = input;
  const ev = plan.evidence;
  const before = {
    focus: FOCUS_LABEL[ev.focus] ?? "This topic",
    state: ev.attempts === 0 && ev.focusState === "unknown" ? "No answers yet: unknown, not weak" : STATE_LABEL[ev.focusState],
  };
  const thisSession = completed.map(lineFor).filter((l): l is WhatChangedLine => l !== null);
  const questions = completed.filter((r) => QUESTION_KINDS.has(r.kind));
  const independent = questions.filter((r) => r.result === "passed-independent");
  const missed = questions.filter((r) => r.result === "missed" || r.result === "gave-up");
  const transferPlanned = plan.steps.some((s) => s.kind === "transfer") || completed.some((r) => r.kind === "transfer");
  const transferRecords = completed.filter((r) => r.kind === "transfer");
  const transferHeld = transferRecords.some((r) => r.result === "passed-independent");
  const freshHeld = independent.some((r) => r.kind === "independent-application" || r.kind === "transfer");
  const proven = input.lifecycle?.stage === "proven" || input.lifecycle?.stage === "holding";

  const verdict: WhatChangedVerdict = proven ? "proven"
    : questions.length === 0 && thisSession.length === 0 ? "no-evidence"
    : missed.length > independent.length ? "needs-repair"
    : transferHeld ? "new-context-held"
    : freshHeld ? "fresh-success"
    : "practised";

  const headline = {
    proven: "Proven: this has held on new questions after a delay",
    "no-evidence": "Recorded. No new evidence this time",
    "needs-repair": "Useful: it showed exactly what to fix",
    practised: "Good practice. Not proof yet",
    "fresh-success": "Progress on a fresh question. Now it has to last",
    "new-context-held": "It carried over to a new context. Now it has to last",
  }[verdict];

  let nextProof: string;
  if (proven) nextProof = "Keep it: a short recall check when it is next due.";
  else if (input.proof?.proofDue) nextProof = "Now: a new question, answered without help, will show whether it has stuck.";
  else if (input.proof?.provableFrom) nextProof = `From ${shortDate(input.proof.provableFrom)}: a question you have not seen, answered without help.`;
  else if (missed.length) nextProof = "Next session: repair what slipped, then a fresh question.";
  else nextProof = "In a few days: a question you have not seen, answered without help.";

  const pathway = describePathway(plan);
  const intervention = plan.intervention?.headline ?? pathway.headline;
  const immediate = questions.filter((r) => r.kind !== "transfer");
  const chain: WhatChangedChainStep[] = [
    { stage: "problem", label: "Problem", status: "done", detail: `${before.focus}: ${before.state.toLowerCase()}.` },
    { stage: "intervention", label: "What you did", status: completed.length ? "done" : "pending", detail: intervention.charAt(0).toUpperCase() + intervention.slice(1) + "." },
    {
      stage: "immediate", label: "Straight after",
      status: immediate.some((r) => r.result === "passed-independent") ? "done" : immediate.some((r) => r.result === "missed" || r.result === "gave-up") ? "missed" : immediate.length ? "done" : "pending",
      detail: immediate.some((r) => r.result === "passed-independent") ? "Answered without help." : immediate.some((r) => r.result === "passed-assisted") ? "Answered with help: practice, not proof." : immediate.length ? "Marks dropped." : "No question answered.",
    },
    {
      stage: "different", label: "New context",
      status: !transferPlanned ? "not-applicable" : transferHeld ? "done" : transferRecords.length ? "missed" : "pending",
      detail: !transferPlanned ? "Not part of this session." : transferHeld ? "Held on a question in a new context." : transferRecords.length ? "Did not carry over yet." : "Still to come.",
    },
    {
      stage: "delayed", label: "After a delay", status: proven ? "done" : "pending",
      detail: proven ? "Held on new questions after a delay." : nextProof,
    },
    {
      stage: "outcome", label: "Outcome", status: proven ? "done" : input.lifecycle?.stage === "slipped" ? "missed" : "pending",
      detail: input.lifecycle?.claim ?? (proven ? "Proven." : input.lifecycle?.stage === "slipped" ? "Lower on new questions after a delay than before." : "Not proven yet. Same-session success never counts on its own."),
    },
  ];

  return {
    verdict, headline, before, thisSession, chain, nextProof,
    caveat: !proven && thisSession.some((l) => l.ok) ? "One session is not proof. It counts once it holds on a question you have not seen, after a delay." : null,
  };
}
