"use client";

// ---------------------------------------------------------------------------
// Commute pack — prepare for an offline commute.
//
// Everything in the app is offline-first except one quality-gated thing: video
// lessons are AI storyboards generated per topic, cached only after a
// successful AI generation. Packing means doing that generation *now, while
// online*, for the topics the student plans to study — so on the train the
// video lesson plays from cache and every other surface (cards, practice,
// lessons) already works from IndexedDB. Grades made while offline queue in
// the durable outbox, so the card repeats the sync promise in the offline
// state: work is saved here and syncs when you reconnect.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Topic } from "@/domain/types";
import {
  applyPackedToManifest,
  packedTopicIds,
  packTopicStoryboards,
  readPackManifest,
  removeFromManifest,
  writePackManifest,
  type PackProgress,
} from "@/data/offline-pack";
import { clearCachedStoryboard, readCachedStoryboard } from "@/data/video-storyboard-cache";
import { useStore } from "@/state/store";
import { OfflineIcon, SyncIcon, VideoIcon, ICON_SIZE } from "./icons";
import { Button, Panel, Pill, cx } from "./ui";

function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function CommutePack({ topics }: { topics: Topic[] }) {
  const { syncStatus } = useStore();

  const [online, setOnline] = useState<boolean>(isOnline);
  const [manifest, setManifest] = useState(() => readPackManifest());
  // Packed ids recomputed by hand after every mutation — the storyboard cache
  // is plain localStorage, so there is nothing reactive to subscribe to.
  const [packed, setPacked] = useState<string[]>(() =>
    packedTopicIds(readPackManifest(), (id) => readCachedStoryboard(id) !== null),
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [packing, setPacking] = useState(false);
  const [progress, setProgress] = useState<PackProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setOnline(isOnline());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const byId = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const packedSet = useMemo(() => new Set(packed), [packed]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const refreshFromStorage = useCallback(() => {
    const next = readPackManifest();
    setManifest(next);
    setPacked(packedTopicIds(next, (id) => readCachedStoryboard(id) !== null));
  }, []);

  const toggleSelect = (topicId: string) => {
    setSelected((prev) => (prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId]));
  };

  const packSelected = async () => {
    const ids = selected.filter((id) => !packedSet.has(id));
    if (!ids.length) return;
    setPacking(true);
    setMessage(null);
    const outcome = await packTopicStoryboards(ids, setProgress);
    const next = applyPackedToManifest(manifest, outcome.packed, new Date().toISOString());
    writePackManifest(next);
    setManifest(next);
    setPacked(packedTopicIds(next, (id) => readCachedStoryboard(id) !== null));
    setSelected((prev) => prev.filter((id) => !outcome.packed.includes(id)));
    setPacking(false);
    setProgress(null);
    if (outcome.skipped.length) {
      setMessage(
        `${outcome.packed.length} packed — ${outcome.skipped.length} ${
          outcome.skipped.length === 1 ? "needs" : "need"
        } a connection right now. Try again when your signal is better.`,
      );
    } else {
      setMessage(`Pack ready — ${outcome.packed.length} ${outcome.packed.length === 1 ? "lesson" : "lessons"} will play offline.`);
    }
  };

  const removeTopic = (topicId: string) => {
    clearCachedStoryboard(topicId);
    const next = removeFromManifest(manifest, [topicId]);
    writePackManifest(next);
    refreshFromStorage();
    setMessage(null);
  };

  const notPacked = topics.filter((t) => !packedSet.has(t.id));
  const pendingLabel =
    syncStatus.pending && syncStatus.pending > 0
      ? `${syncStatus.pending} change${syncStatus.pending === 1 ? "" : "s"} are saved here and will sync when you're back online.`
      : null;

  return (
    <Panel aria-label="Commute pack" className="space-y-3">
      <div className="flex items-start gap-2">
        <VideoIcon size={ICON_SIZE.md} aria-hidden className="text-ink3 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink">Commute pack</p>
            {packed.length ? (
              <Pill tone="success">{packed.length} ready offline</Pill>
            ) : (
              <Pill>Nothing packed yet</Pill>
            )}
          </div>
          <p className="text-xs text-ink3 mt-0.5">
            Pre-load this subject&apos;s video lessons while you have a signal, so they play on the train. Cards and
            practice already work offline.
          </p>
        </div>
      </div>

      {!online ? (
        <p className="text-xs text-review bg-reviewsoft rounded-[6px] px-2.5 py-2" role="status">
          <OfflineIcon size={ICON_SIZE.sm} aria-hidden className="inline mr-1.5 align-[-2px]" />
          You&apos;re offline. {packed.length ? `${packed.length} packed lesson${packed.length === 1 ? "" : "s"} will play from cache. ` : "Video lessons need a connection to pack — cards and practice still work. "}
          {pendingLabel}
        </p>
      ) : null}

      {packed.length ? (
        <ul className="space-y-1">
          {packed.map((id) => {
            const topic = byId.get(id);
            return (
              <li key={id} className="flex items-center gap-2 text-xs text-ink2">
                <span className="text-success">✓</span>
                <span className="flex-1 truncate">{topic?.title ?? id}</span>
                {online ? (
                  <button
                    type="button"
                    onClick={() => removeTopic(id)}
                    className="text-ink3 hover:text-danger underline underline-offset-2 text-[11px]"
                    aria-label={`Remove ${topic?.title ?? id} from the pack`}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {online ? (
        <>
          <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Done choosing" : notPacked.length ? `Pack topics for offline…` : "Add topics"}
          </Button>

          {open ? (
            notPacked.length ? (
              <>
                <ul className="space-y-1 max-h-56 overflow-auto nice-scroll">
                  {notPacked.map((t) => (
                    <li key={t.id}>
                      <label className="flex items-center gap-2 text-xs text-ink2 cursor-pointer hover:bg-surface2 rounded-[6px] px-1.5 py-1">
                        <input
                          type="checkbox"
                          checked={selectedSet.has(t.id)}
                          onChange={() => toggleSelect(t.id)}
                          className="accent-accent"
                        />
                        <span className="flex-1 truncate">{t.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!selected.filter((id) => !packedSet.has(id)).length || packing}
                    onClick={() => void packSelected()}
                  >
                    {packing ? "Packing…" : `Pack ${selected.length} for offline`}
                  </Button>
                  {packing && progress ? (
                    <p className="text-xs text-ink3" role="status">
                      <SyncIcon size={ICON_SIZE.sm} aria-hidden className="inline mr-1 align-[-2px] animate-spin" />
                      Preparing {progress.done + 1} of {progress.total}
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-xs text-ink3">Every topic in this subject is already packed.</p>
            )
          ) : null}

          {message ? (
            <p className={cx("text-xs", message.startsWith("Pack ready") ? "text-success" : "text-review")} role="status">
              {message}
            </p>
          ) : null}
        </>
      ) : null}

      {!packed.length && online && notPacked.length ? (
        <p className="text-[11px] text-ink3">
          Packs are per-device. Pick the topics you&apos;ll revise on the way, and pack them over Wi-Fi before you go.
        </p>
      ) : null}
    </Panel>
  );
}