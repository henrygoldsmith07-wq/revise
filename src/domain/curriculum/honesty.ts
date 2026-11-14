import type { PaperSpec, Question, Subject, Topic, VerificationStatus } from "../types";
import { isFlagship } from "../flagship";
import { specFor } from "../spec";
import type { CurriculumModule } from "./registry";

/**
 * Honest labelling for cloned/reference curricula.
 *
 * 28 of the registered subjects are adapted from the four WJEC A-level
 * flagships. Their topic lists, paper shapes and "checked · WJEC reviewer"
 * stamps were never verified against that board's specification. This module
 * is the single place we tell the truth: flagship stays as authored;
 * everything else is labelled reference-tier, verification is downgraded,
 * and GCSE paper structures are taken from SPEC_MANIFEST rather than the
 * A-level clone.
 */

export const REFERENCE_DISCLAIMER =
  "Reference-tier: this subject's topic list is adapted from a WJEC A-level outline and has not been checked against this board's current specification. Use it to navigate, not as a spec guarantee.";

/**
 * GCSE subjects are worse than "another board's outline": every GCSE topic
 * tree is a copy of the WJEC A-level one (proof by contradiction, Young
 * modulus, pV = nRT), so lessons and flashcards are A-level material. Only
 * their practice questions were written for GCSE. Say so wherever the
 * subject is offered.
 */
export const GCSE_REFERENCE_DISCLAIMER =
  "Reference-tier GCSE: this subject currently uses the WJEC A-level topic list, so its lessons and flashcards go well beyond GCSE. Only its practice questions were written for GCSE, and none has been checked against this board's specification.";

/**
 * GCSE subjects that now build from a GCSE outline transcribed from the DfE
 * GCSE subject content (./outlines/gcse-*.ts), not the WJEC A-level one. The
 * other GCSE subjects keep GCSE_REFERENCE_DISCLAIMER until theirs is written.
 */
export const GCSE_SUBJECT_CONTENT_SUBJECTS: ReadonlySet<string> = new Set([
  "aqa-gcse-physics",
  "edexcel-gcse-physics",
  "ocr-gcse-physics",
  "wjec-gcse-physics",
]);

export const GCSE_SUBJECT_CONTENT_DISCLAIMER =
  "Reference-tier GCSE: this subject's topics follow the DfE GCSE subject content that this board's specification is built on, not yet the board's own topic order and numbering. Its notes, flashcards and questions have not been checked by a teacher.";

/**
 * WJEC's GCSE for Wales is regulated by Qualifications Wales and is not built
 * on the DfE document, so its label must not claim it is.
 */
export const WJEC_GCSE_SUBJECT_CONTENT_DISCLAIMER =
  "Reference-tier GCSE: this subject's topics follow the DfE GCSE subject content for England. WJEC's GCSE for Wales shares most of it but is regulated separately, so check your own specification for differences. Its notes, flashcards and questions have not been checked by a teacher.";

/**
 * Reference subjects whose topic list was written for their own board's
 * specification rather than cloned from a flagship. Still reference-tier:
 * nobody has checked them against the spec, and their questions are
 * unreviewed. They must not carry the "adapted from WJEC" disclaimer, which
 * would be false.
 */
export const AUTHORED_REFERENCE_SUBJECTS: ReadonlySet<string> = new Set([
  "aqa-alevel-psychology",
  "aqa-alevel-computer-science",
  "aqa-alevel-economics",
]);

export const AUTHORED_REFERENCE_DISCLAIMER =
  "Reference-tier: this subject's topic list was written for this board's specification but has not yet been checked by a teacher. Use it to revise, not as a spec guarantee.";

/**
 * Reference subjects rebuilt section by section to their own board's
 * published specification (./board-outline.ts): their units, topic titles and
 * references follow the specification, checked against it, but their notes
 * and questions are unreviewed and some notes were first written for the
 * WJEC course, so the "adapted from WJEC" disclaimer no longer describes them.
 */
export const BOARD_STRUCTURED_SUBJECTS: ReadonlySet<string> = new Set([
  "aqa-alevel-biology",
  "aqa-alevel-chemistry",
  "aqa-alevel-physics",
  "aqa-alevel-maths",
]);

export const BOARD_STRUCTURED_DISCLAIMER =
  "Reference-tier: this subject's units and topics follow the sections of this board's published specification, but its notes, flashcards and questions have not been checked by a teacher, and some notes were first written for another board's course. Use it to revise, not as a spec guarantee.";

/** Whether a reference subject's topic list follows its own board's specification. */
export function followsOwnSpecification(subjectId: string): boolean {
  return AUTHORED_REFERENCE_SUBJECTS.has(subjectId) || BOARD_STRUCTURED_SUBJECTS.has(subjectId);
}

export function isGcseSubject(subjectId: string): boolean {
  return subjectId.includes("-gcse-");
}

export function referenceDisclaimerFor(subjectId: string): string {
  if (AUTHORED_REFERENCE_SUBJECTS.has(subjectId)) return AUTHORED_REFERENCE_DISCLAIMER;
  if (BOARD_STRUCTURED_SUBJECTS.has(subjectId)) return BOARD_STRUCTURED_DISCLAIMER;
  if (GCSE_SUBJECT_CONTENT_SUBJECTS.has(subjectId)) {
    return subjectId.startsWith("wjec-") ? WJEC_GCSE_SUBJECT_CONTENT_DISCLAIMER : GCSE_SUBJECT_CONTENT_DISCLAIMER;
  }
  return isGcseSubject(subjectId) ? GCSE_REFERENCE_DISCLAIMER : REFERENCE_DISCLAIMER;
}

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
      marks: pb.marks,
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
    ...(topic.specPoints
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
    ...(flagship ? {} : { contentDisclaimer: referenceDisclaimerFor(entry.subject.id) }),
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
