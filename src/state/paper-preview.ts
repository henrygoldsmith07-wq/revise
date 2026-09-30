// ---------------------------------------------------------------------------
// Paper preview — pure derivation owned outside the store monolith.
//
// Calibration per subject comes from paper-mode attempts (predicted vs
// actual); the preview filters to trusted questions before simulating, so
// unreviewed WJEC content can never drive a predicted score. Both helpers are
// pure over the snapshot: the provider only memoises them.
// ---------------------------------------------------------------------------

import { getSubject } from "@/domain/curriculum";
import { trustedAssessmentContent } from "@/domain/physics-content-review";
import { calibrateFromHistory, simulatePaper } from "@/domain/assessment";
import { trustedSnapshotAttempt } from "./trusted-evidence";
import type { Snapshot } from "@/data/repository";
import type {
  Calibration,
  Id,
  PaperSimulation,
  Question,
  TopicMastery,
} from "@/domain/types";

/** Calibration per subject from paper-mode attempts: predicted vs actual. */
export function buildPaperCalibrations(
  snapshot: Pick<Snapshot, "attempts" | "questions"> | null,
  mastery: TopicMastery[],
  subjectIds: Id[],
): Map<Id, Calibration> {
  const out = new Map<Id, Calibration>();
  if (!snapshot) return out;
  const bySubject = new Map<Id, Array<{ predicted: number; actual: number }>>();
  const masteryMap = new Map(mastery.map((m) => [m.topicId, m.mastery]));
  // Group paper-mode attempts by subject; use current mastery as a proxy for predicted %
  // until real simulations are stored. This still yields a meaningful bias once ≥3 papers exist.
  for (const a of snapshot.attempts.filter((x) => x.mode === "paper")) {
    const q = snapshot.questions.find((qq) => qq.id === a.questionId);
    const subjectId = a.subjectId;
    if (!trustedSnapshotAttempt(a, snapshot.questions, snapshot.attempts)) continue;
    // predicted marks for this attempt: sum of topic mastery averaged across its topics
    const qMastery = q ? q.topicIds.reduce((s, id) => s + (masteryMap.get(id) ?? 0.4), 0) / Math.max(1, q.topicIds.length) : 0.4;
    const predicted = a.max * (0.35 + qMastery * 0.6);
    const list = bySubject.get(subjectId) ?? [];
    list.push({ predicted, actual: a.awarded });
    bySubject.set(subjectId, list);
  }
  for (const [subjectId, pairs] of bySubject) {
    out.set(subjectId, calibrateFromHistory({ subjectId, pairs }));
  }
  // Ensure every enrolled subject has at least a neutral calibration
  for (const sid of subjectIds) if (!out.has(sid)) out.set(sid, { subjectId: sid, bias: 0, slope: 1, sampleSize: 0, mae: 0 });
  return out;
}

export function previewPaperSimulation(input: {
  snapshot: Snapshot | null;
  mastery: TopicMastery[];
  calibrations: Map<Id, Calibration>;
  subjectId: Id;
  paperSpecId: Id;
  questionIds: Id[];
}): PaperSimulation | null {
  const { snapshot, mastery, calibrations, subjectId, paperSpecId, questionIds } = input;
  if (!snapshot) return null;
  const subject = getSubject(subjectId);
  if (!subject) return null;
  const questions = questionIds.map((id) => snapshot.questions.find((q) => q.id === id)).filter((q): q is Question => Boolean(q));
  if (!questions.length) return null;
  // Trust gate: unreviewed WJEC content cannot drive a predicted score.
  const trusted = questions.filter(trustedAssessmentContent);
  if (!trusted.length) return null;
  const topicMastery = new Map(mastery.map((m) => [m.topicId, m.mastery]));
  return simulatePaper({ subject, paperSpecId, questions: trusted, topicMastery, calibration: calibrations.get(subjectId) });
}
