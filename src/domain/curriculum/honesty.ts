import type { PaperSpec, Question, Subject, Topic, VerificationStatus } from "../types";
import { isFlagship } from "../flagship";
import { specFor } from "../spec";
import type { CurriculumModule } from "./registry";

/**
 * Honest labelling for cloned/reference curricula.
 *
 * 28 of the 32 registered subjects are adapted from the four WJEC A-level
 * flagships. Their topic lists, paper shapes and "checked · WJEC reviewer"
 * stamps were never verified against that board's specification. This module
 * is the single place we tell the truth: flagship stays as authored;
 * everything else is labelled reference-tier, verification is downgraded,
 * and GCSE paper structures are taken from SPEC_MANIFEST rather than the
 * A-level clone.
 */

export const REFERENCE_DISCLAIMER =
  "Reference-tier: this subject's topic list is adapted from a WJEC A-level outline and has not been checked against this board's current specification. Use it to navigate, not as a spec guarantee.";

export function contentTierFor(subjectId: string): "flagship" | "reference" {
  return isFlagship(subjectId) ? "flagship" : "reference";
}

function stripCrossBoardReviewer(reviewer: string | null | undefined, subjectId: string): string | null {
  if (!reviewer) return reviewer ?? null;
  const isWjecSubject = subjectId.startsWith("wjec-");
  if (!isWjecSubject && /WJEC/i.test(reviewer)) return "reference-tier/unverified";
  return reviewer;
}

function downgradeVerification(status: VerificationStatus | undefined, flagship: boolean): VerificationStatus {
  if (flagship) return status ?? "unverified";
  return "unverified";
}

function gcseMathsPaperOneNonCalc(subjectId: string, paperId: string): boolean {
  return subjectId.includes("gcse-maths") && /\.p1$/.test(paperId);
}

/** Prefer the audited SPEC_MANIFEST paper breakdown over cloned A-level papers. */
export function papersFromManifest(subjectId: string): PaperSpec[] | undefined {
  const entry = specFor(subjectId);
  if (!entry?.paperBreakdown?.length) return undefined;
  return entry.paperBreakdown.map((pb) => {
    const nonCalc = /non-calculator/i.test(pb.unit) || gcseMathsPaperOneNonCalc(subjectId, pb.paperId);
    let name = pb.unit;
    if (gcseMathsPaperOneNonCalc(subjectId, pb.paperId) && !/non-calculator/i.test(name)) {
      name = `${name} (Non-calculator)`;
    }
    return {
      id: pb.paperId,
      name,
      weight: pb.weight,
      durationMinutes: pb.durationMinutes,
      calculatorAllowed: !nonCalc,
    };
  });
}

function honestTopic(topic: Topic, flagship: boolean, subjectId: string): Topic {
  if (flagship) return topic;
  return {
    ...topic,
    verification: downgradeVerification(topic.verification, false),
    reviewer: stripCrossBoardReviewer(topic.reviewer, subjectId),
    ...(topic.specPoints !== undefined
      ? {
          specPoints: topic.specPoints.map((sp) => ({
            ...sp,
            verification: downgradeVerification(sp.verification, false),
            reviewer: stripCrossBoardReviewer(sp.reviewer, subjectId),
          })),
        }
      : {}),
  };
}

export function honestSubject(entry: CurriculumModule): CurriculumModule {
  const flagship = isFlagship(entry.subject.id);
  const papers = papersFromManifest(entry.subject.id) ?? entry.subject.papers;
  const subject: Subject = {
    ...entry.subject,
    papers,
    contentTier: flagship ? "flagship" : "reference",
    ...(!flagship ? { contentDisclaimer: REFERENCE_DISCLAIMER } : {}),
  };
  return {
    subject,
    units: entry.units,
    topics: entry.topics.map((topic) => honestTopic(topic, flagship, entry.subject.id)),
  };
}

export function honestQuestion(question: Question): Question {
  if (isFlagship(question.subjectId)) return question;
  return {
    ...question,
    verification: "unverified",
    reviewer: stripCrossBoardReviewer(question.reviewer, question.subjectId),
  };
}
