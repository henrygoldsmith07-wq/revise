"use client";

// Assessment/readiness outcomes — evidence history, not study state.
//
// Owns: grade-prediction snapshots, actual results, paper outcomes,
// intervention outcomes, and their calibration derivations. Reads the snapshot
// (for weekly prediction logging) and predictions; writes commit row-level replicas and local projections atomically. Nothing here mutates cards, attempts, or the plan.

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
import { readReviseMeta } from "@/data/storage-namespace";
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
import { HISTORY_KINDS, validateHistoryValue } from "@/domain/learner-history";
import { HISTORY_CHANGED_EVENT, writeLearnerHistory, readLearnerHistory } from "@/data/learner-history";
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
  onError: (message: string) => void;
  snapshot: Snapshot | null;
  predictions: GradePrediction[];
  subjectIds: readonly Id[];
  mastery: TopicMastery[];
  recallMastery: RecallMasteryRow[];
  responseTimeCalibration: ResponseTimeCalibrationReport;
}): Outcomes {
  const { userId, onError, snapshot, predictions, subjectIds, mastery, recallMastery, responseTimeCalibration } = input;
  const [gradePredictionLog, setGradePredictionLog] = useState<GradePredictionRecord[]>([]);
  const [gradeActuals, setGradeActuals] = useState<ActualResultRecord[]>([]);
  // Sat papers with their sit-time prediction frozen in — the reality check
  // that feeds the recommender's paper gain factor back from evidence.
  const [paperOutcomeLog, setPaperOutcomeLog] = useState<PaperOutcomeRecord[]>([]);
  const [interventionOutcomes, setInterventionOutcomes] = useState<InterventionOutcomeRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Validate the complete projection before allowing any row into calibration.
  // Corruption stays on disk for recovery, with a visible error instead of
  // silently interpreting mixed-owner records as this learner's evidence.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const rows = await Promise.all(HISTORY_KINDS.map(kind => readLearnerHistory(kind,userId)));
        const validated = rows.map((values, index) => {
          if (values !== undefined && !Array.isArray(values)) throw new Error("Malformed learner history.");
          return (values ?? []).map(value => validateHistoryValue(HISTORY_KINDS[index]!, value, userId));
        });
        if (cancelled) return;
        setGradePredictionLog(validated[0] as unknown as GradePredictionRecord[]);
        setGradeActuals(validated[1] as unknown as ActualResultRecord[]);
        setPaperOutcomeLog(validated[2] as unknown as PaperOutcomeRecord[]);
        setInterventionOutcomes(validated[3] as unknown as InterventionOutcomeRecord[]);
        setLoaded(true);
      } catch (error) {
        if (!cancelled) onError(error instanceof Error ? error.message : "Could not load learner history.");
      }
    };
    const handleChange = () => { void refresh(); };
    void refresh();
    window.addEventListener(HISTORY_CHANGED_EVENT, handleChange);
    return () => { cancelled = true; window.removeEventListener(HISTORY_CHANGED_EVENT, handleChange); };
  }, [userId, onError]);

  const attempts = snapshot?.attempts;
  const questions = snapshot?.questions;
  const examDates = snapshot?.examDates;
  const targetGrades = snapshot?.settings.targetGrades;
  const assessment = useMemo(() => attempts && questions && examDates && targetGrades ? { attempts, questions, examDates, targetGrades } : null,
    [attempts, questions, examDates, targetGrades]);

  // Close the grade loop: snapshot predictions weekly so later mocks can be
  // paired against what Revise believed at the time - not retro-fitted.
  useEffect(() => {
    if (!loaded || !assessment || !predictions.length) return;
    void (async () => {
      const existing = (await readReviseMeta<GradePredictionRecord[]>("gradePredictions")) ?? [];
      const week = Math.floor(Date.now() / (7 * 86_400_000));
      let appended = false;
      for (const p of predictions) {
        const snapshotId = gradePredictionSnapshotId(userId, p.subjectId, week);
        if (existing.some((r) => r.id === snapshotId || r.id.startsWith(`${snapshotId}:`))) continue;
        const marked = assessment.attempts.filter((a) => a.subjectId === p.subjectId &&
          trustedSnapshotAttempt(a, assessment.questions, assessment.attempts)).length;
        const record: GradePredictionRecord = {
          // Separate observations from offline devices retain their own frozen truth.
          id: `${snapshotId}:${crypto.randomUUID()}`,
          anonId: userId,
          subjectId: p.subjectId,
          predictedPercent: p.percent,
          lowerPercent: Math.max(0, p.percent - (100 - p.confidence * 100) / 2),
          upperPercent: Math.min(100, p.percent + (100 - p.confidence * 100) / 2),
          gradeLabel: p.grade,
          confidence: p.confidence,
          evidenceShare: Math.min(1, marked / 40),
          createdAt: new Date().toISOString(),
          examDate: assessment.examDates.find((e) => e.subjectId === p.subjectId)?.date ?? null,
        };
        existing.push(record);
        appended = true;
      }
      if (appended) {
        await writeLearnerHistory("gradePredictions", userId, existing.slice(-500));
        setGradePredictionLog(await readLearnerHistory("gradePredictions", userId) as unknown as GradePredictionRecord[]);
      }
    })().catch(error => onError(error instanceof Error ? error.message : "Could not save forecast."));
  }, [predictions, assessment, userId, loaded, onError]);

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
    () => delayedFarTransferRetests({ attempts: attempts ?? [], questions: questions ?? [], today: todayIso() }),
    [attempts, questions],
  );

  const examReadiness = useMemo(() => {
    if (!assessment) return [];
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
        const timed = assessment.attempts.filter((attempt) => attempt.subjectId === subject.id && attempt.max > 0 &&
          trustedSnapshotAttempt(attempt, assessment.questions, assessment.attempts));
        const available = timed.reduce((sum, attempt) => sum + attempt.max, 0);
        const awarded = timed.reduce((sum, attempt) => sum + Math.max(0, Math.min(attempt.max, attempt.awarded)), 0);
        const pace = responseTimeCalibration.rows.find((row) => row.subjectId === subject.id);
        const transfers = farTransferRetests.filter((retest) => retest.subjectId === subject.id);
        const completedTransfers = transfers.filter((retest) => retest.status === "completed");
        const passedTransfers = completedTransfers.filter((retest) => retest.outcome?.passed).length;
        return [buildExamReadiness({
          subject,
          prediction,
          targetGrade: assessment.targetGrades[subject.id] ?? null,
          examDays: daysToExam(assessment.examDates, subject.id, todayIso()),
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
  }, [assessment, predictions, subjectIds, mastery, recallMastery, responseTimeCalibration.rows, farTransferRetests]);

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
    await writeLearnerHistory("gradeActuals", userId, next);
    setGradeActuals(await readLearnerHistory("gradeActuals", userId) as unknown as ActualResultRecord[]);
  }, [userId]);

  const removeGradeActual = useCallback(async (id: Id) => {
    const log = (await readReviseMeta<ActualResultRecord[]>("gradeActuals")) ?? [];
    const target = log.find((row) => row.id === id);
    if (!target || target.anonId !== userId) return;
    const next = log.filter((row) => row.id !== id);
    await writeLearnerHistory("gradeActuals", userId, next, [id]);
    setGradeActuals(await readLearnerHistory("gradeActuals", userId) as unknown as ActualResultRecord[]);
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
    await writeLearnerHistory("paperOutcomes", userId, next);
    setPaperOutcomeLog(await readLearnerHistory("paperOutcomes", userId) as unknown as PaperOutcomeRecord[]);
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
    await writeLearnerHistory("paperOutcomes", userId, next);
    setPaperOutcomeLog(await readLearnerHistory("paperOutcomes", userId) as unknown as PaperOutcomeRecord[]);
  }, [userId]);

  const recordInterventionOutcome = useCallback(async (outcome: InterventionOutcomeRecord) => {
    if (outcome.userId !== userId) throw new Error("Cannot record intervention evidence for another user.");
    const all = (await readReviseMeta<InterventionOutcomeRecord[]>("interventionOutcomes")) ?? [];
    const own = all.filter((row) => row.userId === userId);
    const nextOwn = [...own.filter((row) => row.id !== outcome.id), outcome];
    const nextAll = [...all.filter((row) => row.userId !== userId), ...nextOwn].slice(-2000);
    await writeLearnerHistory("interventionOutcomes", userId, nextAll);
    setInterventionOutcomes(await readLearnerHistory("interventionOutcomes", userId) as unknown as InterventionOutcomeRecord[]);
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
