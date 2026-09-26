"use client";

// Assessment/readiness outcomes — evidence history, not study state.
//
// Owns: grade-prediction snapshots, actual results, paper outcomes,
// intervention outcomes, and their calibration derivations. Reads the snapshot
// (for weekly prediction logging) and predictions; writes go to local meta
// storage. Nothing here mutates cards, attempts, or the plan.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { allSubjects } from "@/domain/curriculum";
import { daysToExam } from "@/domain/recommender";
import { delayedFarTransferRetests } from "@/domain/delayed-far-transfer";
import { buildExamReadiness, summariseExamReadiness } from "@/domain/exam-readiness";
import type { ExamReadiness, ExamReadinessSummary } from "@/domain/exam-readiness";
import type { GradePrediction } from "@/domain/grades";
import { todayIso } from "@/domain/scheduling";
import type { Id, InterventionOutcomeRecord, TopicMastery } from "@/domain/types";
import type { RecallMasteryRow } from "@/domain/recall-mastery";
import type { ResponseTimeCalibrationReport } from "@/domain/response-time-calibration";
import type { Snapshot } from "@/data/repository";
import { readReviseMeta, writeReviseMeta } from "@/data/storage-namespace";
import { type ActualResultRecord, type GradePredictionRecord, gradePredictionSnapshotId } from "@/domain/grade-loop";
import {
  buildPaperOutcomeRecord,
  closePaperOutcome as closeStoredPaperOutcome,
  paperOutcomeGainMultiplier,
  type PaperOutcomeReview,
  type PaperOutcomeRecord,
} from "@/domain/paper-outcome";
import { calibrateInterventions } from "@/domain/intervention-calibration";
import type { InterventionCalibration } from "@/domain/intervention-calibration";
import { trustedSnapshotAttempt } from "./trusted-evidence";

export interface Outcomes {
  /** True once the mount load finished — first paint waits for it, as boot did. */
  loaded: boolean;
  examReadiness: ExamReadiness[];
  examReadinessSummary: ExamReadinessSummary;
  gradePredictionLog: GradePredictionRecord[];
  gradeActuals: ActualResultRecord[];
  paperOutcomeLog: PaperOutcomeRecord[];
  paperOutcomeGains: Map<Id, number>;
  interventionOutcomes: InterventionOutcomeRecord[];
  interventionCalibrations: Map<string, InterventionCalibration>;
  setInterventionOutcomes: Dispatch<SetStateAction<InterventionOutcomeRecord[]>>;
  recordGradeActual: (input: {
    subjectId: Id;
    percent: number;
    kind: "mock" | "paper" | "final";
    takenAt?: string;
    label?: string;
  }) => Promise<void>;
  removeGradeActual: (id: Id) => Promise<void>;
  beginPaperOutcome: (input: {
    subjectId: Id;
    paperId: Id;
    paperRunId?: Id;
    predictedMarks: number;
    totalMarks: number;
  }) => Promise<void>;
  closePaperOutcome: (paperRunId: Id, actualMarks: number, markingReview?: PaperOutcomeReview) => Promise<void>;
  recordInterventionOutcome: (outcome: InterventionOutcomeRecord) => Promise<void>;
}

export function useOutcomes(input: {
  userId: Id;
  snapshot: Snapshot | null;
  predictions: GradePrediction[];
  subjectIds: readonly Id[];
  mastery: TopicMastery[];
  recallMastery: RecallMasteryRow[];
  responseTimeCalibration: ResponseTimeCalibrationReport;
}): Outcomes {
  const { userId, snapshot, predictions, subjectIds, mastery, recallMastery, responseTimeCalibration } = input;
  const [gradePredictionLog, setGradePredictionLog] = useState<GradePredictionRecord[]>([]);
  const [gradeActuals, setGradeActuals] = useState<ActualResultRecord[]>([]);
  // Sat papers with their sit-time prediction frozen in — the reality check
  // that feeds the recommender's paper gain factor back from evidence.
  const [paperOutcomeLog, setPaperOutcomeLog] = useState<PaperOutcomeRecord[]>([]);
  const [interventionOutcomes, setInterventionOutcomes] = useState<InterventionOutcomeRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Self-loading on mount (in parallel with the snapshot load).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [gradePreds, gradeActs, paperOutcomes, savedInterventions] = await Promise.all([
        readReviseMeta<GradePredictionRecord[]>("gradePredictions"),
        readReviseMeta<ActualResultRecord[]>("gradeActuals"),
        readReviseMeta<PaperOutcomeRecord[]>("paperOutcomes"),
        readReviseMeta<InterventionOutcomeRecord[]>("interventionOutcomes"),
      ]);
      if (cancelled) return;
      setGradePredictionLog(gradePreds ?? []);
      setGradeActuals(gradeActs ?? []);
      setPaperOutcomeLog(paperOutcomes ?? []);
      // The metadata key predates account-scoped storage, so keep other
      // learners' rows on disk but never let them influence this learner's
      // calibration or appear in the adaptive planner.
      setInterventionOutcomes((savedInterventions ?? []).filter((row) => row.userId === userId));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Close the grade loop: snapshot predictions weekly so later mocks can be
  // paired against what Revise believed at the time - not retro-fitted.
  useEffect(() => {
    if (!snapshot || !predictions.length) return;
    void (async () => {
      const existing = (await readReviseMeta<GradePredictionRecord[]>("gradePredictions")) ?? [];
      const week = Math.floor(Date.now() / (7 * 86_400_000));
      let appended = false;
      for (const p of predictions) {
        const snapshotId = gradePredictionSnapshotId(userId, p.subjectId, week);
        if (existing.some((r) => r.id === snapshotId)) continue;
        const marked = snapshot.attempts.filter((a) => a.subjectId === p.subjectId &&
          trustedSnapshotAttempt(a, snapshot.questions, snapshot.attempts)).length;
        const record: GradePredictionRecord = {
          id: snapshotId,
          anonId: userId,
          subjectId: p.subjectId,
          predictedPercent: p.percent,
          lowerPercent: Math.max(0, p.percent - (100 - p.confidence * 100) / 2),
          upperPercent: Math.min(100, p.percent + (100 - p.confidence * 100) / 2),
          gradeLabel: p.grade,
          confidence: p.confidence,
          evidenceShare: Math.min(1, marked / 40),
          createdAt: new Date().toISOString(),
          examDate: snapshot.examDates.find((e) => e.subjectId === p.subjectId)?.date ?? null,
        };
        existing.push(record);
        appended = true;
      }
      if (appended) {
        await writeReviseMeta("gradePredictions", existing.slice(-500));
        setGradePredictionLog(existing.slice(-500));
      }
    })();
  }, [predictions, snapshot, userId]);

  // Per-subject multiplier for paper recommendations: >1 when sat papers keep
  // beating their frozen predictions (more headroom than the model sees), <1
  // when they fall short. 1.0 with fewer than two recorded outcomes.
  const paperOutcomeGains = useMemo(() => {
    const out = new Map<Id, number>();
    for (const subjectId of subjectIds) {
      out.set(subjectId, paperOutcomeGainMultiplier(paperOutcomeLog, subjectId));
    }
    return out;
  }, [subjectIds, paperOutcomeLog]);

  const interventionCalibrations = useMemo(
    () => calibrateInterventions(interventionOutcomes),
    [interventionOutcomes],
  );

  const farTransferRetests = useMemo(
    () => delayedFarTransferRetests({ attempts: snapshot?.attempts ?? [], questions: snapshot?.questions ?? [], today: todayIso() }),
    [snapshot],
  );

  const examReadiness = useMemo(() => {
    if (!snapshot) return [];
    const predictionBySubject = new Map(predictions.map((prediction) => [prediction.subjectId, prediction] as const));
    return allSubjects()
      .filter((subject) => subjectIds.includes(subject.id))
      .flatMap((subject) => {
        const prediction = predictionBySubject.get(subject.id);
        if (!prediction) return [];
        const topicRows = mastery.filter((row) => row.subjectId === subject.id);
        const evidencedTopics = topicRows.filter((row) => row.cardsTotal > 0 || row.attempts > 0).length;
        const coverageAverage = topicRows.length ? topicRows.reduce((sum, row) => sum + row.mastery, 0) / topicRows.length : 0;
        const recallRows = recallMastery.filter((row) => row.subjectId === subject.id);
        const recallCards = recallRows.reduce((sum, row) => sum + row.cardsTotal, 0);
        const recallReviews = recallRows.reduce((sum, row) => sum + row.reviews, 0);
        const retained = recallRows.filter((row) => row.cardsTotal > 0);
        const retentionAverage = retained.length ? retained.reduce((sum, row) => sum + row.currentRetention, 0) / retained.length : null;
        const timed = snapshot.attempts.filter((attempt) => attempt.subjectId === subject.id && attempt.max > 0 &&
          trustedSnapshotAttempt(attempt, snapshot.questions, snapshot.attempts));
        const available = timed.reduce((sum, attempt) => sum + attempt.max, 0);
        const awarded = timed.reduce((sum, attempt) => sum + Math.max(0, Math.min(attempt.max, attempt.awarded)), 0);
        const pace = responseTimeCalibration.rows.find((row) => row.subjectId === subject.id);
        const transfers = farTransferRetests.filter((retest) => retest.subjectId === subject.id);
        const completedTransfers = transfers.filter((retest) => retest.status === "completed");
        const passedTransfers = completedTransfers.filter((retest) => retest.outcome?.passed).length;
        return [buildExamReadiness({
          subject,
          prediction,
          targetGrade: snapshot.settings.targetGrades[subject.id] ?? null,
          examDays: daysToExam(snapshot.examDates, subject.id, todayIso()),
          coverage: { average: coverageAverage, topics: topicRows.length, evidencedTopics },
          retention: { average: retentionAverage, cards: recallCards, reviews: recallReviews },
          timed: { accuracy: available ? awarded / available : null, attempts: timed.length, marks: available },
          pace: { ratio: pace?.ratio ?? null, attempts: pace?.attempts ?? 0 },
          transfer: {
            passRate: completedTransfers.length ? passedTransfers / completedTransfers.length : null,
            completed: completedTransfers.length,
            due: transfers.filter((retest) => retest.status === "due").length,
          },
        })];
      });
  }, [snapshot, predictions, subjectIds, mastery, recallMastery, responseTimeCalibration.rows, farTransferRetests]);

  const examReadinessSummary = useMemo(() => summariseExamReadiness(examReadiness), [examReadiness]);

  const recordGradeActual = useCallback(async (recordInput: {
    subjectId: Id;
    percent: number;
    kind: "mock" | "paper" | "final";
    takenAt?: string;
    label?: string;
  }) => {
    if (!Number.isFinite(recordInput.percent) || recordInput.percent < 0 || recordInput.percent > 100) {
      throw new Error("Result percentage must be between 0 and 100.");
    }
    const takenAt = recordInput.takenAt ?? new Date().toISOString();
    const takenAtMs = new Date(takenAt).getTime();
    if (!Number.isFinite(takenAtMs)) throw new Error("Result date is invalid.");
    if (takenAtMs > Date.now() + 5 * 60_000) throw new Error("Result date cannot be in the future.");

    const record: ActualResultRecord = {
      id: crypto.randomUUID(),
      anonId: userId,
      subjectId: recordInput.subjectId,
      percent: recordInput.percent,
      kind: recordInput.kind,
      takenAt: new Date(takenAtMs).toISOString(),
      label: recordInput.label?.trim() || undefined,
    };
    const log = (await readReviseMeta<ActualResultRecord[]>("gradeActuals")) ?? [];
    const next = [...log.slice(-500), record];
    await writeReviseMeta("gradeActuals", next);
    setGradeActuals(next);
  }, [userId]);

  const removeGradeActual = useCallback(async (id: Id) => {
    const log = (await readReviseMeta<ActualResultRecord[]>("gradeActuals")) ?? [];
    const target = log.find((row) => row.id === id);
    if (!target || target.anonId !== userId) return;
    const next = log.filter((row) => row.id !== id);
    await writeReviseMeta("gradeActuals", next);
    setGradeActuals(next);
  }, [userId]);

  // Paper-outcome loop, part 1: freeze the prediction the moment a recommended
  // paper is started, BEFORE any question is answered. Called with the
  // calibration-adjusted simulation for this exact paper.
  const beginPaperOutcome = useCallback(async (beginInput: {
    subjectId: Id;
    paperId: Id;
    paperRunId?: Id;
    predictedMarks: number;
    totalMarks: number;
  }) => {
    const record = buildPaperOutcomeRecord({
      userId,
      subjectId: beginInput.subjectId,
      paperId: beginInput.paperId,
      paperRunId: beginInput.paperRunId,
      predictedMarks: beginInput.predictedMarks,
      totalMarks: beginInput.totalMarks,
      satAt: new Date().toISOString(),
    });
    const log = (await readReviseMeta<PaperOutcomeRecord[]>("paperOutcomes")) ?? [];
    const next = [...log.filter((o) => o.id !== record.id), record].slice(-200);
    await writeReviseMeta("paperOutcomes", next);
    setPaperOutcomeLog(next);
  }, [userId]);

  // Paper-outcome loop, part 2: close the record with the actual awarded
  // marks once marking completes. The (predicted, actual) pair then feeds
  // paperOutcomeGainMultiplier on the next recommend() pass.
  const closePaperOutcome = useCallback(async (
    paperRunId: Id,
    actualMarks: number,
    markingReview?: PaperOutcomeReview,
  ) => {
    const log = (await readReviseMeta<PaperOutcomeRecord[]>("paperOutcomes")) ?? [];
    const target = log.find((o) => o.paperRunId === paperRunId);
    if (!target) return; // no frozen prediction (untimed path or legacy run) — nothing to learn
    const next = [...log.filter((o) => o.id !== target.id), closeStoredPaperOutcome(target, actualMarks, markingReview)].slice(-200);
    await writeReviseMeta("paperOutcomes", next);
    setPaperOutcomeLog(next);
  }, []);

  const recordInterventionOutcome = useCallback(async (outcome: InterventionOutcomeRecord) => {
    if (outcome.userId !== userId) throw new Error("Cannot record intervention evidence for another user.");
    const all = (await readReviseMeta<InterventionOutcomeRecord[]>("interventionOutcomes")) ?? [];
    const own = all.filter((row) => row.userId === userId);
    const nextOwn = [...own.filter((row) => row.id !== outcome.id), outcome];
    const nextAll = [...all.filter((row) => row.userId !== userId), ...nextOwn].slice(-2000);
    await writeReviseMeta("interventionOutcomes", nextAll);
    setInterventionOutcomes(nextOwn);
  }, [userId]);

  return {
    loaded,
    examReadiness,
    examReadinessSummary,
    gradePredictionLog,
    gradeActuals,
    paperOutcomeLog,
    paperOutcomeGains,
    interventionOutcomes,
    interventionCalibrations,
    setInterventionOutcomes,
    recordGradeActual,
    removeGradeActual,
    beginPaperOutcome,
    closePaperOutcome,
    recordInterventionOutcome,
  };
}
