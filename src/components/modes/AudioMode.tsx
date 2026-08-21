"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speak, speechAvailable, stopSpeaking } from "@/lib/speech";
import type { Card } from "@/domain/types";
import { RichText } from "../RichText";
import { Button, EmptyState, Panel, Pill, ProgressBar, cx } from "../ui";
import { AudioIcon, AudioOffIcon, ForwardIcon, ICON_SIZE } from "../icons";

// Hands-free listening. Reads the question, pauses long enough to actually
// answer it out loud, then reads the answer and moves on — so revision works
// while walking or with the screen off, which is time students otherwise lose.

/** Seconds of silence after the question before the answer is read. */
const THINK_SECONDS = 5;

export function AudioMode({ cards, onExit }: { cards: Card[]; onExit: () => void }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "question" | "thinking" | "answer">("idle");
  const [playing, setPlaying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const card = cards[index];

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    stopSpeaking();
    setPlaying(false);
    setPhase("idle");
    setCountdown(0);
  }, [clearTimers]);

  // Anything queued must be cancelled on unmount, or the voice keeps reading
  // cards aloud after the student has navigated away.
  useEffect(() => stop, [stop]);

  // Recursive: each card queues the next when its answer finishes. A ref
  // breaks the definition cycle that a plain const cannot express.
  const playFromRef = useRef<(at: number) => void>(() => {});

  const playFrom = useCallback(
    (at: number) => {
      const target = cards[at];
      if (!target) {
        stop();
        return;
      }
      clearTimers();
      setIndex(at);
      setPlaying(true);
      setPhase("question");

      speak(target.front, {
        onEnd: () => {
          setPhase("thinking");
          setCountdown(THINK_SECONDS);
          for (let s = 1; s <= THINK_SECONDS; s++) {
            timers.current.push(setTimeout(() => setCountdown(THINK_SECONDS - s), s * 1000));
          }
          timers.current.push(
            setTimeout(() => {
              setPhase("answer");
              speak(target.back, {
                onEnd: () => {
                  timers.current.push(setTimeout(() => playFromRef.current(at + 1), 900));
                },
              });
            }, THINK_SECONDS * 1000),
          );
        },
      });
    },
    [cards, clearTimers, stop],
  );

  useEffect(() => {
    playFromRef.current = playFrom;
  }, [playFrom]);

  if (!cards.length) {
    return <EmptyState title="Nothing to listen to" body="No cards match this selection." action={<Button onClick={onExit}>Back</Button>} />;
  }

  if (!speechAvailable()) {
    return (
      <EmptyState
        title="This browser cannot speak"
        body="Speech synthesis is unavailable here. Chrome, Edge and Safari all support it — or attach recorded audio to individual cards."
        action={<Button onClick={onExit}>Back</Button>}
      />
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Pill tone={phase === "thinking" ? "review" : undefined}>
          {phase === "question" ? "Question" : phase === "thinking" ? `Answer… ${countdown}` : phase === "answer" ? "Answer" : "Ready"}
        </Pill>
        <Button size="sm" variant="ghost" onClick={onExit}>
          End
        </Button>
      </div>

      <ProgressBar value={cards.length ? index / cards.length : 0} label={`${index + 1} of ${cards.length}`} />

      <Panel className="min-h-[13rem] flex flex-col justify-center">
        <RichText className="text-lg text-ink text-center">{card.front}</RichText>
        {phase === "answer" ? (
          <div className="mt-4 pt-4 border-t border-line fade-in">
            <RichText className="text-base text-center">{card.back}</RichText>
          </div>
        ) : phase === "thinking" ? (
          <p className="text-center text-sm text-ink3 mt-4">Say the answer out loud…</p>
        ) : null}
      </Panel>

      <div className="flex gap-2">
        <Button
          variant="primary"
          className="flex-1 min-h-[3rem]"
          onClick={() => (playing ? stop() : playFrom(index))}
        >
          {playing ? (
            <>
              <AudioOffIcon size={ICON_SIZE.md} aria-hidden />
              Pause
            </>
          ) : (
            <>
              <AudioIcon size={ICON_SIZE.md} aria-hidden />
              Play
            </>
          )}
        </Button>
        <Button
          className={cx("min-h-[3rem]")}
          onClick={() => (playing ? playFrom(index + 1) : setIndex((i) => Math.min(cards.length - 1, i + 1)))}
          aria-label="Next card"
        >
          <ForwardIcon size={ICON_SIZE.md} aria-hidden />
        </Button>
      </div>

      <p className="text-[11px] text-ink3 text-center">
        Plays continuously: question, {THINK_SECONDS} seconds to answer, then the answer.
      </p>
    </div>
  );
}
