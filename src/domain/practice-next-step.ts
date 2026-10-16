// One next step after a practice answer that lost marks.
//
// Outside a diagnostic check the marked result used to stack up to four
// competing calls to action (a guiding question, a "How to fix it" list, a
// "What this taught us" card, an optional structure drill and a four-step
// repair plan with its own Start and Then buttons). This pure chooser picks
// exactly one primary action; everything else stays available, collapsed,
// under "More help with this answer".
//
// Precedence, most specific evidence first:
//   1. A technique repair: an actionable (above-threshold) diagnosis of THIS
//      answer names a structure loss on a describe/explain/evaluate part.
//   2. The first step of the topic's repair plan (intervention engine).
//   3. Nothing to link to: the card states what the answer showed, with no
//      button (the practice navigator's Next question is the way on).
// A tentative, heuristic shape suggestion is never primary: it does not
// establish why marks were lost.

import type { InterventionStep } from "./intervention-engine";
import { INTERVENTION_STEP_LABEL } from "./intervention-engine";
import type { TechniqueRepair } from "./technique-repair";

export type PracticeNextStep =
  | {
      kind: "technique";
      title: string;
      why: string;
      note: string;
      cta: string;
      href: string;
    }
  | {
      kind: "prescription";
      title: string;
      why: string;
      note: string;
      cta: string;
      href: string;
      stepKind: InterventionStep["kind"];
    }
  | {
      kind: "none";
      title: string;
      why: string;
      note: null;
      cta: null;
      href: null;
    };

export function techniqueDrillName(drillId: TechniqueRepair["drillId"]): string {
  return drillId === "six-mark" ? "extended evaluation" : drillId;
}

export function choosePracticeNextStep(input: {
  techniqueRepair: TechniqueRepair | null;
  prescription: { headline: string; topicTitle: string; firstStep: InterventionStep | undefined } | null;
  fallback: { label: string; why: string };
}): PracticeNextStep {
  const { techniqueRepair, prescription, fallback } = input;
  if (techniqueRepair) {
    const name = techniqueDrillName(techniqueRepair.drillId);
    return {
      kind: "technique",
      title: `Practise the ${name} response shape`,
      why: techniqueRepair.why,
      note: "A fictional writing drill — no marks, mastery or proof. Then return to this question.",
      cta: `Try the ${name} drill`,
      href: techniqueRepair.href,
    };
  }
  const first = prescription?.firstStep;
  if (prescription && first) {
    return {
      kind: "prescription",
      title: prescription.headline,
      why: `${first.why}${first.countsAsProof ? "" : " (practice, not proof)"}`,
      note: `Chosen for ${prescription.topicTitle} from your recall, application, mistakes and proof evidence.`,
      cta: `Start: ${INTERVENTION_STEP_LABEL[first.kind]}`,
      href: first.href,
      stepKind: first.kind,
    };
  }
  return { kind: "none", title: fallback.label, why: fallback.why, note: null, cta: null, href: null };
}
