"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { allSubjects, allTopics, getSubject } from "@/domain/curriculum";
import { misconceptionsForTopic, seedMisconceptions } from "@/content";
import { predictGrade } from "@/domain/grades";
import type { GradePrediction } from "@/domain/grades";
import { computeTopicMastery } from "@/domain/mastery";
import {
  evaluateMistakeRetest,
  mistakesFromAttempt,
} from "@/domain/mistakes";
import { advanceMistakeRepair, deferRepairAfterRetrieval, repairTargetParts } from "@/domain/repair-evidence";
import { computeApplicationMastery } from "@/domain/application-mastery";
import { trustedAssessmentContent } from "@/domain/physics-content-review";
import { computeRecallMastery } from "@/domain/recall-mastery";
import { masteryIntervals } from "@/domain/mastery-uncertainty";
import { tallyMisconceptions, type MisconceptionTally } from "@/domain/misconception-library";
import { rescheduleMissed } from "@/domain/planner";
import type { PhaseNotice } from "@/domain/phase-notice";
import { recommend } from "@/domain/recommender";
import type { AdaptiveSessionPlan } from "@/domain/adaptive-session";
import { reviewedWjecTopicEdges } from "@/content/capabilities";
import { requiresWjecContentReview } from "@/domain/physics-content-review";
import {
  knowledgeVsAnswering,
  knowledgeVsAnsweringByTopic,
  type KnowledgeAnsweringReport,
} from "@/domain/exam-technique";
import {
  type PaperOutcomeReview,
  type PaperOutcomeRecord,
} from "@/domain/paper-outcome";
import type { ExamReadiness, ExamReadinessSummary } from "@/domain/exam-readiness";
import type { RevisionTwinChoice, RevisionTwinReport, RevisionTwinSession, RevisionTwinState } from "@/domain/revision-twin";
import { gradeCard, isDue, todayIso } from "@/domain/scheduling";
import { getDeviceIdentity, nextLamport } from "@/data/device";
import { addXp, newlyUnlocked, touchStreak, unlockedAchievements, XP } from "@/domain/gamification";
import { calibrateFromHistory, simulatePaper } from "@/domain/assessment";
import { calibrateDifficulty } from "@/domain/knowledge-tracing";
import type { DifficultyCalibrationReport, QuestionTrace } from "@/domain/knowledge-tracing";
import { calculateCalculationMastery } from "@/domain/calculation-mastery";
import type { CalculationMasteryReport } from "@/domain/calculation-mastery";
import {
  adaptiveDifficultyCalibration,
  buildPredictionOutcomePairs,
  predictionOutcomeReport,
  sparseEvidenceConfidence as buildSparseEvidenceConfidence,
} from "@/domain/learning-controls";
import type {
  AdaptiveDifficultyReport,
  PredictionOutcomeReport,
  SparseEvidenceConfidenceReport,
} from "@/domain/learning-controls";
import { questionExposureReport } from "@/domain/question-exposure";
import type { QuestionExposureReport } from "@/domain/question-exposure";
import { prerequisiteEdges, rootPrerequisiteRemediation as buildRootPrerequisiteRemediation } from "@/domain/prerequisites";
import type { RootPrerequisiteRemediation } from "@/domain/prerequisites";
import { validateFsrs } from "@/domain/fsrs-tuning";
import type { FsrsValidation } from "@/domain/fsrs-tuning";
import { buildResponseTimeCalibration } from "@/domain/response-time-calibration";
import type { ResponseTimeCalibrationReport } from "@/domain/response-time-calibration";
import type {
  AssessmentInsight,
  Attempt,
  Calibration,
  Card,
  ExamDate,
  GamificationStats,
  Id,
  LessonProgress,
  Mistake,
  Paper,
  PaperSimulation,
  PlannedSession,
  Question,
  Recommendation,
  RecallGrade,
  ReviewLog,
  StreakState,
  TopicMastery,
  UserSettings,
  InterventionOutcomeRecord,
} from "@/domain/types";
import type { ApplicationMasteryRow } from "@/domain/application-mastery";
import type { RecallMasteryRow } from "@/domain/recall-mastery";
import type { MasteryInterval } from "@/domain/mastery-uncertainty";
import * as repo from "@/data/repository";
import { LOCAL_USER_ID, defaultLessonProgress } from "@/data/repository";
import type { Snapshot } from "@/data/repository";
import { domainEngine } from "@/data/domain-engine";
import { readReviseMeta, writeReviseMeta } from "@/data/storage-namespace";
import { attachDelayedRetentionOutcome, attachTransferOutcome, createInterventionOutcome } from "@/domain/intervention-calibration";
import type { InterventionCalibration } from "@/domain/intervention-calibration";
import { type FunnelEvent, type FunnelEventType } from "@/domain/funnel";
import { type ActualResultRecord, type GradePredictionRecord } from "@/domain/grade-loop";
import { policyTaskFor,
  type ExperimentAssignment, type ExperimentEventType } from "@/domain/recommendation-experiment";
import { StorageRecovery } from "@/components/StorageRecovery";
import { estimateStorageQuota } from "@/data/storage-quota";
import type { StorageQuota } from "@/data/storage-quota";
import type {
  RevisionCheckpoint,
  RevisionCheckpointInput,
} from "@/domain/revision-checkpoint";
// Domain-separated concerns (no behaviour change — pure moves out of the monolith):
import { currentActiveMinutes, touchSessionClock } from "./session-clock";
import { legacyLessonProgress, localDayKey, nextLessonStreak } from "./lesson-streak";
import { trustedSnapshotAttempt } from "./trusted-evidence";
import type { SyncStatus } from "./sync-status";
import { subjectsForSettings } from "./selectors";
// Responsibility modules: each owns its state, persistence and actions; the
// provider below only composes them with the derived learner model.
import { useSyncEngine } from "./sync-engine";
import { useExperiments } from "./experiments";
import { useOutcomes } from "./outcomes";
import { useRevisionSessions } from "./sessions";
import { usePlanning } from "./planning";

// ---------------------------------------------------------------------------
// Store composition. Revision data is small (thousands of rows at most), so
// the snapshot is held in memory and every derived value (mastery,
// recommendations, predicted grade) is recomputed on change — consistent by
// construction instead of by cache invalidation.
//
// What is persisted: Snapshot rows in IndexedDB (cards, logs, attempts,
// mistakes, plan, settings, lesson progress) + local meta (funnel, grade
// logs, twin, paper outcomes, interventions) via storage-namespace.
// What is derived: everything in useMemo below (mastery, dueCards,
// recommendations, adaptiveSession, readiness, calibrations).
// What causes writes: actions (reviewCard, recordAttempt, …) → repository.
// What causes synchronisation: syncNow() drain+pull (outbox → Supabase).
// ---------------------------------------------------------------------------

export type { SyncStatus };
export { nextLessonStreak };

interface StoreValue extends Snapshot {
  ready: boolean;
  /** True until the student has been through (or skipped) onboarding. */
  needsOnboarding: boolean;
  completeOnboarding(): Promise<void>;
  userId: Id;
  mastery: TopicMastery[];
  masteryUncertainty: MasteryInterval[];
  applicationMastery: ApplicationMasteryRow[];
  recallMastery: RecallMasteryRow[];
  recommendations: Recommendation[];
  /** One ranked, bounded sequence for the next focused learning window. */
  adaptiveSession: AdaptiveSessionPlan | null;
  predictions: GradePrediction[];
  dueCards: Card[];
  assessment: AssessmentInsight | null;
  /** Expected exam marks gained per study hour, keyed by topic. The metric the brief asks for. */
  marksPerHour: Map<Id, number>;
  /** Misconception-library entries the student keeps hitting, most frequent first. */
  recurringMisconceptions: MisconceptionTally[];
  /** Why the plan last changed itself, or null when nothing has. */
  replanSummary: string | null;
  /** What the latest manual rebuild changed, in plain language (empty = nothing material). */
  planChangelog: string[];
  /** One-time notice shown when a subject enters the timed-paper fortnight; null otherwise. */
  examPhaseNotice: PhaseNotice | null;
  calibrations: Map<Id, Calibration>;
  questionTraces: QuestionTrace[];
  difficultyCalibration: DifficultyCalibrationReport;
  calculationMastery: CalculationMasteryReport;
  sparseEvidenceConfidence: SparseEvidenceConfidenceReport;
  predictionOutcome: PredictionOutcomeReport;
  adaptiveDifficulty: AdaptiveDifficultyReport;
  forgettingCalibration: FsrsValidation;
  questionExposure: QuestionExposureReport;
  rootPrerequisiteRemediation: RootPrerequisiteRemediation[];
  revisionCheckpoint: RevisionCheckpoint | null;
  responseTimeCalibration: ResponseTimeCalibrationReport;
  syncStatus: SyncStatus;
  revisionTwin: RevisionTwinState;
  revisionTwinChoices: RevisionTwinChoice[];
  revisionTwinReport: RevisionTwinReport;
  examReadiness: ExamReadiness[];
  examReadinessSummary: ExamReadinessSummary;
  storageQuota: StorageQuota;
  refreshStorageQuota(): Promise<void>;
  /** Build a paper simulation for the given subject/paper without mutating state. */
  previewPaper(subjectId: Id, paperSpecId: Id, questionIds: Id[]): PaperSimulation | null;
  // actions
  reviewCard(card: Card, grade: RecallGrade, elapsedMs: number, confidence?: 1 | 2 | 3 | 4 | 5): Promise<void>;
  recordAttempt(attempt: Attempt, question: Question): Promise<Mistake[]>;
  addCards(cards: Card[]): Promise<void>;
  removeCard(id: Id): Promise<void>;
  /** Bulk save for the browser: tag edits, suspend, bury, field rewrites. */
  updateCards(cards: Card[]): Promise<void>;
  removeCards(ids: Id[]): Promise<void>;
  addQuestions(questions: Question[]): Promise<void>;
  addPaper(paper: Paper): Promise<void>;
  regeneratePlan(): Promise<void>;
  rescheduleMissedSessions(): Promise<void>;
  completeSession(sessionId: Id, status?: PlannedSession["status"]): Promise<void>;
  upsertExamDate(exam: ExamDate): Promise<void>;
  removeExamDate(id: Id): Promise<void>;
  updateSettings(patch: Partial<UserSettings>): Promise<void>;
  /** Re-evaluate countdown phases; surfaces a one-time notice when a subject enters the timed-paper fortnight. */
  refreshPhaseNotices(): Promise<void>;
  /** Clear the one-time phase notice (it never re-appears for the same run-up). */
  dismissExamPhaseNotice(): void;
  /** Mark one lesson finished and roll the lesson streak forward; returns the new progress. */
  completeLesson(lessonId: Id): Promise<LessonProgress>;
  saveRevisionCheckpoint(input: RevisionCheckpointInput): Promise<void>;
  clearRevisionCheckpoint(): Promise<void>;
  startRevisionTwinSession(choice: RevisionTwinChoice, title?: string): Promise<RevisionTwinSession>;
  completeRevisionTwinSession(id: Id, actualMarks: number, actualMinutes?: number): Promise<void>;
  abandonRevisionTwinSession(id: Id): Promise<void>;
  syncNow(): Promise<void>;
  experimentArm: ExperimentAssignment | null;
  joinExperiment(): Promise<void>;
  leaveExperiment(): Promise<void>;
  recordExperimentEvent(type: ExperimentEventType, task: { taskId: string; activity: string; topicId?: Id | null }, at?: string): Promise<void>;
  recordFunnel(type: FunnelEventType, detail?: string): Promise<void>;
  funnelEvents: FunnelEvent[];
  gradePredictionLog: GradePredictionRecord[];
  gradeActuals: ActualResultRecord[];
  paperOutcomeLog: PaperOutcomeRecord[];
  paperOutcomeGains: Map<Id, number>;
  recordGradeActual(input: { subjectId: Id; percent: number; kind: "mock" | "paper" | "final"; takenAt?: string; label?: string }): Promise<void>;
  removeGradeActual(id: Id): Promise<void>;
  beginPaperOutcome(input: { subjectId: Id; paperId: Id; paperRunId?: Id; predictedMarks: number; totalMarks: number }): Promise<void>;
  closePaperOutcome(paperRunId: Id, actualMarks: number, markingReview?: PaperOutcomeReview): Promise<void>;
  /** Immediate → transfer → delayed-retention intervention evidence. */
  interventionOutcomes: InterventionOutcomeRecord[];
  interventionCalibrations: Map<string, InterventionCalibration>;
  recordInterventionOutcome(outcome: InterventionOutcomeRecord): Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside <StoreProvider>");
  return value;
}

// Session clock, lesson streak, evidence trust, and sync coordination now
// live in ./session-clock, ./lesson-streak, ./trusted-evidence and
// ./sync-engine (pure moves + responsibility modules).

export function StoreProvider({ children, userId = LOCAL_USER_ID }: { children: ReactNode; userId?: Id }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [storageQuota, setStorageQuota] = useState<StorageQuota>(() => ({
    usageBytes: null,
    quotaBytes: null,
    percent: null,
    status: "unavailable",
    checkedAt: new Date().toISOString(),
  }));
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const bootstrapped = useRef(false);
  // Boot must never fail silently. If IndexedDB or a migration rejects, keep
  // the reason visible so the student can retry instead of staring at a
  // spinner forever.
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  // Plan/phase state lives in usePlanning (composed below, after mastery).
  // Heavy analytics run off-thread (Comlink worker) and land here when ready;
  // small histories compute synchronously inside the same effect. Until the
  // first compute lands these hold the same defaults the sync path returned.
  const [assessment, setAssessment] = useState<AssessmentInsight | null>(null);
  const [questionTraces, setQuestionTraces] = useState<QuestionTrace[]>([]);
  const [difficultyCalibration, setDifficultyCalibration] = useState<DifficultyCalibrationReport>(() => calibrateDifficulty([]));
  const [forgettingCalibration, setForgettingCalibration] = useState<FsrsValidation>(() => validateFsrs({ cards: [], logs: [] }));
  // Responsibility modules: sync/hydration, experiments/funnel. Outcome,
  // session and planning modules compose later, after the model they read.
  const { syncStatus, syncNow, startHydration } = useSyncEngine({ userId, snapshot, setSnapshot, setBootError });
  const {
    experimentArm,
    funnelEvents,
    loaded: experimentsLoaded,
    recordFunnel,
    joinExperiment,
    leaveExperiment,
    recordExperimentEvent,
  } = useExperiments(userId);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void recordFunnel("app_opened").catch(() => undefined);
    void (async () => {
      try {
        const loaded = await repo.loadSnapshot(userId);
        setSnapshot(loaded);
        // First page is on screen; stream the rest of history in the background.
        startHydration();
        // Import legacy localStorage lesson progress into the synced row once,
        // so the switch to cross-device storage never resets a student.
        const legacy = legacyLessonProgress();
        if (legacy && Object.keys(loaded.lessonProgress.completed).length === 0) {
          const migrated: LessonProgress = {
            ...loaded.lessonProgress,
            completed: legacy.completed,
            streak: legacy.streak,
            updatedAt: new Date().toISOString(),
          };
          await repo.saveLessonProgress(migrated);
          setSnapshot((prev) => (prev ? { ...prev, lessonProgress: migrated } : prev));
        }
        setNeedsOnboarding(!(await repo.hasOnboarded(userId)));
        setBootError(null);
        // A plan that has drifted into the past is worse than no plan: fold
        // missed sessions forward before the dashboard renders anything.
        const today = todayIso();
        const stale = loaded.plannedSessions.some((s) => s.date < today && s.status === "pending");
        if (stale) {
          const healed = rescheduleMissed(loaded.plannedSessions, today, 6);
          await repo.savePlan(healed);
          setSnapshot((prev) => (prev ? { ...prev, plannedSessions: healed } : prev));
        }
      } catch (error) {
        console.error("[store] boot failed", error);
        bootstrapped.current = false;
        setBootError(error instanceof Error ? error.message : "Could not load your revision data.");
      }
    })();
    // recordFunnel is a stable useCallback; startHydration likewise. The
    // exhaustive-deps lint flags them anyway on this long-lived boot effect
    // (pre-existing pattern in this file); both are intentionally stable.
  }, [userId, startHydration, recordFunnel, bootAttempt]);

  const refreshStorageQuota = useCallback(async () => {
    setStorageQuota(await estimateStorageQuota());
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void refreshStorageQuota().catch(() => undefined);
    });
    const timer = window.setInterval(() => void refreshStorageQuota().catch(() => undefined), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshStorageQuota]);

  const completeOnboarding = useCallback(async () => {
    await repo.markOnboarded(userId);
    setNeedsOnboarding(false);
  }, [userId]);

  const patch = useCallback((updater: (prev: Snapshot) => Snapshot) => {
    setSnapshot((prev) => (prev ? updater(prev) : prev));
  }, []);

  // --- derived state -------------------------------------------------------

  // Memoised so the identity is stable: every derived value below keys off
  // this array, and a fresh `[]` each render would recompute all of them.
  const subjectIds = useMemo(
    () => snapshot?.settings.subjectIds ?? [],
    [snapshot?.settings.subjectIds],
  );
  const topics = useMemo(() => allTopics(subjectIds), [subjectIds]);

  const mastery = useMemo(() => {
    if (!snapshot) return [];
    return computeTopicMastery({
      topics,
      cards: snapshot.cards,
      reviewLogs: snapshot.reviewLogs,
      attempts: snapshot.attempts,
      mistakes: snapshot.mistakes,
      questions: snapshot.questions,
      trustedQuestion: trustedAssessmentContent,
    });
  }, [snapshot, topics]);

  const recallMastery = useMemo(() => {
    if (!snapshot) return [];
    return computeRecallMastery({
      topics,
      cards: snapshot.cards,
      reviewLogs: snapshot.reviewLogs,
    });
  }, [snapshot, topics]);

  const masteryUncertainty = useMemo(() => {
    if (!snapshot) return [];

    const trustedAttempts = snapshot.attempts.filter((attempt) => trustedSnapshotAttempt(attempt, snapshot.questions, snapshot.attempts));
    const trustedAttemptIds = new Set(trustedAttempts.map((attempt) => attempt.id));
    const trustedQuestions = new Set(snapshot.questions.filter(trustedAssessmentContent).map((question) => question.id));
    const trustedMistakes = snapshot.mistakes.filter((mistake) => mistake.subjectId !== "wjec-alevel-physics" ||
      Boolean(mistake.attemptId && trustedAttemptIds.has(mistake.attemptId) && mistake.questionId && trustedQuestions.has(mistake.questionId)));

    const cardsByTopic = new Map<Id, Card[]>();
    for (const card of snapshot.cards) {
      const rows = cardsByTopic.get(card.topicId) ?? [];
      rows.push(card);
      cardsByTopic.set(card.topicId, rows);
    }

    const attemptsByTopic = new Map<Id, Attempt[]>();
    for (const attempt of trustedAttempts) {
      for (const topicId of attempt.topicIds) {
        const rows = attemptsByTopic.get(topicId) ?? [];
        rows.push(attempt);
        attemptsByTopic.set(topicId, rows);
      }
    }

    const mistakesByTopic = new Map<Id, Mistake[]>();
    for (const mistake of trustedMistakes) {
      const rows = mistakesByTopic.get(mistake.topicId) ?? [];
      rows.push(mistake);
      mistakesByTopic.set(mistake.topicId, rows);
    }

    return masteryIntervals({
      masteryByTopic: new Map(mastery.map((row) => [row.topicId, row.mastery] as const)),
      cardsByTopic,
      attemptsByTopic,
      mistakesByTopic,
    });
  }, [snapshot, mastery]);

  const applicationMastery = useMemo(() => {
    if (!snapshot) return [];
    return computeApplicationMastery({
      topics,
      questions: snapshot.questions,
      attempts: snapshot.attempts,
      trustedQuestion: trustedAssessmentContent,
    });
  }, [snapshot, topics]);

  const dueCards = useMemo(() => {
    if (!snapshot) return [];
    const today = todayIso();
    return snapshot.cards.filter((c) => subjectIds.includes(c.subjectId) && isDue(c, today));
  }, [snapshot, subjectIds]);

  // --- heavy analytics, off the main thread --------------------------------
  //
  // Assessment insight, question traces, difficulty calibration and FSRS
  // validation all scale with history and used to recompute synchronously in
  // useMemo after every grade — past ~5k attempts that stalls the render.
  // They now route through domainEngine (Comlink worker, same-thread fallback
  // for small histories) and land in state; every consumer keeps its exact
  // shape, so the UI is untouched. The Map used to key attempts by question
  // is rebuilt here per epoch — keys, not row contents, is what the compute
  // needs.
  const attemptsByQuestion = useMemo(() => {
    const map = new Map<Id, Attempt[]>();
    for (const attempt of snapshot?.attempts ?? []) {
      if (snapshot && !trustedSnapshotAttempt(attempt, snapshot.questions, snapshot.attempts)) continue;
      const rows = map.get(attempt.questionId) ?? [];
      rows.push(attempt);
      map.set(attempt.questionId, rows);
    }
    return map;
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false;
    (async () => {
      const questionsById = new Map(snapshot.questions.map((q) => [q.id, q] as const));
      const nextAssessment =
        snapshot.attempts.length || snapshot.mistakes.length
          ? await domainEngine.assess({
              attempts: snapshot.attempts,
              mistakes: snapshot.mistakes,
              mastery,
              questionsById,
            })
          : null;
      const traces = await domainEngine.trace({ questions: snapshot.questions, attemptsByQuestion });
      if (cancelled) return;
      setAssessment(nextAssessment);
      setQuestionTraces(traces);
    })();
    return () => {
      cancelled = true;
    };
    // mastery is intentionally excluded: it is recomputed from the same
    // snapshot in the same pass, and including it would double-fire the
    // effect on every grade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, attemptsByQuestion]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const calibrated = await domainEngine.calibrate({ traces: questionTraces });
      if (!cancelled) setDifficultyCalibration(calibrated);
    })();
    return () => {
      cancelled = true;
    };
  }, [questionTraces]);

  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false;
    (async () => {
      const validated = await domainEngine.validate({ cards: snapshot.cards, logs: snapshot.reviewLogs });
      if (!cancelled) setForgettingCalibration(validated);
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshot]);
  const calculationMastery = useMemo(() => {
    if (!snapshot) return calculateCalculationMastery({ questions: [], attempts: [], mistakes: [] });
    return calculateCalculationMastery({
      questions: snapshot.questions,
      attempts: snapshot.attempts,
      mistakes: snapshot.mistakes,
      trustedQuestion: trustedAssessmentContent,
    });
  }, [snapshot]);
  const sparseEvidenceConfidence = useMemo(() => {
    if (!snapshot) return buildSparseEvidenceConfidence({ topics: [], mastery: [], cards: [], attempts: [], mistakes: [] });
    return buildSparseEvidenceConfidence({
      topics,
      mastery,
      cards: snapshot.cards,
      attempts: snapshot.attempts,
      mistakes: snapshot.mistakes,
      questions: snapshot.questions,
    });
  }, [snapshot, topics, mastery]);
  const predictionOutcome = useMemo(() => {
    if (!snapshot) return predictionOutcomeReport([]);
    return predictionOutcomeReport(buildPredictionOutcomePairs({ attempts: snapshot.attempts, questions: snapshot.questions }));
  }, [snapshot]);
  const adaptiveDifficulty = useMemo(() => {
    if (!snapshot) return adaptiveDifficultyCalibration({ questions: [], traces: [] });
    return adaptiveDifficultyCalibration({ questions: snapshot.questions, traces: questionTraces });
  }, [snapshot, questionTraces]);
  const questionExposure = useMemo(() => {
    if (!snapshot) return questionExposureReport({ questions: [], attempts: [] });
    return questionExposureReport({ questions: snapshot.questions, attempts: snapshot.attempts });
  }, [snapshot]);

  const marksPerHour = useMemo(() => {
    if (!assessment) return new Map<Id, number>();
    return new Map(assessment.expectedMarksPerHour.map((r) => [r.topicId, r.value] as const));
  }, [assessment]);
  const rootPrerequisiteRemediation = useMemo(
    () => buildRootPrerequisiteRemediation({
      topics,
      mastery,
      marksPerHour,
      // The legacy topic graph remains useful for reference subjects, but
      // All four WJEC flagships require the exact capability-edge attestation.
      edges: [
        ...prerequisiteEdges().filter((edge) => !requiresWjecContentReview(edge.topicId.split(".")[0])),
        ...reviewedWjecTopicEdges(),
      ],
    }),
    [topics, mastery, marksPerHour],
  );

  const recurringMisconceptions = useMemo(
    () => {
      if (!snapshot) return [];
      const trustedAttemptIds = new Set(snapshot.attempts
        .filter((attempt) => trustedSnapshotAttempt(attempt, snapshot.questions, snapshot.attempts))
        .map((attempt) => attempt.id));
      const trustedQuestions = new Set(snapshot.questions.filter(trustedAssessmentContent).map((question) => question.id));
      const mistakes = snapshot.mistakes.filter((mistake) => mistake.subjectId !== "wjec-alevel-physics" ||
        Boolean(mistake.attemptId && trustedAttemptIds.has(mistake.attemptId) && mistake.questionId && trustedQuestions.has(mistake.questionId)));
      return tallyMisconceptions(mistakes, seedMisconceptions);
    },
    [snapshot],
  );

  // Calibration per subject from paper-mode attempts: predicted vs actual.
  // Paper attempts are the only ones with a stable "total marks" denominator.
  const calibrations = useMemo(() => {
    if (!snapshot) return new Map<Id, Calibration>();
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
    const out = new Map<Id, Calibration>();
    for (const [subjectId, pairs] of bySubject) {
      out.set(subjectId, calibrateFromHistory({ subjectId, pairs }));
    }
    // Ensure every enrolled subject has at least a neutral calibration
    for (const sid of subjectIds) if (!out.has(sid)) out.set(sid, { subjectId: sid, bias: 0, slope: 1, sampleSize: 0, mae: 0 });
    return out;
  }, [snapshot, mastery, subjectIds]);

  // --- session fatigue tracking ---------------------------------------------
  // The recommender needs time-on-task, but a ref read inside a render-path
  // memo trips the React-compiler lint — so the session clock is module-scoped
  // like syncInFlight/hydrationEpoch. It starts on the student's first graded
  // action; 30 idle minutes ends the session (fatigue resets for a fresh one).
  // Grading re-renders the store anyway, which refreshes the derived value.
  // Knowledge-vs-answering evidence, per enrolled subject and per topic —
  // the recommender steers on it (learn-first when knowledge-heavy, timed
  // practice when answering-heavy) and Today's hero can explain itself.
  const techniqueReports = useMemo(() => {
    const bySubject = new Map<Id, KnowledgeAnsweringReport>();
    const byTopic = new Map<Id, KnowledgeAnsweringReport>();
    if (!snapshot) return { bySubject, byTopic };
    for (const subjectId of subjectIds) {
      bySubject.set(
        subjectId,
        knowledgeVsAnswering({
          subjectId,
          mistakes: snapshot.mistakes,
          questions: snapshot.questions,
          attempts: snapshot.attempts,
        }),
      );
      for (const row of knowledgeVsAnsweringByTopic({
        subjectId,
        mistakes: snapshot.mistakes,
        questions: snapshot.questions,
        attempts: snapshot.attempts,
      })) {
        byTopic.set(row.topicId, row.report);
      }
    }
    return { bySubject, byTopic };
  }, [snapshot, subjectIds]);

  const predictions = useMemo(() => {
    if (!snapshot) return [];
    return subjectIds
      .map((id) => getSubject(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((subject) => predictGrade(subject, mastery, snapshot.attempts, snapshot.examDates, undefined, snapshot.questions));
  }, [snapshot, mastery, subjectIds]);

  const responseTimeCalibration = useMemo(
    () =>
      buildResponseTimeCalibration({
        attempts: snapshot?.attempts ?? [],
        questions: snapshot?.questions ?? [],
        papers: snapshot?.papers ?? [],
        subjects: allSubjects().filter((subject) => subjectIds.includes(subject.id)),
        trustedQuestion: trustedAssessmentContent,
      }),
    [snapshot, subjectIds],
  );

  // Assessment outcomes (grade/paper/intervention history) compose here so the
  // ranked recommendations below can read the paper gain factor back.
  const {
    loaded: outcomesLoaded,
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
  } = useOutcomes({
    userId,
    snapshot,
    predictions,
    subjectIds,
    mastery,
    recallMastery,
    responseTimeCalibration,
  });

  const recommendations = useMemo(() => {
    if (!snapshot) return [];
    return recommend({
      topics,
      mastery,
      cards: snapshot.cards,
      mistakes: snapshot.mistakes,
      questions: snapshot.questions,
      attempts: snapshot.attempts,
      exams: snapshot.examDates,
      plan: snapshot.plannedSessions,
      sessionLengthMinutes: snapshot.settings.sessionLengthMinutes,
      subjectIds,
      marksPerHour,
      techniqueSplit: techniqueReports.bySubject,
      techniqueByTopic: techniqueReports.byTopic,
      paperOutcomes: paperOutcomeLog,
      activeMinutes: currentActiveMinutes(),
      recallMastery,
      applicationMastery,
    });
  }, [snapshot, mastery, topics, subjectIds, marksPerHour, techniqueReports, paperOutcomeLog, recallMastery, applicationMastery]);

  // Unlike `recommendations`, this is not a list of competing activity
  // queues. It is one optimiser pass over the same snapshot, then one
  // sequence for the winning topic. Today and /adaptive-session consume this
  // exact value so the hero cannot drift from the route it opens. The memo
  // body lives after `examReadiness` (readiness gates adaptive stopping);
  // this binding keeps the return shape stable for consumers above it.

  // Experiment arm enforcement: baseline arms see their assigned policy,
  // not the production recommender. Control sees no recommendation.
  const experimentRecs = useMemo(() => {
    const arm = experimentArm?.arm;
    if (!arm || !snapshot) return recommendations;
    if (arm === "control") return [];
    if (arm !== "baseline-mastery" && arm !== "baseline-overdue") return recommendations;
    // Build mastery/due inputs for the policy
    const masteryRows = mastery.map((m) => ({
      topicId: m.topicId,
      mastery: m.mastery ?? 0,
      // Preserve the same recency tie-break used by the pure experiment
      // policy. Returning null here made equal-mastery topics appear random.
      lastStudiedAt: m.lastStudiedAt,
    }));
    const today = todayIso();
    const dueByTopic = new Map<Id, { count: number; oldestDue: string }>();
    for (const card of snapshot.cards) {
      if (card.due > today) continue;
      const current = dueByTopic.get(card.topicId) ?? { count: 0, oldestDue: card.due };
      dueByTopic.set(card.topicId, {
        count: current.count + 1,
        oldestDue: card.due < current.oldestDue ? card.due : current.oldestDue,
      });
    }
    const dueCounts = [...dueByTopic.entries()].map(([topicId, row]) => ({
      topicId, due: row.count, oldestDue: row.oldestDue,
    }));
    const pick = policyTaskFor(arm, { mastery: masteryRows, dueCounts });
    if (!pick || !pick.topicId) return recommendations;
    // Substitute the top recommendation with the baseline policy pick
    const base = recommendations.find((r) => r.topicId === pick.topicId);
    if (base) return [base, ...recommendations.slice(1)];
    // No matching rec ? construct one from the policy pick
    const fallback = recommendations[0];
    if (!fallback) return [];
    return [{ ...fallback, topicId: pick.topicId, reason: pick.reason }];
  }, [experimentArm, recommendations, mastery, snapshot]);

  // Revision session lifecycle (checkpoint + twin + the one adaptive plan)
  // composes here so twin choices and the plan read the ranked
  // recommendations and readiness above.
  const {
    loaded: sessionsLoaded,
    adaptiveSession,
    revisionCheckpoint,
    revisionTwin: twinState,
    revisionTwinChoices,
    revisionTwinReport: twinReport,
    saveRevisionCheckpoint,
    clearRevisionCheckpoint,
    startRevisionTwinSession,
    completeRevisionTwinSession,
    abandonRevisionTwinSession: abandonTwinSession,
  } = useRevisionSessions({
    userId,
    recommendations: experimentRecs,
    topics,
    cards: snapshot?.cards ?? [],
    reviewLogs: snapshot?.reviewLogs ?? [],
    questions: snapshot?.questions ?? [],
    attempts: snapshot?.attempts ?? [],
    mistakes: snapshot?.mistakes ?? [],
    mastery,
    exams: snapshot?.examDates ?? [],
    subjectIds,
    recallMastery,
    applicationMastery,
    readiness: examReadiness,
    interventionOutcomes,
  });
  const previewPaper = useCallback(
    (subjectId: Id, paperSpecId: Id, questionIds: Id[]): PaperSimulation | null => {
      if (!snapshot) return null;
      const subject = getSubject(subjectId);
      if (!subject) return null;
      const questions = questionIds.map((id) => snapshot.questions.find((q) => q.id === id)).filter((q): q is Question => Boolean(q));
      if (!questions.length) return null;
      const topicMastery = new Map(mastery.map((m) => [m.topicId, m.mastery]));
      return simulatePaper({ subject, paperSpecId, questions, topicMastery, calibration: calibrations.get(subjectId) });
    },
    [snapshot, mastery, calibrations],
  );

  // --- actions -------------------------------------------------------------

  const bumpGamification = useCallback(
    async (current: StreakState, xp: number, statsPatch: Partial<GamificationStats>, snap: Snapshot) => {
      const today = todayIso();
      let next = touchStreak(current, today);
      next = addXp(next, xp);
      const stats: GamificationStats = {
        reviews: snap.reviewLogs.length,
        attempts: snap.attempts.length,
        marksEarned: snap.attempts.reduce((a, x) => a + x.awarded, 0),
        papers: snap.papers.filter((p) => p.status === "practised").length,
        streak: next.current,
        masteredTopics: mastery.filter((m) => m.mastery >= 0.8).length,
        perfectSessions: 0,
        ...statsPatch,
      };
      const unlocked = newlyUnlocked(next.achievements, stats);
      if (unlocked.length) next = { ...next, achievements: unlockedAchievements(stats) };
      await repo.saveStreak(next);
      return next;
    },
    [mastery],
  );

  const reviewCard = useCallback<StoreValue["reviewCard"]>(
    async (card, grade, elapsedMs, confidence) => {
      const now = new Date();
      touchSessionClock(); // time-on-task feeds the recommender's fatigue penalty
      // CRDT: every grade gets a Lamport stamp so concurrent reviews on two
      // devices merge by replay instead of last-write-wins discarding one.
      const [deviceId, lamport] = await Promise.all([getDeviceIdentity().then((d) => d.deviceId), nextLamport()]);
      const updated = gradeCard(card, grade, now, { deviceId, lamport });
      const log: ReviewLog = {
        id: crypto.randomUUID(),
        userId,
        cardId: card.id,
        topicId: card.topicId,
        grade,
        confidence,
        elapsedMs,
        reviewedAt: now.toISOString(),
      };
      await repo.saveCard(updated);
      await repo.saveReviewLog(log);

      // Card recall updates retention, but cannot prove independent exam repair.
      const deferred = (snapshot?.mistakes ?? []).flatMap((mistake) => {
        const next = deferRepairAfterRetrieval(mistake, updated, log);
        return next === mistake ? [] : [next];
      });
      if (deferred.length) await repo.saveMistakes(deferred);

      setSnapshot((prev) => {
        if (!prev) return prev;
        const next: Snapshot = {
          ...prev,
          cards: prev.cards.map((c) => (c.id === updated.id ? updated : c)),
          reviewLogs: [...prev.reviewLogs, log],
          mistakes: prev.mistakes.map((mistake) => deferred.find((m) => m.id === mistake.id) ?? mistake),
        };
        void bumpGamification(
          prev.streak,
          grade === "again" ? XP.review : XP.correctReview,
          {},
          next,
        ).then((streak) => patch((p) => ({ ...p, streak })));
        return next;
      });
    },
    [userId, snapshot, bumpGamification, patch],
  );

  const recordAttempt = useCallback<StoreValue["recordAttempt"]>(
    async (attempt, question) => {
      touchSessionClock(); // time-on-task feeds the recommender's fatigue penalty
      const isRetest = Boolean(attempt.retestMistakeId);
      const retestMistake = isRetest
        ? snapshot?.mistakes.find((mistake) => mistake.id === attempt.retestMistakeId && !mistake.resolved)
        : undefined;
      if (isRetest && !retestMistake) {
        throw new Error("Cannot retest an unavailable or already resolved mistake.");
      }
      const retestEvaluation = retestMistake ? evaluateMistakeRetest(retestMistake, question, attempt, snapshot?.attempts, snapshot?.questions) : undefined;
      if (retestEvaluation?.status === "not-applicable") throw new Error("This question does not test the captured weakness.");
      const updatedMistakes = (snapshot?.mistakes ?? []).flatMap((mistake) => {
        const updated = advanceMistakeRepair(mistake, question, attempt, snapshot?.attempts, snapshot?.questions);
        return updated === mistake ? [] : [updated];
      });
      const updatedById = new Map(updatedMistakes.map((m) => [m.id, m]));

      // Prospective experiment telemetry: derive started/completed events
      // from the recorded attempt so no extra student action is required.
      if (experimentArm) {
        const expTopicId = question.topicIds[0] ?? attempt.topicIds[0] ?? null;
        const expTaskId = `${attempt.mode}:${expTopicId ?? question.subjectId}`;
        void recordExperimentEvent("started", { taskId: expTaskId, activity: attempt.mode, topicId: expTopicId }, new Date(new Date(attempt.createdAt).getTime() - Math.max(0, attempt.elapsedMs || 0)).toISOString());
        void recordExperimentEvent("completed", { taskId: expTaskId, activity: attempt.mode, topicId: expTopicId }, attempt.createdAt);
      }

      // A failed retest updates the original mistake in place. It must not
      // create another card for the same gap.
      const misconceptions = [...new Set(question.topicIds.flatMap((id) => misconceptionsForTopic(id)))];
      const repairedParts = new Set(updatedMistakes.flatMap((m) => repairTargetParts(m, question)));
      const drafts = mistakesFromAttempt(attempt, question, undefined, new Date(attempt.createdAt), misconceptions)
        .filter((draft) => !draft.mistake.partId || !repairedParts.has(draft.mistake.partId));
      await repo.saveLearningResult(attempt, [...updatedMistakes, ...drafts.map((d) => d.mistake)], drafts.map((d) => d.card));
      // Intervention evidence is appended only after the attempt is safely in
      // the learning-result transaction. Transfer and retention rungs attach
      // to the open chain from the same capability; they never manufacture a
      // durable result from an immediate same-question success.
      if (attempt.intervention) {
        const context = attempt.intervention;
        const all = (await readReviseMeta<InterventionOutcomeRecord[]>("interventionOutcomes")) ?? [];
        const current = all.filter((row) => row.userId === attempt.userId);
        const related = [...current].reverse().find((row) => row.userId === attempt.userId && row.capabilityId === context.capabilityId &&
          (row.activity ?? "question") === "question" &&
          Date.parse(row.createdAt) <= Date.parse(attempt.createdAt) &&
          (!context.chainId ? !row.chainId : row.chainId === context.chainId) &&
          (context.kind === "transfer" ? !row.transfer : context.kind === "retention" ? Boolean(row.transfer) && !row.delayedRetention : false));
        let next: InterventionOutcomeRecord[];
        if (related && context.kind === "transfer") {
          const updated = attachTransferOutcome(related, attempt, { question, questions: snapshot?.questions ?? [question], history: snapshot?.attempts ?? [] });
          next = [...current.filter((row) => row.id !== related.id), updated];
        } else if (related && context.kind === "retention") {
          const lastLearningAt = current.filter((row) => row.capabilityId === context.capabilityId && row.updatedAt < attempt.createdAt)
            .map((row) => row.updatedAt).sort().at(-1);
          const updated = attachDelayedRetentionOutcome(related, attempt, { question, questions: snapshot?.questions ?? [question], history: snapshot?.attempts ?? [], lastLearningAt });
          next = [...current.filter((row) => row.id !== related.id), updated];
        } else {
          const priorQuestionAt = current.filter((row) => row.capabilityId === context.capabilityId &&
            row.chainId === context.chainId && (row.activity ?? "question") === "question" && row.createdAt < attempt.createdAt)
            .map((row) => row.createdAt).sort().at(-1) ?? "";
          const supportObservations = current.filter((row) => row.capabilityId === context.capabilityId &&
            row.chainId === context.chainId && row.activity && row.activity !== "question" &&
            row.createdAt > priorQuestionAt && row.createdAt <= attempt.createdAt);
          const outcome = createInterventionOutcome({ userId: attempt.userId, subjectId: attempt.subjectId, context, attempt, question,
            actualMinutes: attempt.elapsedMs / 60_000 + supportObservations.reduce((sum, row) => sum + row.actualMinutes, 0),
            questions: snapshot?.questions ?? [question], history: snapshot?.attempts ?? [] });
          // Planned durations remain visible but cannot enter empirical gain.
          outcome.timeMeasured = outcome.timeMeasured === true && supportObservations.every((row) => row.timeMeasured === true);
          next = [...current, outcome];
        }
        const nextAll = [...all.filter((row) => row.userId !== attempt.userId), ...next].slice(-2000);
        await writeReviseMeta("interventionOutcomes", nextAll);
        if (attempt.userId === userId) setInterventionOutcomes(next);
      }
      setSnapshot((prev) => {
        if (!prev) return prev;
        const next: Snapshot = {
          ...prev,
          attempts: [...prev.attempts.filter((a) => a.id !== attempt.id), attempt],
          mistakes: [...prev.mistakes.map((mistake) => updatedById.get(mistake.id) ?? mistake), ...drafts.map((d) => d.mistake)],
          cards: [...prev.cards, ...drafts.map((d) => d.card)],
        };
        const retestXp = retestEvaluation?.status === "resolved" ? XP.mistakeResolved : 0;
        void bumpGamification(prev.streak, attempt.awarded * XP.attemptMark + retestXp, {}, next).then((streak) =>
          patch((p) => ({ ...p, streak })),
        );
        return next;
      });
      return [...updatedMistakes, ...drafts.map((d) => d.mistake)];
    },
    [bumpGamification, patch, snapshot, experimentArm, recordExperimentEvent, setInterventionOutcomes, userId],
  );

  const addCards = useCallback<StoreValue["addCards"]>(
    async (cards) => {
      if (!cards.length) return;
      await repo.saveCards(cards);
      patch((prev) => ({ ...prev, cards: [...prev.cards, ...cards] }));
    },
    [patch],
  );

  const removeCard = useCallback<StoreValue["removeCard"]>(
    async (id) => {
      await repo.deleteCard(id, userId);
      patch((prev) => ({ ...prev, cards: prev.cards.filter((c) => c.id !== id) }));
    },
    [patch, userId],
  );

  const updateCards = useCallback<StoreValue["updateCards"]>(
    async (updated) => {
      if (!updated.length) return;
      await repo.saveCards(updated);
      const byId = new Map(updated.map((c) => [c.id, c]));
      patch((prev) => ({ ...prev, cards: prev.cards.map((c) => byId.get(c.id) ?? c) }));
    },
    [patch],
  );

  const removeCards = useCallback<StoreValue["removeCards"]>(
    async (ids) => {
      if (!ids.length) return;
      await repo.deleteCards(ids, userId);
      const gone = new Set(ids);
      patch((prev) => ({ ...prev, cards: prev.cards.filter((c) => !gone.has(c.id)) }));
    },
    [patch, userId],
  );

  const addQuestions = useCallback<StoreValue["addQuestions"]>(
    async (questions) => {
      if (!questions.length) return;
      await repo.saveQuestions(questions);
      patch((prev) => ({ ...prev, questions: [...prev.questions, ...questions] }));
    },
    [patch],
  );

  const addPaper = useCallback<StoreValue["addPaper"]>(
    async (paper) => {
      await repo.savePaper(paper);
      patch((prev) => ({
        ...prev,
        papers: [...prev.papers.filter((p) => p.id !== paper.id), paper],
      }));
    },
    [patch],
  );

  // Adaptive timetable (plan rebuilds, session completion, exam dates,
  // settings, phase notices) composes here; it reads the snapshot and the
  // derived model above.
  const {
    replanSummary,
    planChangelog,
    examPhaseNotice,
    regeneratePlan,
    rescheduleMissedSessions,
    completeSession,
    upsertExamDate,
    removeExamDate,
    updateSettings,
    refreshPhaseNotices,
    dismissExamPhaseNotice,
  } = usePlanning({ userId, snapshot, setSnapshot, patch, topics, mastery, bumpGamification });

  const completeLesson = useCallback<StoreValue["completeLesson"]>(
    async (lessonId) => {
      const current = snapshot?.lessonProgress ?? defaultLessonProgress(userId);
      // Several lessons finished the same day still count as one streak day.
      const streak = nextLessonStreak(current.streak, localDayKey(), localDayKey(-1));
      const next: LessonProgress = {
        ...current,
        completed: { ...current.completed, [lessonId]: true },
        streak,
        updatedAt: new Date().toISOString(),
      };
      await repo.saveLessonProgress(next);
      patch((prev) => ({ ...prev, lessonProgress: next }));
      return next;
    },
    [patch, snapshot, userId],
  );

  const value: StoreValue | null = useMemo(() => {
    // First paint waits for the snapshot AND every module's mount load, which
    // is exactly what boot's single Promise.all guaranteed before the split.
    if (!snapshot || !experimentsLoaded || !outcomesLoaded || !sessionsLoaded) return null;
    return {
      ...snapshot,
      ready: true,
      needsOnboarding,
      completeOnboarding,
      userId,
      mastery,
      masteryUncertainty,
      applicationMastery,
      recallMastery,
      recommendations: experimentRecs,
      adaptiveSession,
      predictions,
      dueCards,
      assessment,
      marksPerHour,
      recurringMisconceptions,
      replanSummary,
      planChangelog,
      examPhaseNotice,
      calibrations,
      questionTraces,
      difficultyCalibration,
      calculationMastery,
      sparseEvidenceConfidence,
      predictionOutcome,
      adaptiveDifficulty,
      forgettingCalibration,
      questionExposure,
      rootPrerequisiteRemediation,
      revisionCheckpoint,
      responseTimeCalibration,
      revisionTwin: twinState,
      revisionTwinChoices,
      revisionTwinReport: twinReport,
      examReadiness,
      examReadinessSummary,
      storageQuota,
      refreshStorageQuota,
      previewPaper,
      syncStatus,
      reviewCard,
      recordAttempt,
      addCards,
      removeCard,
      updateCards,
      removeCards,
      addQuestions,
      addPaper,
      regeneratePlan,
      rescheduleMissedSessions,
      completeSession,
      upsertExamDate,
      removeExamDate,
      updateSettings,
      refreshPhaseNotices,
      dismissExamPhaseNotice,
      completeLesson,
      saveRevisionCheckpoint,
      clearRevisionCheckpoint,
      startRevisionTwinSession,
      completeRevisionTwinSession,
      abandonRevisionTwinSession: abandonTwinSession,
      syncNow,
      experimentArm,
      joinExperiment,
      leaveExperiment,
      recordExperimentEvent,
      recordFunnel,
      funnelEvents,
      gradePredictionLog,
      gradeActuals,
      paperOutcomeLog,
      paperOutcomeGains,
      recordGradeActual,
      removeGradeActual,
      beginPaperOutcome,
      closePaperOutcome,
      interventionOutcomes,
      interventionCalibrations,
      recordInterventionOutcome,
    };
  }, [
    snapshot,
    needsOnboarding,
    completeOnboarding,
    userId,
    mastery,
    masteryUncertainty,
    applicationMastery,
    recallMastery,
    experimentRecs,
    predictions,
    adaptiveSession,
    dueCards,
    assessment,
    marksPerHour,
    recurringMisconceptions,
    replanSummary,
    planChangelog,
    calibrations,
    questionTraces,
    difficultyCalibration,
    calculationMastery,
    sparseEvidenceConfidence,
    predictionOutcome,
    adaptiveDifficulty,
    forgettingCalibration,
    questionExposure,
    rootPrerequisiteRemediation,
    revisionCheckpoint,
    responseTimeCalibration,
    twinState,
    revisionTwinChoices,
    twinReport,
    examReadiness,
    examReadinessSummary,
    storageQuota,
    refreshStorageQuota,
    previewPaper,
    syncStatus,
    reviewCard,
    recordAttempt,
    addCards,
    removeCard,
    updateCards,
    removeCards,
    addQuestions,
    addPaper,
    regeneratePlan,
    rescheduleMissedSessions,
    completeSession,
    upsertExamDate,
    removeExamDate,
    updateSettings,
    refreshPhaseNotices,
    dismissExamPhaseNotice,
    examPhaseNotice,
    completeLesson,
    saveRevisionCheckpoint,
    clearRevisionCheckpoint,
    startRevisionTwinSession,
    completeRevisionTwinSession,
    abandonTwinSession,
    syncNow,
    experimentArm,
    joinExperiment,
    leaveExperiment,
    recordExperimentEvent,
    recordFunnel,
    funnelEvents,
    gradePredictionLog,
    gradeActuals,
    paperOutcomeLog,
    paperOutcomeGains,
    recordGradeActual,
    removeGradeActual,
    beginPaperOutcome,
    closePaperOutcome,
    interventionOutcomes,
    interventionCalibrations,
    recordInterventionOutcome,
    experimentsLoaded,
    outcomesLoaded,
    sessionsLoaded,
  ]);

  if (bootError) {
    return (
      <StorageRecovery
        error={new Error(bootError)}
        onRetry={() => {
          setBootError(null);
          bootstrapped.current = false;
          setBootAttempt((attempt) => attempt + 1);
        }}
      />
    );
  }
  if (!value) return <BootScreen />;
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function BootScreen({ error, onRetry }: { error?: string | null; onRetry?: () => void } = {}) {
  return (
    <div className="min-h-dvh grid place-items-center bg-bg">
      <div className="flex flex-col items-center gap-3 text-ink3 max-w-sm px-6 text-center">
        {error ? (
          <>
            <p className="text-sm text-ink">Could not load your revision data</p>
            <p className="text-xs text-ink3">{error}</p>
            <button type="button" className="btn btn-primary mt-2" onClick={onRetry}>
              Try again
            </button>
          </>
        ) : (
          <>
            <div className="flex gap-1.5" aria-hidden>
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
            <p className="text-sm">Loading your revision data…</p>
          </>
        )}
      </div>
    </div>
  );
}

/** Subjects the student is taking, in curriculum order (derived, not stored). */
export function useSubjects() {
  const { settings } = useStore();
  return useMemo(() => subjectsForSettings(settings), [settings]);
}
