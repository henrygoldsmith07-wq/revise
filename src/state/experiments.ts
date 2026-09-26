"use client";

// Experiments + funnel analytics — measurement state, not study state.
//
// Owns: experiment assignment, experiment events, funnel events, and their
// local persistence. The central store reads the arm (to steer the
// recommendation shown) and recorders flow into grading paths; nothing here
// touches the snapshot.

import { useCallback, useEffect, useState } from "react";
import type { Id } from "@/domain/types";
import { readReviseMeta, writeReviseMeta } from "@/data/storage-namespace";
import { type FunnelEvent, type FunnelEventType } from "@/domain/funnel";
import { assignArm as assignExperimentArm,
  type ExperimentAssignment, type ExperimentEvent, type ExperimentEventType } from "@/domain/recommendation-experiment";

export interface Experiments {
  experimentArm: ExperimentAssignment | null;
  funnelEvents: FunnelEvent[];
  /** True once the mount load finished — first paint waits for it, as boot did. */
  loaded: boolean;
  recordFunnel: (type: FunnelEventType, detail?: string) => Promise<void>;
  joinExperiment: () => Promise<void>;
  leaveExperiment: () => Promise<void>;
  recordExperimentEvent: (
    type: ExperimentEventType,
    task: { taskId: string; activity: string; topicId?: Id | null },
    at?: string,
  ) => Promise<void>;
}

export function useExperiments(userId: Id): Experiments {
  const [experimentArm, setExperimentArm] = useState<ExperimentAssignment | null>(null);
  const [funnelEvents, setFunnelEvents] = useState<FunnelEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Self-loading on mount (in parallel with the snapshot load).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [assignment, funnel] = await Promise.all([
        readReviseMeta<ExperimentAssignment>("experimentAssignment"),
        readReviseMeta<FunnelEvent[]>("funnelEvents"),
      ]);
      if (cancelled) return;
      setExperimentArm(assignment ?? null);
      setFunnelEvents(funnel ?? []);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  return { experimentArm, funnelEvents, loaded, recordFunnel, joinExperiment, leaveExperiment, recordExperimentEvent };
}
