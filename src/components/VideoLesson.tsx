"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { aiVideoLesson } from "@/ai/client";
import type { AiEnvelope, VideoLessonResponse, VideoLessonScene } from "@/ai/types";
import { speechAvailable, speak, stopSpeaking, toSpokenText } from "@/lib/speech";
import type { Topic } from "@/domain/types";
import { BackIcon, ForwardIcon, PauseIcon, PlayIcon, VideoIcon, ICON_SIZE } from "./icons";
import { SpeakButton } from "./SpeakButton";
import { useShortcuts } from "./shortcuts";
import { Button, Panel, Pill, ProgressBar, SourceBadge, cx } from "./ui";

// The video-style lesson player. A video lesson is a storyboard — timed scenes
// with narration, on-screen text and a visual cue — generated from the topic's
// authored spec data (or rebuilt offline from the same data when no model is
// configured). The player runs it like a video: one scene on screen at a
// time, auto-advancing on scene duration, with the narration speakable aloud.
// Position is kept as whole-video seconds and scenes are derived from it, so
// seek, auto-advance and end-of-video can never disagree.
//
// Successful AI storyboards are cached per topic (localStorage) so re-watches
// start instantly and stay consistent; "Regenerate" trades the cache for a
// fresh generation.

const TICK_MS = 250;
const NARRATE_KEY = "revise.lessons.autoNarrate";

const cacheKey = (topicId: string) => `revise.videoLessons.${topicId}`;

function readCache(topicId: string): AiEnvelope<VideoLessonResponse> | null {
  try {
    const raw = localStorage.getItem(cacheKey(topicId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AiEnvelope<VideoLessonResponse>;
    if (parsed?.data?.scenes?.length && parsed.data.title) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeCache(topicId: string, envelope: AiEnvelope<VideoLessonResponse>) {
  try {
    localStorage.setItem(cacheKey(topicId), JSON.stringify(envelope));
  } catch {
    /* private browsing: caching is best-effort only */
  }
}

function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const KIND_LABELS: Record<NonNullable<VideoLessonScene["kind"]>, string> = {
  intro: "Intro",
  teach: "Teach",
  misconception: "Misconception",
  trap: "Common trap",
  exam: "In the exam",
  recap: "Recap",
};

export function VideoLesson({
  topic,
  onExit,
  onEnded,
  nextTopic,
  onSelectTopic,
}: {
  topic: Topic;
  onExit: () => void;
  /** Fired once when playback reaches the end — marks the video watched. */
  onEnded?: (topicId: string) => void;
  /** The next unwatched topic, for one-click chaining after the recap. */
  nextTopic?: Topic | null;
  onSelectTopic?: (topic: Topic) => void;
}) {
  const [envelope, setEnvelope] = useState<AiEnvelope<VideoLessonResponse> | null>(null);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [showScript, setShowScript] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [autoNarrate, setAutoNarrate] = useState<boolean>(
    () => typeof window !== "undefined" && window.localStorage.getItem(NARRATE_KEY) === "1",
  );
  // Fired-once guard: `ended` stays true across re-renders, and the callback
  // must run once per play-through, not once per render.
  const endedReported = useRef(false);
  const speechOk = speechAvailable();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const cached = readCache(topic.id);
    if (cached) {
      // A saved storyboard answers instantly; "Regenerate" replaces it.
      setEnvelope(cached);
      return;
    }
    aiVideoLesson(topic.id).then((result) => {
      if (cancelled) return;
      if (result.source === "ai") writeCache(topic.id, result);
      setEnvelope(result);
    });
    return () => {
      cancelled = true;
    };
  }, [topic.id]);

  const regenerate = useCallback(() => {
    setRegenerating(true);
    setEnvelope(null);
    aiVideoLesson(topic.id).then((result) => {
      if (result.source === "ai") writeCache(topic.id, result);
      setEnvelope(result);
      setRegenerating(false);
    });
  }, [topic.id]);

  const scenes = useMemo(() => envelope?.data.scenes ?? [], [envelope]);

  const boundaries = useMemo(() => {
    const acc: number[] = [];
    let t = 0;
    for (const scene of scenes) {
      acc.push(t);
      t += scene.seconds;
    }
    return acc;
  }, [scenes]);
  const totalSeconds = useMemo(() => scenes.reduce((sum, s) => sum + s.seconds, 0), [scenes]);

  const sceneIdx = useMemo(() => {
    let idx = 0;
    for (let i = 0; i < boundaries.length; i++) {
      if (position >= boundaries[i]) idx = i;
    }
    return idx;
  }, [boundaries, position]);
  const scene = scenes[sceneIdx];
  const ended = envelope !== null && position >= totalSeconds;

  useEffect(() => {
    if (!playing || !scene || ended) return;
    const timer = setInterval(() => setPosition((p) => p + TICK_MS / 1000), TICK_MS);
    return () => clearInterval(timer);
  }, [playing, scene, ended]);

  // Mark watched exactly once per play-through.
  useEffect(() => {
    if (ended && !endedReported.current) {
      endedReported.current = true;
      onEnded?.(topic.id);
    }
    if (!ended) endedReported.current = false;
  }, [ended, onEnded, topic.id]);

  // Auto-narration: speak the current scene's voiceover while playing, and
  // fall silent on pause, seek or scene change (this effect re-speaks).
  useEffect(() => {
    if (!autoNarrate || !playing || ended || !scene) {
      stopSpeaking();
      return;
    }
    speak(toSpokenText(scene.narration));
    return () => stopSpeaking();
  }, [autoNarrate, playing, ended, scene, sceneIdx]);
  useEffect(() => () => stopSpeaking(), []);

  const togglePlay = useCallback(() => {
    if (!envelope) return;
    if (ended) {
      setPosition(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }, [ended, envelope]);

  const goToScene = useCallback(
    (idx: number) => {
      const start = boundaries[idx];
      if (start === undefined) return;
      setPosition(start);
      setPlaying(true);
    },
    [boundaries],
  );

  const prevScene = useCallback(() => {
    const start = boundaries[sceneIdx] ?? 0;
    setPosition(position - start > 2 ? start : boundaries[Math.max(0, sceneIdx - 1)] ?? 0);
  }, [boundaries, position, sceneIdx]);

  const nextScene = useCallback(() => {
    if (sceneIdx < scenes.length - 1) {
      goToScene(sceneIdx + 1);
    } else {
      setPosition(totalSeconds);
      setPlaying(false);
    }
  }, [goToScene, sceneIdx, scenes.length, totalSeconds]);

  // Callbacks live in a ref so the bindings register exactly once: the video
  // position ticks several times a second and re-registering on every tick
  // would thrash the shortcut registry. The sync runs in an effect — refs are
  // not written during render.
  const live = useRef({ togglePlay, prevScene, nextScene, onExit });
  useEffect(() => {
    live.current = { togglePlay, prevScene, nextScene, onExit };
  });

  const bindings = useMemo(
    () => [
      {
        key: " ",
        group: "Video lesson",
        label: "Play or pause",
        run: () => live.current.togglePlay(),
      },
      {
        key: "arrowright",
        group: "Video lesson",
        label: "Next scene",
        run: () => live.current.nextScene(),
      },
      {
        key: "arrowleft",
        group: "Video lesson",
        label: "Previous scene",
        run: () => live.current.prevScene(),
      },
      {
        key: "escape",
        group: "Video lesson",
        label: "Exit video",
        run: () => live.current.onExit(),
      },
    ],
    [],
  );
  useShortcuts(bindings, []);

  if (!envelope || !scene) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="card p-8 text-center animate-pulse">
          <p className="text-sm font-semibold text-ink inline-flex items-center gap-2">
            <VideoIcon size={ICON_SIZE.md} /> {regenerating ? "Generating a fresh storyboard…" : "Storyboarding the video…"}
          </p>
          <p className="text-sm text-ink3 mt-1">
            First generation can take a couple of minutes on the free tier. Without an AI provider the storyboard
            appears instantly from the authored spec data.
          </p>
        </div>
      </div>
    );
  }

  const sceneLeft = Math.max(0, Math.ceil(scene.seconds - (position - (boundaries[sceneIdx] ?? 0))));

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Video lesson</p>
          <h2 className="text-lg font-semibold truncate">{envelope.data.title}</h2>
        </div>
        <Button size="sm" variant="ghost" onClick={onExit}>
          Exit
        </Button>
      </div>

      {/* The frame: what would be on screen while the narration plays. */}
      <Panel className="p-0 overflow-hidden">
        <div
          className={cx(
            "relative flex flex-col items-center justify-center text-center gap-3",
            "bg-surface2 border-b border-line px-6 py-10 sm:py-14",
          )}
          aria-label={`Scene ${sceneIdx + 1}: ${scene.title}`}
        >
          <Pill className="absolute top-3 left-3">
            Scene {sceneIdx + 1} of {scenes.length}
            {scene.kind && scene.kind !== "teach" ? ` · ${KIND_LABELS[scene.kind]}` : ""}
          </Pill>
          <span className="absolute top-3 right-3 tabular-nums text-xs text-ink3">{clock(sceneLeft)} left</span>
          <p className="text-xl sm:text-2xl font-semibold tracking-tight text-ink max-w-md text-balance">
            {scene.onScreenText}
          </p>
          {ended ? (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
              <Button size="sm" variant="secondary" onClick={() => setPosition(0)}>
                <PlayIcon size={ICON_SIZE.sm} /> Watch again
              </Button>
              <Button size="sm" variant="primary" onClick={() => router.push(`/practice?topic=${topic.id}`)}>
                Drill this topic
              </Button>
              {nextTopic && onSelectTopic ? (
                <Button size="sm" variant="ghost" onClick={() => onSelectTopic(nextTopic)}>
                  Next: {nextTopic.title}
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={onExit}>
                Back to lessons
              </Button>
            </div>
          ) : null}
        </div>

        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">{scene.title}</p>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                disabled={regenerating}
                title="Ask the model for a brand-new storyboard for this topic"
                onClick={regenerate}
              >
                Regenerate
              </Button>
              <SourceBadge source={envelope.source} note={envelope.note} />
            </div>
          </div>
          <p className="text-xs text-ink3">
            <span className="font-semibold uppercase tracking-wide">Visual:</span> {scene.visual}
          </p>
          <p className="text-sm text-ink2">{scene.narration}</p>
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={prevScene} disabled={position === 0} aria-label="Previous scene">
                <BackIcon size={ICON_SIZE.sm} />
              </Button>
              <Button size="sm" variant="primary" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                {playing && !ended ? <PauseIcon size={ICON_SIZE.sm} /> : <PlayIcon size={ICON_SIZE.sm} />}
                {ended ? "Watch again" : playing ? "Pause" : "Play"}
              </Button>
              <Button size="sm" variant="ghost" onClick={nextScene} disabled={ended} aria-label="Next scene">
                <ForwardIcon size={ICON_SIZE.sm} />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <SpeakButton text={scene.narration} label="Read the narration aloud" />
              <Button
                size="sm"
                variant={autoNarrate ? "secondary" : "ghost"}
                disabled={!speechOk}
                title={speechOk ? "Speak every scene's narration automatically" : "Speech is not available in this browser"}
                onClick={() => {
                  const next = !autoNarrate;
                  setAutoNarrate(next);
                  try {
                    window.localStorage.setItem(NARRATE_KEY, next ? "1" : "0");
                  } catch {
                    /* private browsing: the toggle is best-effort */
                  }
                }}
              >
                {autoNarrate ? "Narration on" : "Auto-narrate"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowScript((s) => !s)}>
                {showScript ? "Hide script" : "Full script"}
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 pb-4">
          <ProgressBar value={Math.min(1, position / Math.max(1, totalSeconds))} />
          <div className="flex justify-between text-[11px] text-ink3 mt-1 tabular-nums">
            <span>{clock(position)}</span>
            <span>{clock(totalSeconds)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2" role="tablist" aria-label="Scenes">
            {scenes.map((s, i) => (
              <button
                key={`${s.title}-${i}`}
                role="tab"
                aria-selected={i === sceneIdx}
                aria-label={`Go to scene ${i + 1}: ${s.title}`}
                onClick={() => goToScene(i)}
                className={cx(
                  "h-1.5 rounded-full transition-all",
                  i === sceneIdx ? "w-6 bg-accent" : "w-3 bg-surface2 hover:bg-ink3",
                )}
              />
            ))}
          </div>
        </div>
      </Panel>

      {showScript ? (
        <Panel>
          <ol className="space-y-3">
            {scenes.map((s, i) => (
              <li key={`${s.title}-script-${i}`} className="text-sm">
                <p className="font-semibold text-ink">
                  {i + 1}. {s.title} <span className="text-xs text-ink3 font-normal">({s.seconds}s)</span>
                </p>
                <p className="text-ink2 mt-0.5">{s.narration}</p>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}

      <p className="text-[11px] text-ink3 text-center">
        <kbd className="font-mono px-1 py-0.5 rounded border border-line bg-surface2">Space</kbd> play/pause ·{" "}
        <kbd className="font-mono px-1 py-0.5 rounded border border-line bg-surface2">←→</kbd> scenes ·{" "}
        <kbd className="font-mono px-1 py-0.5 rounded border border-line bg-surface2">Esc</kbd> exit
      </p>
    </div>
  );
}
