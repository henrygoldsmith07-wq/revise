"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSubject, getTopic } from "@/domain/curriculum";
import { buildPostSessionClosure } from "@/domain/post-session-closure";
import { buildReviewQueue, buryCard, isDue, previewIntervals, reinsert, setSuspended, todayIso } from "@/domain/scheduling";
import { CUSTOM_STUDY_KEY } from "@/components/CustomStudyDialog";
import { useShortcuts } from "@/components/shortcuts";
import type { Card, RecallGrade } from "@/domain/types";
import { useStore } from "@/state/store";
import { PostSessionClosure } from "@/components/PostSessionClosure";
import { Button, ButtonLink, EmptyState, Panel, Pill, ProgressBar } from "@/components/ui";
import { SpeakButton } from "@/components/SpeakButton";
import { RichText } from "@/components/RichText";

// The review session. One card, one decision, no chrome competing for
// attention. Confidence is captured *before* the answer is revealed, because
// asked afterwards it measures hindsight rather than metacognition.

const GRADES: { grade: RecallGrade; label: string; hint: string }[] = [
  { grade: "again", label: "Again", hint: "Blanked" },
  { grade: "hard", label: "Hard", hint: "Struggled" },
  { grade: "good", label: "Good", hint: "Recalled" },
  { grade: "easy", label: "Easy", hint: "Instant" },
];

export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewSession />
    </Suspense>
  );
}

function ReviewSession() {
  const params = useSearchParams();
  const store = useStore();
  const { saveRevisionCheckpoint, clearRevisionCheckpoint } = store;
  const subjectId = params.get("subject");
  const topicId = params.get("topic");
  const mode = params.get("mode");
  const sessionId = params.get("session");
  const resumeRequested = params.get("resume") === "1";
  const savedCheckpoint =
    resumeRequested && store.revisionCheckpoint?.activity === "review" ? store.revisionCheckpoint : null;

  const [revealed, setRevealed] = useState(false);
  const [confidence, setConfidence] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  // Time is accumulated per card rather than measured against a wall clock, so
  // a session left open in a background tab does not report an hour of work.
  const [done, setDone] = useState(() => ({
    reviewed: savedCheckpoint?.position ?? 0,
    again: savedCheckpoint?.repeatCount ?? 0,
    totalMs: 0,
  }));
  const cardShownAt = useRef(0);

  // A custom session hands over an explicit id list through sessionStorage.
  // Read once, at mount: re-reading would resurrect the session after it ends.
  const [custom] = useState(() => {
    if (mode !== "custom" || typeof sessionStorage === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(CUSTOM_STUDY_KEY);
      return raw ? (JSON.parse(raw) as { ids: string[]; preview: boolean }) : null;
    } catch {
      return null;
    }
  });

  const pool = useMemo(() => {
    const today = todayIso();
    if (custom) {
      const wanted = new Map(custom.ids.map((id, index) => [id, index]));
      return store.cards
        .filter((card) => wanted.has(card.id))
        .sort((a, b) => (wanted.get(a.id) ?? 0) - (wanted.get(b.id) ?? 0));
    }
    return store.cards.filter((card) => {
      if (!store.settings.subjectIds.includes(card.subjectId)) return false;
      if (subjectId && card.subjectId !== subjectId) return false;
      if (topicId && card.topicId !== topicId) return false;
      if (mode === "mistakes") {
        if (card.kind !== "mistake" || card.suspended) return false;
        const sourceMistake = card.sourceMistakeId
          ? store.mistakes.find((mistake) => mistake.id === card.sourceMistakeId)
          : undefined;
        return !sourceMistake?.resolved;
      }
      return isDue(card, today);
    });
  }, [store.cards, store.mistakes, store.settings.subjectIds, subjectId, topicId, mode, custom]);

  // The queue is built once, at mount: rebuilding it as cards are graded would
  // reshuffle the deck underneath the student mid-session.
  const [queue, setQueue] = useState<Card[]>(() => {
    if (savedCheckpoint?.queueIds?.length) {
      const byId = new Map(store.cards.map((card) => [card.id, card] as const));
      const restored = savedCheckpoint.queueIds.map((id) => byId.get(id)).filter((card): card is Card => Boolean(card));
      if (restored.length) return restored;
    }
    // A custom session is already ordered and limited by the dialog; passing it
    // back through the scheduler's queue builder would undo both.
    if (custom) return pool;
    const limit = mode === "mistakes" ? 20 : Math.max(10, Math.ceil(store.settings.sessionLengthMinutes * 2.5));
    return buildReviewQueue(pool, limit);
  });

  const current = queue[0];
  const total = queue.length + done.reviewed;
  const isPreview = Boolean(custom?.preview);

  const checkpointHref = useMemo(() => {
    const next = new URLSearchParams();
    if (subjectId) next.set("subject", subjectId);
    if (topicId) next.set("topic", topicId);
    if (mode) next.set("mode", mode);
    if (sessionId) next.set("session", sessionId);
    next.set("resume", "1");
    const query = next.toString();
    return query ? `/review?${query}` : "/review?resume=1";
  }, [mode, sessionId, subjectId, topicId]);

  useEffect(() => {
    if (!current) {
      if (resumeRequested || done.reviewed > 0) void clearRevisionCheckpoint();
      return;
    }
    void saveRevisionCheckpoint({
      activity: "review",
      title: custom ? "Custom study" : mode === "mistakes" ? "Mistake repair" : "Spaced repetition",
      href: checkpointHref,
      position: done.reviewed,
      total,
      queueIds: queue.map((card) => card.id),
      repeatCount: done.again,
    });
  }, [checkpointHref, clearRevisionCheckpoint, custom, current, done, mode, queue, resumeRequested, saveRevisionCheckpoint, total]);

  useEffect(() => {
    cardShownAt.current = Date.now();
  }, []);

  // useCallback rather than a plain declaration: these read the clock and the
  // card-shown ref, which only makes sense once an interaction has happened,
  // never while rendering.
  const skipCurrent = useCallback(
    async (transform: (card: Card) => Card) => {
      if (!current) return;
      await store.updateCards([transform(current)]);
      setQueue((q) => q.slice(1));
      setRevealed(false);
      setConfidence(null);
      cardShownAt.current = Date.now();
    },
    [current, store],
  );

  useShortcuts(
    [
      { key: " ", group: "Review", label: "Show answer", disabled: revealed, run: () => setRevealed(true) },
      { key: "enter", group: "Review", label: "Show answer", disabled: revealed, run: () => setRevealed(true) },
      ...GRADES.map((option, i) => ({
        key: String(i + 1),
        group: "Review",
        label: `Grade "${option.label}"`,
        disabled: !revealed,
        run: () => void grade(option.grade),
      })),
      { key: "s", group: "Review", label: "Suspend this card", run: () => void skipCurrent((c) => setSuspended(c, true)) },
      { key: "b", group: "Review", label: "Bury until tomorrow", run: () => void skipCurrent((c) => buryCard(c)) },
    ],
    [current, revealed, confidence, isPreview],
  );

  const grade = useCallback(
    async (value: RecallGrade) => {
    if (!current) return;
    const elapsed = cardShownAt.current ? Date.now() - cardShownAt.current : 0;
    // Preview sessions are cramming: grading a card that is not due would
    // shorten every future interval on it, so the schedule is left alone.
    if (!isPreview) {
      await store.reviewCard(current, value, elapsed, confidence ?? undefined);
    }

    // "Again" cards come back inside this session — tomorrow is too late to
    // repair a card you have just proved you cannot recall.
    const rest = queue.slice(1);
    setQueue(value === "again" ? reinsert(rest, current, 4) : rest);
    setDone((d) => ({
      reviewed: d.reviewed + 1,
      again: d.again + (value === "again" ? 1 : 0),
      totalMs: d.totalMs + elapsed,
    }));
    setRevealed(false);
    setConfidence(null);
    cardShownAt.current = Date.now();
    },
    [current, queue, confidence, isPreview, store],
  );

  if (!current) {
    return (
      <SessionSummary
        reviewed={done.reviewed}
        again={done.again}
        minutes={Math.max(1, Math.round(done.totalMs / 60_000))}
        sessionId={sessionId}
      />
    );
  }

  const topic = getTopic(current.topicId);
  const intervals = previewIntervals(current);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink3 truncate">
            {getSubject(current.subjectId)?.name} · {topic?.title}
          </p>
          <h1 className="text-sm font-semibold">
            {custom ? "Custom study" : mode === "mistakes" ? "Mistake repair" : "Spaced repetition"}
          </h1>
        </div>
        <ButtonLink href="/" size="sm" variant="ghost">End session</ButtonLink>
      </div>

      {isPreview ? (
        <p className="text-xs text-review card card-2 px-3 py-2">
          Preview session — you are studying ahead, so nothing here changes when these cards come back.
        </p>
      ) : null}

      <ProgressBar value={total ? done.reviewed / total : 0} label={`${done.reviewed} of ${total}`} />

      <Panel className="min-h-[16rem] flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <Pill>{cardKindLabel(current)}</Pill>
          {current.lapses > 2 ? <Pill tone="danger">Leech · {current.lapses} lapses</Pill> : null}
          <span className="ml-auto">
            <SpeakButton text={revealed ? current.back : current.front} audioUrl={current.audioUrl} />
          </span>
        </div>

        <div className="flex-1">
          <RichText className="text-base text-ink">{current.front}</RichText>
          {current.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.imageUrl} alt="" className="mt-3 max-h-60 rounded-[8px] border border-line mx-auto" />
          ) : null}

          {revealed ? (
            <div className="mt-5 pt-4 border-t border-line fade-in">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1.5">Answer</p>
              <RichText className="text-base">{current.back}</RichText>
              {current.note ? <p className="text-xs text-ink3 mt-2 italic">{current.note}</p> : null}
            </div>
          ) : null}
        </div>

        {!revealed ? (
          <div className="mt-5 space-y-3">
            <div>
              <p className="text-[11px] text-ink3 mb-1.5">How confident are you, before you look?</p>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setConfidence(value as 1 | 2 | 3 | 4 | 5)}
                    aria-pressed={confidence === value}
                    className={`flex-1 min-h-[2.5rem] text-xs font-semibold rounded-[8px] border transition-colors ${
                      confidence === value
                        ? "bg-accent text-onaccent border-transparent"
                        : "border-line text-ink3 hover:text-ink"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <Button variant="primary" className="w-full min-h-[3rem]" onClick={() => setRevealed(true)}>
              Show answer <span className="text-[10px] opacity-60">space</span>
            </Button>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-4 gap-1.5">
            {GRADES.map((option, i) => (
              <button
                key={option.grade}
                type="button"
                onClick={() => void grade(option.grade)}
                // min-h keeps these comfortably tappable on a phone, where
                // this is the single most-used control in the app.
                className="card p-2 min-h-[4.25rem] flex flex-col justify-center text-center hover:border-ink3 active:scale-[0.98] transition-all"
              >
                <span className="block text-xs font-semibold text-ink">{option.label}</span>
                <span className="block text-[10px] text-ink3">{option.hint}</span>
                <span className="block text-[10px] text-ink3 tabular-nums mt-0.5">
                  {intervals[option.grade] === 0 ? "today" : `${intervals[option.grade]}d`}
                </span>
                <span className="sr-only">Press {i + 1}</span>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {topic?.commonErrors.length && revealed ? (
        <p className="text-xs text-ink3">
          <span className="font-semibold text-ink2">Examiner note: </span>
          {topic.commonErrors[0]}
        </p>
      ) : null}
    </div>
  );
}

function cardKindLabel(card: Card): string {
  switch (card.kind) {
    case "cloze":
      return "Cloze";
    case "equation":
      return "Equation";
    case "image":
      return "Diagram";
    case "mistake":
      return "From a mistake";
    default:
      return card.origin === "ai" ? "AI generated" : "Recall";
  }
}

function SessionSummary({
  reviewed,
  again,
  minutes,
  sessionId,
}: {
  reviewed: number;
  again: number;
  minutes: number;
  sessionId: string | null;
}) {
  const store = useStore();
  const logged = useRef(false);

  useEffect(() => {
    // A ref, not state: marking the planned session done is a side effect that
    // must happen exactly once and has nothing to render.
    if (sessionId && reviewed > 0 && !logged.current) {
      logged.current = true;
      void store.completeSession(sessionId);
    }
  }, [sessionId, reviewed, store]);

  if (reviewed === 0) {
    return (
      <EmptyState
        title="Nothing due here"
        body="Spaced repetition deliberately leaves gaps — reviewing early wastes the effect. Pick another activity and come back when cards fall due."
        action={
          <ButtonLink href="/" variant="primary">Back to today</ButtonLink>
        }
      />
    );
  }

  const closure = buildPostSessionClosure({
    session: "review",
    attempted: reviewed,
    total: reviewed,
    retryCount: again,
    elapsedMs: minutes * 60_000,
  });
  return (
    <PostSessionClosure
      closure={closure}
      hint="Every card has been rescheduled by FSRS from how you graded it."
      secondary={{ href: "/practice", label: "Practise questions" }}
    />
  );
}
