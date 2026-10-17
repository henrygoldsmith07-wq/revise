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
//   3. The lesson that teaches the lost part's specification point, when
//      Revise has written teaching for it (relearnCheckpointFor). Not yet
//      teacher-reviewed, and said so; a lesson is never proof.
//   4. Nothing to link to: the card states what the answer showed, with no
//      button (the practice navigator's Next question is the way on).
// The repair plan's "Targeted explanation" step opened the topic's first
// lesson checkpoint, whichever point the marks were lost on; with a taught
// checkpoint it now opens that one (withRelearnHref).
// A tentative, heuristic shape suggestion is never primary: it does not
// establish why marks were lost.

import type { InterventionStep } from "./intervention-engine";
import { interventionStepLabel } from "./intervention-engine";
import type { TechniqueRepair } from "./technique-repair";
import type { Id, MarkedPart, Question, Topic } from "./types";

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
      kind: "relearn";
      title: string;
      why: string;
      note: string;
      cta: string;
      href: string;
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
  /** The taught lesson checkpoint for the lost part, if any (relearnCheckpointFor). */
  relearn?: RelearnCheckpoint | null;
}): PracticeNextStep {
  const { techniqueRepair, prescription, fallback, relearn } = input;
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
      note: `Chosen for ${prescription.topicTitle} from your recall, application, mistakes and proof evidence.${relearn && first.href === relearn.href ? ` The lesson is for ${relearn.ref}, the point this answer lost. ${RELEARN_NOTE}` : ""}`,
      cta: `Start: ${interventionStepLabel(first)}`,
      href: first.href,
      stepKind: first.kind,
    };
  }
  if (relearn) {
    return {
      kind: "relearn",
      title: `Re-learn ${relearn.ref}: ${relearn.topicTitle}`,
      why: `${fallback.why} The lesson for this point teaches the idea with a worked example, then has you write an exam answer.`,
      note: RELEARN_NOTE,
      cta: "Open the lesson",
      href: relearn.href,
    };
  }
  return { kind: "none", title: fallback.label, why: fallback.why, note: null, cta: null, href: null };
}

/** Authored teaching is unreviewed; every link into it says so. */
export const RELEARN_NOTE = "Written by Revise and not yet teacher-reviewed. A lesson is practice, not proof.";

export interface RelearnCheckpoint {
  topicId: Id;
  subjectId: Id;
  topicTitle: string;
  specPointId: Id;
  /** The board's reference, e.g. "Unit 1.1(a)", or "checkpoint 2 of 5" when none is printed. */
  ref: string;
  /** `/lesson?subject=…&topic=…&checkpoint=…`, honoured by the lesson page. */
  href: string;
}

/**
 * The lesson checkpoint that teaches what this answer lost, or null.
 *
 * Takes the lost part that dropped the most marks (ties: question order)
 * whose specification point has authored teaching (`taught`, the ids in
 * src/content/teaching), and the question topic that owns that point. Parts
 * that lost nothing, and points without teaching (an outline would only
 * restate the specification), give nothing.
 */
export function relearnCheckpointFor(input: {
  question: Pick<Question, "parts" | "topicIds">;
  marked: readonly MarkedPart[];
  taught: ReadonlySet<string>;
  topicFor: (topicId: Id) => Topic | undefined;
}): RelearnCheckpoint | null {
  const { question, marked, taught, topicFor } = input;
  const lost = question.parts
    .map((part, order) => {
      const mark = marked.find((m) => m.partId === part.id);
      return { part, order, dropped: mark ? mark.max - mark.awarded : 0 };
    })
    .filter((row) => row.dropped > 0)
    .sort((a, b) => b.dropped - a.dropped || a.order - b.order);
  const topics = question.topicIds.map(topicFor).filter((topic): topic is Topic => Boolean(topic));
  for (const { part } of lost) {
    for (const specPointId of part.specPointIds ?? []) {
      if (!taught.has(specPointId)) continue;
      for (const topic of topics) {
        const points = (topic.specPoints ?? []).filter((point) => point.text.trim().length > 0);
        const index = points.findIndex((point) => point.id === specPointId);
        if (index < 0) continue;
        const printed = points[index]!.ref.trim();
        const query = new URLSearchParams({ subject: topic.subjectId, topic: topic.id, checkpoint: specPointId });
        return {
          topicId: topic.id,
          subjectId: topic.subjectId,
          topicTitle: topic.title,
          specPointId,
          ref: printed || `checkpoint ${index + 1} of ${points.length}`,
          href: `/lesson?${query}`,
        };
      }
    }
  }
  return null;
}

/**
 * A plan's "Targeted explanation" step for the same topic opens the taught
 * checkpoint instead of the topic's first lesson. Every other step, and an
 * explanation for another topic, is returned unchanged.
 */
export function withRelearnHref<T extends Pick<InterventionStep, "kind" | "href">>(step: T, relearn: RelearnCheckpoint | null | undefined): T {
  if (!relearn || step.kind !== "explain") return step;
  const url = new URL(step.href, "https://revise.invalid");
  if (url.pathname !== "/lesson" || url.searchParams.get("topic") !== relearn.topicId) return step;
  return { ...step, href: relearn.href };
}
