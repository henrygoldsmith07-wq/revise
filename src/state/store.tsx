"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { allSubjects, allTopics, getSubject } from "@/domain/curriculum";
import { misconceptionsForTopic, seedMisconceptions } from "@/content";
import { predictGrade } from "@/domain/grades";
import type { GradePrediction } from "@/domain/grades";
import { computeTopicMastery } from "@/domain/mastery";
import {
  applyRetestToMistake,
  evaluateMistakeRetest,
  mistakesFromAttempt,
  shouldResolve,
} from "@/domain/mistakes";
import { computeApplicationMastery } from "@/domain/application-mastery";
import { computeRecallMastery } from "@/domain/recall-mastery";
import { masteryIntervals } from "@/domain/mastery-uncertainty";
import { tallyMisconceptions, type MisconceptionTally } from "@/domain/misconception-library";
import { buildPlan, rescheduleMissed, summarizePlanChange } from "@/domain/planner";
import { buildSubjectEvidence } from "@/domain/subject-allocation";
import { currentPhaseBuckets, techniqueEntryNotices } from "@/domain/phase-notice";
import type { PhaseBucket, PhaseNotice, PhaseSubject } from "@/domain/phase-notice";
import { computeFingerprint, fingerprintKey, replanDynamically, type ReplanFingerprint } from "@/domain/replan";
import { daysToExam, recommend } from "@/domain/recommender";
import {
  knowledgeVsAnswering,
  knowledgeVsAnsweringByTopic,
  type KnowledgeAnsweringReport,
} from "@/domain/exam-technique";
import {
  buildPaperOutcomeRecord,
  closePaperOutcome,
  paperOutcomeGainMultiplier,
  type PaperOutcomeRecord,
} from "@/domain/paper-outcome";
import { delayedFarTransferRetests } from "@/domain/delayed-far-transfer";
import { buildExamReadiness, summariseExamReadiness } from "@/domain/exam-readiness";
import type { ExamReadiness, ExamReadinessSummary } from "@/domain/exam-readiness";
import {
  abandonRevisionTwinSession,
  buildRevisionTwinChoices,
  completeRevisionTwinSession as completeTwinSession,
  createRevisionTwinSession,
  createRevisionTwinState,
  revisionTwinReport,
} from "@/domain/revision-twin";
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
import { rootPrerequisiteRemediation as buildRootPrerequisiteRemediation } from "@/domain/prerequisites";
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
} from "@/domain/types";
import type { ApplicationMasteryRow } from "@/domain/application-mastery";
import type { RecallMasteryRow } from "@/domain/recall-mastery";
import type { MasteryInterval } from "@/domain/mastery-uncertainty";
import * as repo from "@/data/repository";
import { LOCAL_USER_ID, defaultLessonProgress } from "@/data/repository";
import type { Snapshot } from "@/data/repository";
import { domainEngine } from "@/data/domain-engine";
import { SYNC_QUEUE_EVENT, outboxSize, sync } from "@/data/sync";
import { AI_DLQ_RESOLVED_EVENT, drainDeadMarks, type AiDlqResolvedDetail } from "@/ai/mark-dlq";
import { readReviseMeta, writeReviseMeta } from "@/data/storage-namespace";
import { type FunnelEvent, type FunnelEventType } from "@/domain/funnel";
import { type ActualResultRecord, type GradePredictionRecord } from "@/domain/grade-loop";
import { assignArm as assignExperimentArm, policyTaskFor,
  type ExperimentAssignment, type ExperimentEvent, type ExperimentEventType } from "@/domain/recommendation-experiment";
import { isSupabaseConfigured } from "@/data/supabase";
import { StorageRecovery } from "@/components/StorageRecovery";
import { estimateStorageQuota } from "@/data/storage-quota";
import type { StorageQuota } from "@/data/storage-quota";
import {
  createRevisionCheckpoint,
  type RevisionCheckpoint,
  type RevisionCheckpointInput,
} from "@/domain/revision-checkpoint";

// ---------------------------------------------------------------------------
// One store for the whole app. Revision data is small (thousands of rows at
// most), so it is held in memory and recomputed on change — that keeps every
// derived number (mastery, recommendations, predicted grade) consistent by
// construction instead of by cache invalidation. Writes go to IndexedDB first
// and the outbox second; the UI never awaits the network.
// ---------------------------------------------------------------------------

export interface SyncStatus {
  online: boolean;
  pending: number;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  enabled: boolean;
  syncing: boolean;
}

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
  recordGradeActual(subjectId: Id, percent: number, kind: "mock" | "paper" | "final"): Promise<void>;
  beginPaperOutcome(input: { subjectId: Id; paperId: Id; paperRunId?: Id; predictedMarks: number; totalMarks: number }): Promise<void>;
  closePaperOutcome(paperRunId: Id, actualMarks: number): Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside <StoreProvider>");
  return value;
}

let syncInFlight = false;
// Module-scoped like syncInFlight: counts background-hydration runs so a
// superseded stream can detect it was replaced. Deliberately not a ref — the
// epoch is coordination state for background work, never render input.
let hydrationEpoch = 0;

// --- session fatigue clock (module-scoped, like syncInFlight) ---------------
// Timestamp of the first graded action of the current study session, or null
// when no session is running. The recommender derives time-on-task from it to
// apply fatigue penalties; 30 idle minutes ends the session.
let sessionStartedAt: number | null = null;
const SESSION_IDLE_RESET_MS = 30 * 60_000;

/** Record a graded action as session activity; called from review/record paths. */
function touchSessionClock(): void {
  const now = Date.now();
  if (sessionStartedAt == null || now - sessionStartedAt > SESSION_IDLE_RESET_MS) sessionStartedAt = now;
}

/** Minutes of continuous study in the current session (0 when none/idle-ended). */
function currentActiveMinutes(): number {
  if (sessionStartedAt == null) return 0;
  const elapsed = (Date.now() - sessionStartedAt) / 60_000;
  return elapsed > SESSION_IDLE_RESET_MS / 60_000 ? 0 : elapsed;
}

/**
 * One-time migration: before lesson progress moved into the synced store it
 * lived in localStorage (revise.lessons.*). Returns the legacy values when
 * they exist, so existing students keep their progress across the switch.
 */
function legacyLessonProgress(): { completed: Record<string, boolean>; streak: { count: number; lastDay: string } } | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const completedRaw = localStorage.getItem("revise.lessons.completed");
    if (!completedRaw) return null;
    const completed = JSON.parse(completedRaw) as Record<string, boolean>;
    const streakRaw = localStorage.getItem("revise.lessons.streak");
    const streak = streakRaw ? (JSON.parse(streakRaw) as { count: number; lastDay: string }) : { count: 0, lastDay: "" };
    return Object.keys(completed).length ? { completed, streak } : null;
  } catch {
    return null;
  }
}

/** Local-time YYYY-MM-DD for lesson streaks (a day flips at midnight, not UTC). */
function localDayKey(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Pure streak roll used by completeLesson. Several lessons finished the same
 * day count as one streak day; a lesson on the day after the last one extends
 * the streak; any longer gap restarts it.
 */
export function nextLessonStreak(
  current: { count: number; lastDay: string },
  today: string,
  yesterday: string,
): { count: number; lastDay: string } {
  if (current.lastDay === today) return current;
  if (current.lastDay === yesterday) return { count: current.count + 1, lastDay: today };
  return { count: 1, lastDay: today };
}

export function StoreProvider({ children, userId = LOCAL_USER_ID }: { children: ReactNode; userId?: Id }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [revisionCheckpoint, setRevisionCheckpoint] = useState<RevisionCheckpoint | null>(null);
  const [experimentArm, setExperimentArm] = useState<ExperimentAssignment | null>(null);
  const [funnelEvents, setFunnelEvents] = useState<FunnelEvent[]>([]);
  const [gradePredictionLog, setGradePredictionLog] = useState<GradePredictionRecord[]>([]);
  const [gradeActuals, setGradeActuals] = useState<ActualResultRecord[]>([]);
  const [revisionTwin, setRevisionTwin] = useState<RevisionTwinState | null>(null);
  const [storageQuota, setStorageQuota] = useState<StorageQuota>(() => ({
    usageBytes: null,
    quotaBytes: null,
    percent: null,
    status: "unavailable",
    checkedAt: new Date().toISOString(),
  }));
  // Sat papers with their sit-time prediction frozen in — the reality check
  // that feeds the recommender's paper gain factor back from evidence.
  const [paperOutcomeLog, setPaperOutcomeLog] = useState<PaperOutcomeRecord[]>([]);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    online: true,
    pending: 0,
    lastSyncedAt: null,
    lastSyncError: null,
    enabled: isSupabaseConfigured,
    syncing: false,
  });
  const bootstrapped = useRef(false);
  // Boot must never fail silently. If IndexedDB or a migration rejects, keep
  // the reason visible so the student can retry instead of staring at a
  // spinner forever.
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [replanSummary, setReplanSummary] = useState<string | null>(null);
  const [planChangelog, setPlanChangelog] = useState<string[]>([]);
  const [examPhaseNotice, setExamPhaseNotice] = useState<PhaseNotice | null>(null);
  // Heavy analytics run off-thread (Comlink worker) and land here when ready;
  // small histories compute synchronously inside the same effect. Until the
  // first compute lands these hold the same defaults the sync path returned.
  const [assessment, setAssessment] = useState<AssessmentInsight | null>(null);
  const [questionTraces, setQuestionTraces] = useState<QuestionTrace[]>([]);
  const [difficultyCalibration, setDifficultyCalibration] = useState<DifficultyCalibrationReport>(() => calibrateDifficulty([]));
  const [forgettingCalibration, setForgettingCalibration] = useState<FsrsValidation>(() => validateFsrs({ cards: [], logs: [] }));
  const lastFingerprint = useRef<ReplanFingerprint | null>(null);

  // --- progressive history hydration ---------------------------------------
  //
  // Boot loads only the newest HISTORY_FIRST_PAGE review logs / attempts so
  // first paint never waits on a 5,000-row history. This streams the rest in
  // background chunks (IndexedDB cursor, oldest-first) and merges each chunk
  // exactly once, keyed by row id so a row that arrived via a newer functional
  // update is never clobbered by its older streamed copy. A sync-pull reload
  // calls startHydration() again, superseding any stream still running.
  const hydrateHistory = useCallback(async (epoch: number) => {
    for await (const chunk of repo.streamHistory(repo.HISTORY_CHUNK, userId)) {
      if (epoch !== hydrationEpoch) return; // superseded by a reload
      const { reviewLogs, attempts } = chunk;
      if (!reviewLogs?.length && !attempts?.length) continue;
      setSnapshot((prev) => {
        if (!prev) return prev;
        let nextLogs = prev.reviewLogs;
        if (reviewLogs?.length) {
          const known = new Set(prev.reviewLogs.map((l) => l.id));
          const fresh = reviewLogs.filter((l) => !known.has(l.id));
          if (fresh.length) nextLogs = [...fresh, ...prev.reviewLogs];
        }
        let nextAttempts = prev.attempts;
        if (attempts?.length) {
          const known = new Set(prev.attempts.map((a) => a.id));
          const fresh = attempts.filter((a) => !known.has(a.id));
          if (fresh.length) nextAttempts = [...fresh, ...prev.attempts];
        }
        if (nextLogs === prev.reviewLogs && nextAttempts === prev.attempts) return prev;
        return { ...prev, reviewLogs: nextLogs, attempts: nextAttempts };
      });
    }
  }, [userId]);
  /** Start (or restart, superseding any prior run) background history hydration. */
  const startHydration = useCallback(() => {
    hydrationEpoch += 1;
    void hydrateHistory(hydrationEpoch).catch((error) => {
      // A stream can fail after the first page has rendered (for example when
      // a later IndexedDB row is malformed). Route it through the same
      // recovery UI as boot failures instead of leaving a rejected promise.
      setBootError(error instanceof Error ? error.message : String(error));
    });
  }, [hydrateHistory]);

  const recordFunnel = useCallback(async (type: FunnelEventType, detail?: string) => {
    const now = Date.now();
    const windows: Record<FunnelEventType, number> = { app_opened: 3_600_000, recommendation_displayed: 6 * 3_600_000, recommendation_accepted: 0, feedback_read: 0 };
    const existing = ((await readReviseMeta<Array<{ anonId: string; type: FunnelEventType; at: string; detail?: string }>>("funnelEvents")) ?? []);
    let last: number | null = null;
    for (let i = existing.length - 1; i >= 0; i--) {
      const e = existing[i];
      if (e.type !== type || (detail != null && e.detail !== detail)) continue;
      last = new Date(e.at).getTime();
      break;
    }
    if (type !== "recommendation_accepted" && type !== "feedback_read" && last != null && now - last < windows[type]) return;
    const log = existing;
    const nextFunnel = [...log.slice(-2000), { anonId: userId, type, at: new Date(now).toISOString(), detail }];
    await writeReviseMeta("funnelEvents", nextFunnel);
    setFunnelEvents(nextFunnel);
  }, [userId]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void recordFunnel("app_opened").catch(() => undefined);
    void (async () => {
      try {
        const [loaded, checkpoint, assignment, funnel, gradePreds, gradeActs, twin, paperOutcomes] = await Promise.all([
          repo.loadSnapshot(userId),
          repo.loadRevisionCheckpoint(userId),
          readReviseMeta<ExperimentAssignment>("experimentAssignment"),
          readReviseMeta<FunnelEvent[]>("funnelEvents"),
          readReviseMeta<GradePredictionRecord[]>("gradePredictions"),
          readReviseMeta<ActualResultRecord[]>("gradeActuals"),
          repo.loadRevisionTwin(userId),
          readReviseMeta<PaperOutcomeRecord[]>("paperOutcomes"),
        ]);
        setRevisionCheckpoint(checkpoint ?? null);
        setExperimentArm(assignment ?? null);
        setFunnelEvents(funnel ?? []);
        setGradePredictionLog(gradePreds ?? []);
        setGradeActuals(gradeActs ?? []);
        setRevisionTwin(twin ?? createRevisionTwinState(userId));
        setPaperOutcomeLog(paperOutcomes ?? []);
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
        lastFingerprint.current = computeFingerprint({
          exams: loaded.examDates,
          targetGrades: loaded.settings.targetGrades,
          availability: loaded.settings.availability,
          sessionLengthMinutes: loaded.settings.sessionLengthMinutes,
          subjectIds: loaded.settings.subjectIds,
        });
        setNeedsOnboarding(!(await repo.hasOnboarded(userId)));
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
        setBootError(error instanceof Error ? error.message : String(error));
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

  // Network status drives the offline banner and gates sync attempts.
  useEffect(() => {
    const update = () => {
      const online = navigator.onLine;
      setSyncStatus((s) => ({ ...s, online, lastSyncError: online ? s.lastSyncError : null }));
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Local writes enqueue after IndexedDB succeeds. Reflect that immediately so
  // offline work is visibly safe instead of waiting for the next retry timer.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const refreshPending = () => {
      void outboxSize(userId).then((pending) => setSyncStatus((s) => ({ ...s, pending })));
    };
    refreshPending();
    window.addEventListener(SYNC_QUEUE_EVENT, refreshPending);
    return () => window.removeEventListener(SYNC_QUEUE_EVENT, refreshPending);
  }, [userId]);

  // --- AI marking resilience: DLQ drain + in-place mark upgrades -----------
  //
  // Marks that fell back to the rubric (offline, 429, provider down) sit in
  // the dead-letter queue. When the tab is online we drain a small batch on a
  // slow timer — backoff+jitter inside the drain keeps the free-tier endpoint
  // safe — and when a retry succeeds the stored attempt is upgraded, so the
  // student's history ends up AI-graded without them doing anything.
  useEffect(() => {
    if (!syncStatus.online) return;
    let cancelled = false;
    const drain = () => {
      if (!cancelled) void drainDeadMarks();
    };
    drain(); // catch up on backlog as soon as we're online
    const timer = setInterval(drain, 90_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [syncStatus.online]);

  // A successful DLQ re-grade already wrote through the repository; reflect
  // it in the in-memory snapshot so open views re-render without a reload.
  useEffect(() => {
    function onResolved(event: Event) {
      const detail = (event as CustomEvent<AiDlqResolvedDetail>).detail;
      if (!detail?.attempt) return;
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              attempts: prev.attempts.some((a) => a.id === detail.attempt.id)
                ? prev.attempts.map((a) => (a.id === detail.attempt.id ? detail.attempt : a))
                : [detail.attempt, ...prev.attempts],
            }
          : prev,
      );
    }
    window.addEventListener(AI_DLQ_RESOLVED_EVENT, onResolved);
    return () => window.removeEventListener(AI_DLQ_RESOLVED_EVENT, onResolved);
  }, []);

  const completeOnboarding = useCallback(async () => {
    await repo.markOnboarded(userId);
    setNeedsOnboarding(false);
  }, [userId]);

  const syncNow = useCallback(async () => {
    if (!isSupabaseConfigured || syncInFlight) return;
    syncInFlight = true;
    setSyncStatus((s) => ({ ...s, syncing: true }));
    try {
      const result = await sync(userId);
      const pending = await outboxSize(userId);
      const error =
        result.failed > 0
          ? "Some changes are still waiting to sync. We’ll keep trying."
          : result.skipped === "signed-out"
            ? "Sign in to sync across devices. Your data is still saved here."
            : null;
      setSyncStatus((s) => ({
        ...s,
        syncing: false,
        pending,
        lastSyncedAt: result.skipped || result.failed > 0 ? s.lastSyncedAt : new Date().toISOString(),
        lastSyncError: error,
      }));
      if (result.pulled > 0) {
        setSnapshot(await repo.loadSnapshot(userId));
        // History changed server-side; restart hydration from the fresh
        // baseline, superseding any stream still running.
        startHydration();
      }
    } catch (caught) {
      // Keep a diagnostic trail instead of swallowing the failure: without it,
      // a permanently broken sync looks identical to a slow one.
      console.warn("[sync] failed", caught);
      const pending = await outboxSize(userId);
      setSyncStatus((s) => ({
        ...s,
        syncing: false,
        pending,
        lastSyncError: "Sync is unavailable right now. Your data is still saved on this device.",
      }));
    } finally {
      syncInFlight = false;
    }
  }, [userId, startHydration]);

  useEffect(() => {
    if (!isSupabaseConfigured || !snapshot || !syncStatus.online) return;
    // Debounced rather than per-write: snapshot changes on every graded card,
    // and a full drain+pull cycle per keystroke would hammer the network while
    // a session runs. The interval covers quiet periods.
    const first = setTimeout(() => void syncNow(), 5_000);
    const timer = setInterval(() => void syncNow(), 120_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [snapshot, syncNow, syncStatus.online]);

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

    const cardsByTopic = new Map<Id, Card[]>();
    for (const card of snapshot.cards) {
      const rows = cardsByTopic.get(card.topicId) ?? [];
      rows.push(card);
      cardsByTopic.set(card.topicId, rows);
    }

    const attemptsByTopic = new Map<Id, Attempt[]>();
    for (const attempt of snapshot.attempts) {
      for (const topicId of attempt.topicIds) {
        const rows = attemptsByTopic.get(topicId) ?? [];
        rows.push(attempt);
        attemptsByTopic.set(topicId, rows);
      }
    }

    const mistakesByTopic = new Map<Id, Mistake[]>();
    for (const mistake of snapshot.mistakes) {
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
      const rows = map.get(attempt.questionId) ?? [];
      rows.push(attempt);
      map.set(attempt.questionId, rows);
    }
    return map;
  }, [snapshot?.attempts]);

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
    () => buildRootPrerequisiteRemediation({ topics, mastery, marksPerHour }),
    [topics, mastery, marksPerHour],
  );

  const recurringMisconceptions = useMemo(
    () => (snapshot ? tallyMisconceptions(snapshot.mistakes, seedMisconceptions) : []),
    [snapshot],
  );

  // Dynamic replanning: when an input the plan depends on changes (exam date,
  // target grade, availability, session length or subject set), rebuild the
  // pending future sessions automatically and say why. The fingerprint lives
  // in a ref so replanning never triggers an extra render.
  useEffect(() => {
    if (!snapshot) return;
    const current = computeFingerprint({
      exams: snapshot.examDates,
      targetGrades: snapshot.settings.targetGrades,
      availability: snapshot.settings.availability,
      sessionLengthMinutes: snapshot.settings.sessionLengthMinutes,
      subjectIds: snapshot.settings.subjectIds,
    });
    if (lastFingerprint.current === null) {
      lastFingerprint.current = current;
      return;
    }
    if (fingerprintKey(current) === fingerprintKey(lastFingerprint.current)) return;
    const previous = lastFingerprint.current;
    lastFingerprint.current = current;
    void (async () => {
      const result = replanDynamically({
        userId,
        topics,
        subjects: allSubjects().filter((s) => snapshot.settings.subjectIds.includes(s.id)),
        mastery,
        exams: snapshot.examDates,
        availability: snapshot.settings.availability,
        sessionLengthMinutes: snapshot.settings.sessionLengthMinutes,
        subjectIds: snapshot.settings.subjectIds,
        targetGrades: snapshot.settings.targetGrades,
        evidence: buildSubjectEvidence(snapshot.cards, snapshot.mistakes, snapshot.attempts, todayIso()),
        existing: snapshot.plannedSessions,
        previous,
      });
      if (result.changed) {
        await repo.replacePlan(userId, result.plan);
        setSnapshot((prev) => (prev ? { ...prev, plannedSessions: result.plan } : prev));
      }
      setReplanSummary(result.summary);
    })();
  }, [snapshot, userId, topics, mastery]);

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

  const responseTimeCalibration = useMemo(
    () =>
      buildResponseTimeCalibration({
        attempts: snapshot?.attempts ?? [],
        questions: snapshot?.questions ?? [],
        papers: snapshot?.papers ?? [],
        subjects: allSubjects().filter((subject) => subjectIds.includes(subject.id)),
      }),
    [snapshot, subjectIds],
  );

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

  // Per-subject multiplier for paper recommendations: >1 when sat papers keep
  // beating their frozen predictions (more headroom than the model sees), <1
  // when they fall short. 1.0 with fewer than two recorded outcomes.
  const paperOutcomeGains = useMemo(() => {
    const out = new Map<Id, number>();
    if (!snapshot) return out;
    for (const subjectId of subjectIds) {
      out.set(subjectId, paperOutcomeGainMultiplier(paperOutcomeLog, subjectId));
    }
    return out;
  }, [snapshot, subjectIds, paperOutcomeLog]);

  const recommendations = useMemo(() => {
    if (!snapshot) return [];
    return recommend({
      topics,
      mastery,
      cards: snapshot.cards,
      mistakes: snapshot.mistakes,
      exams: snapshot.examDates,
      plan: snapshot.plannedSessions,
      sessionLengthMinutes: snapshot.settings.sessionLengthMinutes,
      subjectIds,
      marksPerHour,
      techniqueSplit: techniqueReports.bySubject,
      techniqueByTopic: techniqueReports.byTopic,
      paperOutcomes: paperOutcomeLog,
      activeMinutes: currentActiveMinutes(),
    });
  }, [snapshot, mastery, topics, subjectIds, marksPerHour, techniqueReports, paperOutcomeLog]);

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
      lastStudiedAt: null as string | null,
    }));
    const today = todayIso();
    const dueByTopic = new Map<Id, number>();
    for (const card of snapshot.cards) {
      if (card.due <= today) dueByTopic.set(card.topicId, (dueByTopic.get(card.topicId) ?? 0) + 1);
    }
    const dueCounts = [...dueByTopic.entries()].map(([topicId, due]) => ({
      topicId, due, oldestDue: today as string,
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

  const predictions = useMemo(() => {
    if (!snapshot) return [];
    return subjectIds
      .map((id) => getSubject(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((subject) => predictGrade(subject, mastery, snapshot.attempts, snapshot.examDates));
  }, [snapshot, mastery, subjectIds]);

  const farTransferRetests = useMemo(
    () => delayedFarTransferRetests({ attempts: snapshot?.attempts ?? [], questions: snapshot?.questions ?? [], today: todayIso() }),
    [snapshot],
  );

  const twinState = useMemo(() => revisionTwin ?? createRevisionTwinState(userId), [revisionTwin, userId]);
  const twinReport = useMemo(() => revisionTwinReport(twinState), [twinState]);
  const revisionTwinChoices = useMemo(
    () => buildRevisionTwinChoices({ recommendations: experimentRecs, sessions: twinState.sessions }),
    [experimentRecs, twinState.sessions],
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
        const timed = snapshot.attempts.filter((attempt) => attempt.subjectId === subject.id && attempt.max > 0);
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
  // Close the grade loop: snapshot predictions weekly so later mocks can be
  // paired against what Revise believed at the time - not retro-fitted.
  useEffect(() => {
    if (!snapshot || !predictions.length) return;
    void (async () => {
      const existing = (await readReviseMeta<GradePredictionRecord[]>("gradePredictions")) ?? [];
      const week = Math.floor(Date.now() / (7 * 86_400_000));
      let appended = false;
      for (const p of predictions) {
        const weekKey = `${p.subjectId}:${week}`;
        if (existing.some((r) => r.id === `gp-${weekKey}`)) continue;
        const marked = snapshot.attempts.filter((a) => a.subjectId === p.subjectId && a.max > 0).length;
        const record: GradePredictionRecord = {
          id: `gp-${weekKey}`,
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

      // A mistake card that has been recalled reliably closes its mistake.
      let resolvedMistakes: Mistake[] = [];
      if (updated.sourceMistakeId && shouldResolve(updated)) {
        const mistake = snapshot?.mistakes.find((m) => m.id === updated.sourceMistakeId);
        if (mistake && !mistake.resolved) {
          const closed = { ...mistake, resolved: true, resolvedAt: now.toISOString() };
          await repo.saveMistake(closed);
          resolvedMistakes = [closed];
        }
      }

      setSnapshot((prev) => {
        if (!prev) return prev;
        const next: Snapshot = {
          ...prev,
          cards: prev.cards.map((c) => (c.id === updated.id ? updated : c)),
          reviewLogs: [...prev.reviewLogs, log],
          mistakes: resolvedMistakes.length
            ? prev.mistakes.map((m) => resolvedMistakes.find((r) => r.id === m.id) ?? m)
            : prev.mistakes,
        };
        void bumpGamification(
          prev.streak,
          grade === "again" ? XP.review : XP.correctReview + (resolvedMistakes.length ? XP.mistakeResolved : 0),
          {},
          next,
        ).then((streak) => patch((p) => ({ ...p, streak })));
        return next;
      });
    },
    [userId, snapshot, bumpGamification, patch],
  );

  const joinExperiment = useCallback(async () => {
    const assignment = assignExperimentArm(userId);
    await writeReviseMeta("experimentAssignment", assignment);
    setExperimentArm(assignment);
  }, [userId]);

  const leaveExperiment = useCallback(async () => {
    await writeReviseMeta("experimentAssignment", { anonId: userId, arm: "control", assignedAt: new Date().toISOString(), optedOut: true });
    setExperimentArm(null);
  }, [userId]);

  const recordExperimentEvent = useCallback(async (type: ExperimentEventType, task: { taskId: string; activity: string; topicId?: Id | null }, at?: string) => {
    const arm = experimentArm;
    if (!arm) return;
    const events = (await readReviseMeta<ExperimentEvent[]>("experimentEvents")) ?? [];
    const atIso = at ?? new Date().toISOString();
    const day = atIso.slice(0, 10);
    const duplicate = events.some((e) => e.type === type && e.taskId === task.taskId && e.at.slice(0, 10) === day);
    if (duplicate) return;
    const next = [...events.slice(-2000), { anonId: arm.anonId, taskId: task.taskId, activity: task.activity, topicId: task.topicId ?? null, type, at: atIso }];
    await writeReviseMeta("experimentEvents", next);
  }, [experimentArm]);

  const recordGradeActual = useCallback(async (subjectId: Id, percent: number, kind: "mock" | "paper" | "final") => {
    const record: ActualResultRecord = { id: crypto.randomUUID(), anonId: userId, subjectId, percent, kind, takenAt: new Date().toISOString() };
    const log = (await readReviseMeta<ActualResultRecord[]>("gradeActuals")) ?? [];
    await writeReviseMeta("gradeActuals", [...log.slice(-500), record]);
    setGradeActuals([...log.slice(-500), record]);
  }, [userId]);

  // Paper-outcome loop, part 1: freeze the prediction the moment a recommended
  // paper is started, BEFORE any question is answered. Called with the
  // calibration-adjusted simulation for this exact paper.
  const beginPaperOutcome = useCallback<StoreValue["beginPaperOutcome"]>(
    async (input) => {
      const record = buildPaperOutcomeRecord({
        userId,
        subjectId: input.subjectId,
        paperId: input.paperId,
        paperRunId: input.paperRunId,
        predictedMarks: input.predictedMarks,
        totalMarks: input.totalMarks,
        satAt: new Date().toISOString(),
      });
      const log = (await readReviseMeta<PaperOutcomeRecord[]>("paperOutcomes")) ?? [];
      const next = [...log.filter((o) => o.id !== record.id), record].slice(-200);
      await writeReviseMeta("paperOutcomes", next);
      setPaperOutcomeLog(next);
    },
    [userId],
  );

  // Paper-outcome loop, part 2: close the record with the actual awarded
  // marks once marking completes. The (predicted, actual) pair then feeds
  // paperOutcomeGainMultiplier on the next recommend() pass.
  const closePaperOutcomeRecord = useCallback<StoreValue["closePaperOutcome"]>(
    async (paperRunId, actualMarks) => {
      const log = (await readReviseMeta<PaperOutcomeRecord[]>("paperOutcomes")) ?? [];
      const target = log.find((o) => o.paperRunId === paperRunId);
      if (!target) return; // no frozen prediction (untimed path or legacy run) — nothing to learn
      const next = [...log.filter((o) => o.id !== target.id), closePaperOutcome(target, actualMarks)].slice(-200);
      await writeReviseMeta("paperOutcomes", next);
      setPaperOutcomeLog(next);
    },
    [],
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
      const retestEvaluation = retestMistake ? evaluateMistakeRetest(retestMistake, question, attempt) : undefined;
      const updatedMistake = retestMistake && retestEvaluation
        ? applyRetestToMistake(retestMistake, retestEvaluation, attempt)
        : undefined;

      await repo.saveAttempt(attempt);
      // Prospective experiment telemetry: derive started/completed events
      // from the recorded attempt so no extra student action is required.
      if (experimentArm) {
        const expTopicId = question.topicIds[0] ?? attempt.topicIds[0] ?? null;
        const expTaskId = `${attempt.mode}:${expTopicId ?? question.subjectId}`;
        void recordExperimentEvent("started", { taskId: expTaskId, activity: attempt.mode, topicId: expTopicId }, new Date(new Date(attempt.createdAt).getTime() - Math.max(0, attempt.elapsedMs || 0)).toISOString());
        void recordExperimentEvent("completed", { taskId: expTaskId, activity: attempt.mode, topicId: expTopicId }, attempt.createdAt);
      }
      if (updatedMistake) await repo.saveMistake(updatedMistake);

      // A failed retest updates the original mistake in place. It must not
      // create another card for the same gap.
      const misconceptions = [...new Set(question.topicIds.flatMap((id) => misconceptionsForTopic(id)))];
      const drafts = isRetest ? [] : mistakesFromAttempt(attempt, question, undefined, undefined, misconceptions);
      if (drafts.length) {
        await repo.saveMistakes(drafts.map((d) => d.mistake));
        await repo.saveCards(drafts.map((d) => d.card));
      }
      setSnapshot((prev) => {
        if (!prev) return prev;
        const next: Snapshot = {
          ...prev,
          attempts: [...prev.attempts, attempt],
          mistakes: updatedMistake
            ? prev.mistakes.map((mistake) => (mistake.id === updatedMistake.id ? updatedMistake : mistake))
            : [...prev.mistakes, ...drafts.map((d) => d.mistake)],
          cards: [...prev.cards, ...drafts.map((d) => d.card)],
        };
        const retestXp = retestEvaluation?.status === "resolved" ? XP.mistakeResolved : 0;
        void bumpGamification(prev.streak, attempt.awarded * XP.attemptMark + retestXp, {}, next).then((streak) =>
          patch((p) => ({ ...p, streak })),
        );
        return next;
      });
      return updatedMistake ? [updatedMistake] : drafts.map((d) => d.mistake);
    },
    [bumpGamification, patch, snapshot, experimentArm, recordExperimentEvent],
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

  const regeneratePlan = useCallback<StoreValue["regeneratePlan"]>(async () => {
    if (!snapshot) return;
    const subjects = allSubjects().filter((s) => snapshot.settings.subjectIds.includes(s.id));
    const plan = buildPlan({
      userId,
      topics,
      mastery,
      exams: snapshot.examDates,
      availability: snapshot.settings.availability,
      sessionLengthMinutes: snapshot.settings.sessionLengthMinutes,
      subjectIds: snapshot.settings.subjectIds,
      subjects,
      targetGrades: snapshot.settings.targetGrades,
      evidence: buildSubjectEvidence(snapshot.cards, snapshot.mistakes, snapshot.attempts, todayIso()),
      existing: snapshot.plannedSessions,
    });
    const changelog = summarizePlanChange({
      previous: snapshot.plannedSessions,
      next: plan,
      exams: snapshot.examDates,
      subjectNames: Object.fromEntries(subjects.map((s) => [s.id, s.name])),
      today: todayIso(),
    });
    await repo.replacePlan(userId, plan);
    setPlanChangelog(changelog);
    patch((prev) => ({ ...prev, plannedSessions: plan }));
  }, [snapshot, userId, topics, mastery, patch, setPlanChangelog]);

  const rescheduleMissedSessions = useCallback<StoreValue["rescheduleMissedSessions"]>(async () => {
    if (!snapshot) return;
    const healed = rescheduleMissed(snapshot.plannedSessions, todayIso(), 6);
    await repo.replacePlan(userId, healed);
    patch((prev) => ({ ...prev, plannedSessions: healed }));
  }, [snapshot, userId, patch]);

  const completeSession = useCallback<StoreValue["completeSession"]>(
    async (sessionId, status = "done") => {
      const session = snapshot?.plannedSessions.find((s) => s.id === sessionId);
      if (!session) return;
      const updated: PlannedSession = {
        ...session,
        status,
        completedAt: status === "done" ? new Date().toISOString() : undefined,
      };
      await repo.savePlan([updated]);
      setSnapshot((prev) => {
        if (!prev) return prev;
        const next: Snapshot = {
          ...prev,
          plannedSessions: prev.plannedSessions.map((s) => (s.id === sessionId ? updated : s)),
        };
        if (status === "done") {
          void bumpGamification(prev.streak, XP.sessionCompleted, {}, next).then((streak) =>
            patch((p) => ({ ...p, streak })),
          );
        }
        return next;
      });
    },
    [snapshot, bumpGamification, patch],
  );

  const upsertExamDate = useCallback<StoreValue["upsertExamDate"]>(
    async (exam) => {
      await repo.saveExamDate(exam);
      patch((prev) => ({
        ...prev,
        examDates: [...prev.examDates.filter((e) => e.id !== exam.id), exam],
      }));
    },
    [patch],
  );

  const removeExamDate = useCallback<StoreValue["removeExamDate"]>(
    async (id) => {
      await repo.deleteExamDate(id, userId);
      patch((prev) => ({ ...prev, examDates: prev.examDates.filter((e) => e.id !== id) }));
    },
    [patch, userId],
  );

  const updateSettings = useCallback<StoreValue["updateSettings"]>(
    async (patchValue) => {
      if (!snapshot) return;
      const next: UserSettings = { ...snapshot.settings, ...patchValue, updatedAt: new Date().toISOString() };
      await repo.saveSettings(next);
      patch((prev) => ({ ...prev, settings: next }));
    },
    [snapshot, patch],
  );

  const refreshPhaseNotices = useCallback<StoreValue["refreshPhaseNotices"]>(async () => {
    if (!snapshot) return;
    const subjects: PhaseSubject[] = snapshot.settings.subjectIds.map((subjectId) => {
      const subject = getSubject(subjectId);
      return {
        subjectId,
        name: subject?.name ?? subjectId,
        days: daysToExam(snapshot.examDates, subjectId, todayIso()),
      };
    });
    const previous = (snapshot.settings.examNotices ?? {}) as Record<string, PhaseBucket | null | undefined>;
    const notices = techniqueEntryNotices(subjects, previous);
    // Record every subject's current bucket so a transition is announced
    // exactly once — and a subject pushed back out of the window can be
    // re-announced when it later re-enters.
    const buckets = currentPhaseBuckets(subjects);
    const examNotices: Record<string, string> = {};
    for (const [subjectId, bucket] of Object.entries(buckets)) {
      if (bucket) examNotices[subjectId] = bucket;
    }
    const changed =
      Object.keys(examNotices).length !== Object.keys(previous).length ||
      Object.entries(examNotices).some(([subjectId, bucket]) => previous[subjectId] !== bucket);
    if (changed) await updateSettings({ examNotices });
    const notice = notices[0] ?? null;
    if (notice) setExamPhaseNotice(notice);
    if (
      notice &&
      snapshot.settings.examNotifications &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      window.Notification.permission === "granted"
    ) {
      try {
        new window.Notification(notice.title, { body: notice.body });
      } catch {
        // Some environments throw on construction (private browsing, iframes);
        // the in-app banner still shows, so the notice is not lost.
      }
    }
  }, [snapshot, updateSettings]);

  const dismissExamPhaseNotice = useCallback<StoreValue["dismissExamPhaseNotice"]>(() => {
    setExamPhaseNotice(null);
  }, []);

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

  const saveRevisionCheckpoint = useCallback<StoreValue["saveRevisionCheckpoint"]>(
    async (input) => {
      const checkpoint = createRevisionCheckpoint(userId, input);
      await repo.saveRevisionCheckpoint(checkpoint);
      setRevisionCheckpoint(checkpoint);
    },
    [userId],
  );


  const clearRevisionCheckpoint = useCallback<StoreValue["clearRevisionCheckpoint"]>(async () => {
    await repo.clearRevisionCheckpoint(userId);
    setRevisionCheckpoint(null);
  }, [userId]);

  const startRevisionTwinSession = useCallback<StoreValue["startRevisionTwinSession"]>(
    async (choice, title) => {
      const state = revisionTwin ?? createRevisionTwinState(userId);
      if (state.sessions.some((session) => session.status === "active")) throw new Error("A revision block is already active.");
      const session = createRevisionTwinSession({ id: crypto.randomUUID(), userId, choice, title });
      const next: RevisionTwinState = { ...state, sessions: [session, ...state.sessions], updatedAt: new Date().toISOString() };
      await repo.saveRevisionTwin(next);
      setRevisionTwin(next);
      return session;
    },
    [revisionTwin, userId],
  );

  const completeRevisionTwinSession = useCallback<StoreValue["completeRevisionTwinSession"]>(
    async (id, actualMarks, actualMinutes) => {
      const state = revisionTwin;
      const session = state?.sessions.find((row) => row.id === id && row.status === "active");
      if (!state || !session) return;
      const updated = completeTwinSession(session, { actualMarks, actualMinutes });
      const next: RevisionTwinState = { ...state, sessions: state.sessions.map((row) => row.id === id ? updated : row), updatedAt: new Date().toISOString() };
      await repo.saveRevisionTwin(next);
      setRevisionTwin(next);
    },
    [revisionTwin],
  );

  const abandonTwinSession = useCallback<StoreValue["abandonRevisionTwinSession"]>(
    async (id) => {
      const state = revisionTwin;
      const session = state?.sessions.find((row) => row.id === id && row.status === "active");
      if (!state || !session) return;
      const updated = abandonRevisionTwinSession(session);
      const next: RevisionTwinState = { ...state, sessions: state.sessions.map((row) => row.id === id ? updated : row), updatedAt: new Date().toISOString() };
      await repo.saveRevisionTwin(next);
      setRevisionTwin(next);
    },
    [revisionTwin],
  );

  const value: StoreValue | null = useMemo(() => {
    if (!snapshot) return null;
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
      beginPaperOutcome,
      closePaperOutcome: closePaperOutcomeRecord,
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
    predictions,
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
    gradePredictionLog,
    gradeActuals,
    paperOutcomeLog,
    paperOutcomeGains,
    recordGradeActual,
    beginPaperOutcome,
    closePaperOutcomeRecord,
    experimentRecs,
    funnelEvents,
    recordFunnel,
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

function BootScreen() {
  return (
    <div className="min-h-dvh grid place-items-center bg-bg">
      <div className="flex flex-col items-center gap-3 text-ink3">
        <div className="flex gap-1.5" aria-hidden>
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
        <p className="text-sm">Loading your revision data…</p>
      </div>
    </div>
  );
}

/** Subjects the student is taking, in curriculum order. */
export function useSubjects() {
  const { settings } = useStore();
  return useMemo(
    () => allSubjects().filter((s) => settings.subjectIds.includes(s.id)),
    [settings.subjectIds],
  );
}
