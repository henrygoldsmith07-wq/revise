// ---------------------------------------------------------------------------
// Post-question diagnosis: what happened, why Revise thinks so, the pattern,
// and the best fix. Built only from the existing root-cause, working-analysis
// and mistake-pattern systems; where evidence is weak it says so.
// ---------------------------------------------------------------------------

import { ROOT_CAUSE_LABEL, rootCauseOf, type MistakePattern, type PatternIntervention, type RootCause } from "./mistake-patterns";
import type { Id, Mistake } from "./types";

export const CONFIDENT_DIAGNOSIS = 0.6;

export interface LossDiagnosis {
  cause: RootCause;
  confident: boolean;
  whatHappened: string;
  why: string;
  pattern: string | null;
  bestFix: string;
}

const HAPPENED: Partial<Record<RootCause, string>> = {
  "unit-error": "You had the right approach but a unit or conversion went wrong.",
  "arithmetic-slip": "The method was fine, but an arithmetic or rounding slip changed the answer.",
  "wrong-method": "A different method was needed from the one used.",
  "missing-knowledge": "A fact or definition needed here was not recalled.",
  "misunderstood-concept": "The idea behind this question was misunderstood.",
  "insufficient-explanation": "The right ideas were there, but the explanation did not link them enough to earn the mark.",
  "poor-evaluation": "The answer described the points but did not weigh them.",
  "incomplete-working": "The working did not show enough steps to earn the method marks.",
  "command-word-error": "The answer did not do what the command word asked.",
  "poor-application": "The idea was known but not applied to this situation.",
  "misread-question": "The question was read differently from how it was asked.",
  timing: "Time ran short on this part.",
  "prerequisite-weakness": "An earlier topic this builds on is not secure yet.",
};

const FIX: Record<PatternIntervention, { label: string; text: string }> = {
  "misconception-correction": { label: "a short misconception repair", text: "Fix the idea first, then try a different question on it." },
  "technique-intervention": { label: "a short technique drill", text: "Do two short targeted questions before another full application question." },
  "retrieval-set": { label: "a recall check", text: "Recall it from memory first, then try it in a question." },
  "prerequisite-repair": { label: "a prerequisite repair", text: "Repair the earlier topic before returning to this one." },
  "independent-set": { label: "an unfamiliar-question set", text: "Practise on different questions without help." },
  "timed-sprint": { label: "a timed sprint", text: "Practise this under time pressure." },
};

export function diagnoseLoss(mistake: Mistake, patterns: readonly MistakePattern[], opts: { prerequisiteWeakTopics?: ReadonlySet<Id> } = {}): LossDiagnosis {
  const cause = rootCauseOf(mistake, opts);
  const hasSignal = Boolean(mistake.workingErrorKind && mistake.workingErrorKind !== "none") || Boolean(mistake.errorCategory) || Boolean(mistake.misconceptionEntryId);
  const lowConfidence = mistake.errorConfidence !== undefined && mistake.errorConfidence < CONFIDENT_DIAGNOSIS;
  const confident = cause !== "unclassified" && (hasSignal ? !lowConfidence : mistake.category !== "unclassified");
  const pattern = patterns.find((p) => p.cause === cause);
  const fix = FIX[pattern?.intervention ?? "independent-set"];

  let why: string;
  if (!confident) {
    why = cause === "unclassified"
      ? "There is not enough evidence yet to classify this confidently."
      : `This may be ${ROOT_CAUSE_LABEL[cause]}, but there is not enough evidence yet to be sure.`;
  } else if (mistake.workingErrorKind && mistake.workingErrorKind !== "none") {
    why = `The working shows ${mistake.firstIncorrectStep ? `the first incorrect step at step ${mistake.firstIncorrectStep}` : "an error at a specific step"}, and the error type matches ${ROOT_CAUSE_LABEL[cause]}.`;
  } else if (mistake.errorCategory) {
    why = `The lost mark point and the answer matched ${ROOT_CAUSE_LABEL[cause]}.`;
  } else {
    why = `The type of mark lost (${mistake.category}) points to ${ROOT_CAUSE_LABEL[cause]}.`;
  }

  const count = pattern?.questions ?? 0;
  return {
    cause,
    confident,
    whatHappened: confident ? HAPPENED[cause] ?? mistake.description : mistake.description || "Marks were lost here and the cause is not clear yet.",
    why,
    pattern: pattern && count >= 2 ? `You have lost marks through ${ROOT_CAUSE_LABEL[cause]} on ${count} different questions.` : null,
    bestFix: confident ? `${fix.text} (${fix.label}).` : "Try one more question on this topic so Revise can tell what is going wrong.",
  };
}
