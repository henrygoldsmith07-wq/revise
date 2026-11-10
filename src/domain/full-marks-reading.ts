// ---------------------------------------------------------------------------
// What a full-mark answer shows about the student.
//
// Every full-mark answer used to read "Full marks — practice, not proof …
// counts as practice; only answers on reviewed questions can prove a skill."
// That sentence is about the question (nobody has reviewed it), and it was the
// whole of what a student was told about an answer they got right on their
// own. It also said the same thing for three different events:
//
//   unaided-new     no help, and a question (and question family) they had
//                   never answered: the thing an exam asks for
//   unaided-repeat  no help, but a question or a near copy they had answered
//                   before: remembering an answer, not using an idea
//   supported       hints, a guided step, a worked example or a lesson first
//
// This separates the two facts. What the student did is stated plainly. What
// Revise can claim about it is stated separately and is unchanged: an answer
// on an unreviewed question is recorded as practice, and nothing here is
// proof, mastery or a change to any ledger. It is wording for one screen.
//
// Pure: no React, no storage, no clock.
// ---------------------------------------------------------------------------

import { questionFamilies } from "./learning-evidence";
import type { Attempt, Question } from "./types";

export type FullMarksKind = "unaided-new" | "unaided-repeat" | "supported";

export interface FullMarksReading {
  kind: FullMarksKind;
  /** What the student did. */
  headline: string;
  /** What that does and does not show about them. */
  detail: string;
  /** What Revise can and cannot claim, given whether the question is teacher-reviewed. */
  claim: string;
}

function supported(attempt: Pick<Attempt, "hintTier" | "repairTeachingSeen" | "copiedAnswer">): boolean {
  return Boolean(attempt.hintTier || attempt.repairTeachingSeen || attempt.copiedAnswer);
}

/**
 * Read a full-mark attempt. `earlier` is every attempt made before it (any
 * question); `questionFor` resolves their questions so a near copy from the
 * same family counts as familiar. `reviewed` is learnerEvidenceTrusted for
 * this question, decided by the caller.
 */
export function readFullMarks(input: {
  attempt: Pick<Attempt, "id" | "questionId" | "hintTier" | "repairTeachingSeen" | "copiedAnswer" | "createdAt">;
  question: Question;
  earlier: readonly Pick<Attempt, "id" | "questionId" | "createdAt">[];
  questionFor: (questionId: string) => Question | undefined;
  reviewed: boolean;
}): FullMarksReading {
  const { attempt, question, reviewed } = input;
  const claim = reviewed
    ? "Recorded as a correct answer. It becomes proof once the same skill holds on a different reviewed question, unaided, after a delay."
    : "Recorded as practice, not proof: this question has not been checked by a teacher yet, so Revise cannot vouch for it.";

  if (supported(attempt)) {
    return {
      kind: "supported",
      headline: attempt.copiedAnswer ? "Full marks, matching the model answer" : "Full marks, with help",
      detail: attempt.copiedAnswer
        ? "This answer follows the model answer closely, so it shows the answer was in front of you rather than that you can produce it. Try a fresh question without it."
        : "You got there with the steps open. That is how a repair should start; the test of it is a fresh question without them.",
      claim,
    };
  }

  const before = input.earlier.filter((other) => other.id !== attempt.id && other.createdAt < attempt.createdAt);
  const sameQuestion = before.some((other) => other.questionId === attempt.questionId);
  const families = new Set(questionFamilies(question));
  const sameFamily = !sameQuestion && families.size > 0 && before.some((other) => {
    const seen = input.questionFor(other.questionId);
    return seen ? questionFamilies(seen).some((family) => families.has(family)) : false;
  });
  if (sameQuestion || sameFamily) {
    return {
      kind: "unaided-repeat",
      headline: sameQuestion ? "Full marks on a question you have answered before" : "Full marks on a question very like one you have answered",
      detail: "Getting a familiar question right shows the answer has stuck. Whether you can use the idea is shown by a question you have not seen.",
      claim,
    };
  }
  return {
    kind: "unaided-new",
    headline: "Full marks, on your own, on a question you had not seen",
    detail: "No hints and nothing to remember it from: you worked this out. That is what an exam asks for. One answer is one answer, so the next test is the same idea in a different setting, and again after a few days.",
    claim,
  };
}
