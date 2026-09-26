"use client";

// Sync + hydration state — outbox coordination, not study state.
//
// Owns: sync status, sync execution, initial-history hydration, background
// history streaming, AI-marking DLQ drain, and the debounced auto-sync timer.
// The snapshot itself stays in the central store; this module only reads it
// (for the auto-sync gate) and merges into it via setSnapshot.
//
// What causes synchronisation: syncNow() drain+pull when online + signed in.
// Module-scoped syncInFlight/hydrationEpoch are coordination state for
// background work, never render input.

import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Id } from "@/domain/types";
import type { Snapshot } from "@/data/repository";
import * as repo from "@/data/repository";
import { SYNC_QUEUE_EVENT, outboxSize, sync } from "@/data/sync";
import { AI_DLQ_RESOLVED_EVENT, drainDeadMarks, type AiDlqResolvedDetail } from "@/ai/mark-dlq";
import { isSupabaseConfigured } from "@/data/supabase";
import { initialSyncStatus, type SyncStatus } from "./sync-status";

let syncInFlight = false;
// Counts background-hydration runs so a superseded stream can detect it was
// replaced. Deliberately not a ref — the epoch is coordination state for
// background work, never render input.
let hydrationEpoch = 0;

export interface SyncEngine {
  syncStatus: SyncStatus;
  syncNow: () => Promise<void>;
  startHydration: () => void;
}

export function useSyncEngine(input: {
  userId: Id;
  snapshot: Snapshot | null;
  setSnapshot: Dispatch<SetStateAction<Snapshot | null>>;
  setBootError: Dispatch<SetStateAction<string | null>>;
}): SyncEngine {
  const { userId, snapshot, setSnapshot, setBootError } = input;
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => initialSyncStatus());

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
  }, [userId, setSnapshot]);

  /** Start (or restart, superseding any prior run) background history hydration. */
  const startHydration = useCallback(() => {
    hydrationEpoch += 1;
    void hydrateHistory(hydrationEpoch).catch((error) => {
      // A stream can fail after the first page has rendered (for example when
      // a later IndexedDB row is malformed). Route it through the same
      // recovery UI as boot failures instead of leaving a rejected promise.
      setBootError(error instanceof Error ? error.message : String(error));
    });
  }, [hydrateHistory, setBootError]);

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
  }, [userId, startHydration, setSnapshot]);

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
  }, [setSnapshot]);

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

  return { syncStatus, syncNow, startHydration };
}
