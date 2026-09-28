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
import { localDayOfInstant } from "@/domain/local-date";

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
      const [storedAssignment, funnel, storedParticipantId, storedEvents] = await Promise.all([
        readReviseMeta<ExperimentAssignment>("experimentAssignment"),
        readReviseMeta<FunnelEvent[]>("funnelEvents"),
        readReviseMeta<string>("experimentParticipantId"),
        readReviseMeta<ExperimentEvent[]>("experimentEvents"),
      ]);
      let participantId = storedParticipantId;
      if (!participantId) {
        participantId = crypto.randomUUID();
        await writeReviseMeta("experimentParticipantId", participantId);
      }

      let assignment = storedAssignment ?? null;
      if (assignment && assignment.anonId !== participantId) {
        const previousAnonId = assignment.anonId;
        assignment = { ...assignment, anonId: participantId, version: 2 };
        await writeReviseMeta("experimentAssignment", assignment);
        const migratedEvents = (storedEvents ?? []).map((event) =>
          event.anonId === previousAnonId ? { ...event, anonId: participantId! } : event
        );
        if (migratedEvents.length) await writeReviseMeta("experimentEvents", migratedEvents);
      }

      if (cancelled) return;
      setExperimentArm(assignment?.optedOut ? null : assignment);
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
    let participantId = await readReviseMeta<string>("experimentParticipantId");
    if (!participantId) {
      participantId = crypto.randomUUID();
      await writeReviseMeta("experimentParticipantId", participantId);
    }
    const assignment = { ...assignExperimentArm(participantId), version: 2 as const };
    await writeReviseMeta("experimentAssignment", assignment);
    setExperimentArm(assignment);
  }, []);

  const leaveExperiment = useCallback(async () => {
    const current = experimentArm ?? await readReviseMeta<ExperimentAssignment>("experimentAssignment");
    if (current) {
      await writeReviseMeta("experimentAssignment", {
        ...current,
        version: 2,
        optedOut: true,
        withdrawnAt: new Date().toISOString(),
      });
    }
    setExperimentArm(null);
  }, [experimentArm]);

  const recordExperimentEvent = useCallback(async (type: ExperimentEventType, task: { taskId: string; activity: string; topicId?: Id | null }, at?: string) => {
    const arm = experimentArm;
    if (!arm) return;
    const events = (await readReviseMeta<ExperimentEvent[]>("experimentEvents")) ?? [];
    const atIso = at ?? new Date().toISOString();
    const day = localDayOfInstant(atIso);
    const duplicate = events.some((e) => e.type === type && e.taskId === task.taskId && localDayOfInstant(e.at) === day);
    if (duplicate) return;
    const next = [...events.slice(-2000), { anonId: arm.anonId, taskId: task.taskId, activity: task.activity, topicId: task.topicId ?? null, type, at: atIso }];
    await writeReviseMeta("experimentEvents", next);
  }, [experimentArm]);

  return { experimentArm, funnelEvents, loaded, recordFunnel, joinExperiment, leaveExperiment, recordExperimentEvent };
}
