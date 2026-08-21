// ---------------------------------------------------------------------------
// Onboarding funnel — measurable, privacy-respecting, offline-first.
//
// The brief asks: improve onboarding using completion/activation data.
// So: define the funnel steps explicitly, measure drop-off locally, and
// derive activation (has the student actually started revising?). No network
// call here — the caller decides whether to ship aggregates.
// ---------------------------------------------------------------------------

export type OnboardingStep = "you" | "subjects" | "exams" | "time";
export const ONBOARDING_STEPS: readonly OnboardingStep[] = ["you", "subjects", "exams", "time"] as const;

export interface OnboardingProgress {
  /** Highest step the student has visited (0-based; -1 = not started). */
  reachedStep: number;
  /** Highest step the student completed (pressed Continue/Build). */
  completedStep: number;
  /** Whether the funnel was skipped entirely. */
  skipped: boolean;
  /** Whether the funnel was completed (Build my plan pressed and plan built). */
  completed: boolean;
  /** ISO instants for analytics (kept locally; shipped only as aggregates). */
  startedAt: string | null;
  completedAt: string | null;
  /** Per-step dwell (ms) — coarse, client-side only. */
  stepDurationsMs: Record<OnboardingStep, number>;
}

export function emptyOnboardingProgress(): OnboardingProgress {
  return {
    reachedStep: -1,
    completedStep: -1,
    skipped: false,
    completed: false,
    startedAt: null,
    completedAt: null,
    stepDurationsMs: { you: 0, subjects: 0, exams: 0, time: 0 },
  };
}

export function onboardingCompletionRate(progress: OnboardingProgress): number {
  if (progress.skipped || progress.completed) return progress.completed ? 1 : 0;
  if (progress.completedStep < 0) return 0;
  return (progress.completedStep + 1) / ONBOARDING_STEPS.length;
}

export function onboardingDropOffStep(progress: OnboardingProgress): OnboardingStep | null {
  if (progress.completed || progress.skipped) return null;
  const next = progress.completedStep + 1;
  if (next < 0 || next >= ONBOARDING_STEPS.length) return null;
  return ONBOARDING_STEPS[next];
}

/** Activation: has the student done something that predicts retention? */
export type ActivationSignal = "reviewed-card" | "answered-question" | "completed-session" | "built-plan";

export interface ActivationState {
  signals: ActivationSignal[];
  firstReviewAt: string | null;
  firstAttemptAt: string | null;
  firstSessionCompletedAt: string | null;
  /** Time from onboarding completion to first meaningful action (ms), or null. */
  timeToActivationMs: number | null;
}

export function deriveActivation(input: {
  onboardingCompletedAt: string | null;
  reviewLogs: Array<{ reviewedAt: string }>;
  attempts: Array<{ createdAt: string }>;
  plannedSessions: Array<{ status: string; completedAt?: string }>;
}): ActivationState {
  const firstReviewAt = input.reviewLogs.length
    ? [...input.reviewLogs].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt))[0]!.reviewedAt
    : null;
  const firstAttemptAt = input.attempts.length
    ? [...input.attempts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]!.createdAt
    : null;
  const completedSessions = input.plannedSessions.filter((s) => s.status === "done" && s.completedAt);
  const firstSessionCompletedAt = completedSessions.length
    ? [...completedSessions].sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""))[0]!.completedAt ?? null
    : null;
  const hasBuiltPlan = input.plannedSessions.length > 0;

  const signals: ActivationSignal[] = [];
  if (firstReviewAt) signals.push("reviewed-card");
  if (firstAttemptAt) signals.push("answered-question");
  if (firstSessionCompletedAt) signals.push("completed-session");
  if (hasBuiltPlan) signals.push("built-plan");

  let timeToActivationMs: number | null = null;
  if (input.onboardingCompletedAt) {
    const firstActionAt = [firstReviewAt, firstAttemptAt, firstSessionCompletedAt].filter(Boolean).sort()[0] as string | undefined;
    if (firstActionAt) {
      timeToActivationMs = new Date(firstActionAt).getTime() - new Date(input.onboardingCompletedAt).getTime();
    }
  }

  return { signals, firstReviewAt, firstAttemptAt, firstSessionCompletedAt, timeToActivationMs };
}

export function isActivated(state: ActivationState): boolean {
  // Activated if at least one real learning action has happened.
  return state.signals.some((s) => s === "reviewed-card" || s === "answered-question" || s === "completed-session");
}

/** Funnel summary for an aggregate report (no PII, just counts). */
export interface FunnelSummary {
  totalStarted: number;
  totalCompleted: number;
  totalSkipped: number;
  completionRate: number;
  skipRate: number;
  dropOffByStep: Record<OnboardingStep, number>;
  activationRate: number;
  medianTimeToActivationMs: number | null;
}

export function summariseFunnel(inputs: Array<{ progress: OnboardingProgress; activation: ActivationState }>): FunnelSummary {
  const totalStarted = inputs.length;
  const totalCompleted = inputs.filter((x) => x.progress.completed).length;
  const totalSkipped = inputs.filter((x) => x.progress.skipped).length;
  const completionRate = totalStarted ? totalCompleted / totalStarted : 0;
  const skipRate = totalStarted ? totalSkipped / totalStarted : 0;
  const dropOffByStep = { you: 0, subjects: 0, exams: 0, time: 0 } as Record<OnboardingStep, number>;
  for (const { progress } of inputs) {
    const step = onboardingDropOffStep(progress);
    if (step) dropOffByStep[step]++;
  }
  const activated = inputs.filter((x) => isActivated(x.activation)).length;
  const activationRate = totalStarted ? activated / totalStarted : 0;
  const times = inputs
    .map((x) => x.activation.timeToActivationMs)
    .filter((v): v is number => typeof v === "number" && v >= 0)
    .sort((a, b) => a - b);
  const medianTimeToActivationMs = times.length ? times[Math.floor(times.length / 2)]! : null;
  return { totalStarted, totalCompleted, totalSkipped, completionRate, skipRate, dropOffByStep, activationRate, medianTimeToActivationMs };
}
