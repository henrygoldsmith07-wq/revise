import type { DiagnosticItem, ProbeRecord } from "./adaptive-diagnostic";
import { classifyDepth } from "./flagship";
import { questionFamilies } from "./learning-evidence";
import { trustedAssessmentContent } from "./physics-content-review";
import type { Attempt, Id, Question } from "./types";

export const DIAGNOSTIC_PASS_RATIO = 0.6;

/** Trusted questions for one subject as diagnostic probes; untrusted content never enters. */
export function diagnosticItems(subjectId: Id, questions: readonly Question[]): DiagnosticItem[] {
  return questions
    .filter((q) => q.subjectId === subjectId && q.topicIds.length > 0 && q.totalMarks > 0 && trustedAssessmentContent(q))
    .map((q) => {
      const category = classifyDepth(q);
      const depth: DiagnosticItem["depth"] = category === "recall" ? "recall"
        : category === "transfer" || category === "synoptic" || (category === "application" && q.difficulty >= 4) ? "hard-application"
        : "application";
      return {
        id: q.id,
        topicId: q.topicIds[0]!,
        depth,
        marks: q.totalMarks,
        expectedSeconds: Math.max(30, (q.learning?.expectedMinutes ?? q.totalMarks * 1.25) * 60),
        trusted: true,
        familyId: questionFamilies(q)[0],
      };
    });
}

/** Turn a finished attempt into a probe record; hinted attempts stay in the record but are never clean evidence. */
export function probeFromAttempt(attempt: Attempt, item: DiagnosticItem, confident: boolean): ProbeRecord {
  return {
    itemId: item.id,
    topicId: item.topicId,
    depth: item.depth,
    correct: attempt.max > 0 && attempt.awarded / attempt.max >= DIAGNOSTIC_PASS_RATIO,
    confident,
    seconds: Math.max(1, Math.round(attempt.elapsedMs / 1000)),
    hinted: Boolean(attempt.hintTier || attempt.copiedAnswer || attempt.repairTeachingSeen),
  };
}
