// ---------------------------------------------------------------------------
// Revision-funnel instrumentation - the basic-loop health monitor.
//
//   app opened -> recommendation displayed -> accepted -> task started ->
//   completed -> answer submitted -> feedback read -> repair completed ->
//   next recommendation started
//
// Only four event types need explicit capture (app_opened,
// recommendation_displayed / _accepted, feedback_read); everything else is
// DERIVED from attempts already recorded for marking, so instrumentation can
// never drift from what students actually did. Events live in local-first
// meta storage; analysis is pure and refuses headline percentages when
// denominators are thin.
//
// Preregistered goals:
//   open -> studying            <30 s       (median + share meeting it)
//   recommendation acceptance   >70 %
//   started -> completed        >80 %
//   mistake -> remediation      >60 %
//   next-task continuation      >40 %
//   sessions without useful work <10 %
// ---------------------------------------------------------------------------

import type { Id, IsoInstant } from "./types";

export type FunnelEventType =
  | "app_opened"
  | "recommendation_displayed"
  | "recommendation_accepted"
  | "feedback_read";

export interface FunnelEvent {
  anonId: string;
  type: FunnelEventType;
  at: IsoInstant;
  /** Display/acceptance share a task id; feedback_read carries the attempt id. */
  detail?: string;
}

export interface AttemptRecord {
  anonId: string;
  questionId: Id;
  topicIds: Id[];
  mode: string;
  awarded: number;
  max: number;
  elapsedMs: number;
  createdAt: IsoInstant;
  retestMistakeId?: Id | null;
}

export interface MistakeRecord {
  anonId: string;
  id: Id;
  createdAt: IsoInstant;
}

/** Stable task identity shared by display/acceptance/attempt derivation. */
export function recommendationTaskId(activity: string, topicId: Id | null, subjectId: Id, day: string): string {
  return `${activity}:${topicId ?? subjectId}:${day}`;
}

// --- internal timeline ------------------------------------------------------

interface Node {
  t: number;
  kind:
    | "opened"
    | "displayed"
    | "accepted"
    | "started"
    | "submitted"
    | "completed"
    | "feedback"
    | "repair";
  taskId?: string;
  attemptId?: string;
  hasRetest?: boolean;
  repairSuccess?: boolean;
  topicId?: Id | null;
}

const SESSION_GAP_MS = 30 * 60_000;

function buildTimeline(input: {
  anonId: string;
  events: FunnelEvent[];
  attempts: AttemptRecord[];
}): { nodes: Node[]; sessionIds: number[] } {
  // Scope strictly to the participant under analysis.
  const myEvents = input.events.filter((e) => e.anonId === input.anonId);
  const myAttempts = input.attempts.filter((a) => a.anonId === input.anonId);
  const nodes: Node[] = [];
  for (const e of myEvents) {
    const t = new Date(e.at).getTime();
    if (e.type === "app_opened") nodes.push({ t, kind: "opened" });
    else if (e.type === "recommendation_displayed") nodes.push({ t, kind: "displayed", ...(e.detail != null ? { taskId: e.detail } : {}) });
    else if (e.type === "recommendation_accepted") nodes.push({ t, kind: "accepted", ...(e.detail != null ? { taskId: e.detail } : {}) });
    else if (e.type === "feedback_read") nodes.push({ t, kind: "feedback", ...(e.detail != null ? { attemptId: e.detail } : {}) });
  }
  for (const a of myAttempts) {
    const created = new Date(a.createdAt).getTime();
    const taskId = `${a.mode}:${a.topicIds[0] ?? a.questionId}`;
    if (a.elapsedMs > 0) nodes.push({ t: created - Math.min(a.elapsedMs, 45 * 60_000), kind: "started", taskId });
    nodes.push({ t: created, kind: "submitted", taskId, topicId: a.topicIds[0] ?? null, hasRetest: Boolean(a.retestMistakeId), repairSuccess: Boolean(a.retestMistakeId) && a.max > 0 && a.awarded === a.max });
    nodes.push({ t: created, kind: "completed", taskId });
    if (a.retestMistakeId && a.max > 0 && a.awarded === a.max) {
      nodes.push({ t: created, kind: "repair", attemptId: String(a.retestMistakeId) });
    }
  }
  nodes.sort((x, y) => x.t - y.t);
  // Sessionise: a gap over SESSION_GAP_MS starts a new session index.
  const sessionIds: number[] = [];
  let sessionId = 0;
  let prev: number | null = null;
  for (const node of nodes) {
    if (prev != null && node.t - prev > SESSION_GAP_MS) sessionId++;
    sessionIds.push(sessionId);
    prev = node.t;
  }
  return { nodes, sessionIds };
}

// --- metrics ----------------------------------------------------------------

export interface StepConversion {
  step: string;
  entered: number;
  advanced: number;
  /** advanced/entered, null when nobody entered the step. */
  rate: number | null;
}

export interface FunnelGoalReport {
  label: string;
  goal: string;
  value: number | null;
  meets: boolean | null;
  detail: string;
}

export interface FunnelReport {
  sessions: number;
  steps: StepConversion[];
  goals: FunnelGoalReport[];
  insufficientData: boolean;
  note: string;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const a = s[mid];
  const b = s[mid - 1];
  if (a == null) return null;
  return Math.round((s.length % 2 ? a : b != null ? (a + b) / 2 : a) * 10) / 10;
}

const DEFAULT_MIN_DENOMINATOR = 5;

export function analyseFunnel(input: {
  anonId: string;
  events: FunnelEvent[];
  attempts: AttemptRecord[];
  mistakes: MistakeRecord[];
  now?: Date;
  /** Minimum transitions before a goal percentage is meaningful (default 5). */
  minDenominator?: number;
}): FunnelReport {
  const { nodes, sessionIds } = buildTimeline({ anonId: input.anonId, events: input.events, attempts: input.attempts });

  const sessions = new Map<number, Node[]>();
  nodes.forEach((node, i) => {
    const sid = sessionIds[i] ?? 0;
    const list = sessions.get(sid) ?? [];
    list.push(node);
    sessions.set(sid, list);
  });

  // --- step conversions -----------------------------------------------------
  const opened = nodes.filter((n) => n.kind === "opened");
  const displayed = nodes.filter((n) => n.kind === "displayed");
  const accepted = nodes.filter((n) => n.kind === "accepted");
  const started = nodes.filter((n) => n.kind === "started");
  const submitted = nodes.filter((n) => n.kind === "submitted");
  const feedbacks = nodes.filter((n) => n.kind === "feedback");
  const repairs = nodes.filter((n) => n.kind === "repair");
  const mistakes = input.mistakes.filter((m) => m.anonId === input.anonId);

  // Accepted within 30 minutes of a displayed impression with the same task id.
  const acceptedAfterDisplay = accepted.filter((a) =>
    displayed.some((d) => d.taskId && d.taskId === a.taskId && a.t >= d.t && a.t - d.t <= SESSION_GAP_MS),
  ).length;

  // Completed within 45 minutes of a start sharing the task id.
  const completedAfterStart = nodes.filter(
    (c) => c.kind === "completed" && started.some((st) => st.taskId && st.taskId === c.taskId && c.t >= st.t && c.t - st.t <= 45 * 60_000),
  ).length;

  // Repairs within 48 hours of a mistake being recorded.
  const repairedWithinWindow = mistakes.filter((m) =>
    repairs.some(
      (r) =>
        r.attemptId === String(m.id) &&
        r.t >= new Date(m.createdAt).getTime() &&
        r.t - new Date(m.createdAt).getTime() <= 48 * 3_600_000,
    ),
  ).length;

  // Continuation: a start within 45 minutes after feedback was read.
  // Next-task continuation uses one-to-one pairing: each feedback-read event
  // matches AT MOST ONE subsequent start, so multiple rapid tasks after one
  // feedback cannot inflate the numerator.
  const usedFeedback = new Set<number>();
  const continued = started.filter((sNode) => {
    for (let fi = 0; fi < feedbacks.length; fi++) {
      if (usedFeedback.has(fi)) continue;
      const f = feedbacks[fi];
      if (!f) continue;
      if (sNode.t > f.t && sNode.t - f.t <= 45 * 60_000) {
        usedFeedback.add(fi);
        return true;
      }
    }
    return false;
  }).length;

  // Open -> studying per session that has both an open and a start.
  const openToStudySeconds: number[] = [];
  let wastedSessions = 0;
  let sessionsWithOpen = 0;
  for (const list of sessions.values()) {
    const openNode = list.find((n) => n.kind === "opened");
    const startNode = list.find((n) => n.kind === "started");
    if (openNode) sessionsWithOpen++;
    if (openNode && startNode) openToStudySeconds.push(Math.max(0, (startNode.t - openNode.t) / 1000));
    if (!list.some((n) => n.kind === "completed")) wastedSessions++;
  }

  const steps: StepConversion[] = [
    { step: "App opened", entered: opened.length, advanced: displayed.length, rate: opened.length ? round(displayed.length / opened.length) : null },
    { step: "Recommendation displayed", entered: displayed.length, advanced: acceptedAfterDisplay, rate: displayed.length ? round(acceptedAfterDisplay / displayed.length) : null },
    { step: "Recommendation accepted", entered: accepted.length, advanced: started.length, rate: accepted.length ? round(started.length / accepted.length) : null },
    { step: "Task started", entered: started.length, advanced: completedAfterStart, rate: started.length ? round(completedAfterStart / started.length) : null },
    { step: "Answer submitted", entered: submitted.length, advanced: feedbacks.length, rate: submitted.length ? round(feedbacks.length / submitted.length) : null },
    { step: "Feedback read", entered: feedbacks.length, advanced: continued, rate: feedbacks.length ? round(continued / feedbacks.length) : null },
    { step: "Mistake made", entered: mistakes.length, advanced: repairedWithinWindow, rate: mistakes.length ? round(repairedWithinWindow / mistakes.length) : null },
  ];

  const medianOpen = median(openToStudySeconds);
  const under30 = openToStudySeconds.filter((s) => s <= 30).length;

  const minDenominator = input.minDenominator ?? DEFAULT_MIN_DENOMINATOR;
  const enough = (n: number): boolean => n >= minDenominator;
  const goals: FunnelGoalReport[] = [
    {
      label: "Open → studying",
      goal: "<30 s median",
      value: medianOpen,
      meets: medianOpen == null ? null : medianOpen <= 30,
      detail: `${under30}/${openToStudySeconds.length} sessions started within 30 s`,
    },
    {
      label: "Recommendation acceptance",
      goal: ">70 %",
      value: displayed.length ? round(acceptedAfterDisplay / displayed.length) : null,
      meets: enough(displayed.length) ? acceptedAfterDisplay / displayed.length > 0.7 : null,
      detail: `${acceptedAfterDisplay}/${displayed.length}`,
    },
    {
      label: "Started → completed",
      goal: ">80 %",
      value: started.length ? round(completedAfterStart / started.length) : null,
      meets: enough(started.length) ? completedAfterStart / started.length > 0.8 : null,
      detail: `${completedAfterStart}/${started.length}`,
    },
    {
      label: "Mistake → remediation",
      goal: ">60 %",
      value: mistakes.length ? round(repairedWithinWindow / mistakes.length) : null,
      meets: enough(mistakes.length) ? repairedWithinWindow / mistakes.length > 0.6 : null,
      detail: `${repairedWithinWindow}/${mistakes.length} repaired within 48 h`,
    },
    {
      label: "Next-task continuation",
      goal: ">40 %",
      value: feedbacks.length ? round(continued / feedbacks.length) : null,
      meets: enough(feedbacks.length) ? continued / feedbacks.length > 0.4 : null,
      detail: `${continued}/${feedbacks.length} started a new task within 45 min`,
    },
    {
      label: "Sessions without useful work",
      goal: "<10 %",
      value: sessions.size ? round(wastedSessions / sessions.size) : null,
      meets: enough(sessions.size) ? wastedSessions / sessions.size < 0.1 : null,
      detail: `${wastedSessions}/${sessions.size} ended with nothing completed`,
    },
  ];

  const anyDenominator = displayed.length + started.length + feedbacks.length + mistakes.length;
  const insufficient = !enough(anyDenominator);
  return {
    sessions: sessions.size,
    steps,
    goals,
    insufficientData: insufficient,
    note: insufficient
      ? "Funnel is still filling: no conversion percentage becomes meaningful until each step has at least five real transitions."
      : `Monitored across ${sessions.size} sessions (${sessionsWithOpen} with a captured app-open).`,
  };
}
