"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getTopic } from "@/domain/curriculum";
import { previewIntervals } from "@/domain/scheduling";
import type { Card, Id, RecallGrade } from "@/domain/types";
import { useStore } from "@/state/store";
import { Button, Panel, Pill, ProgressBar } from "./ui";
import { RichText } from "./RichText";
import { SpeakButton } from "./SpeakButton";

// Inline card retrieval for the adaptive runner — one card, one decision, and
// the grades stream back to the session instead of the student being sent to
// the review route. Confidence is captured before the reveal, exactly as the
// review session does, because asked afterwards it measures hindsight.

const GRADES: { grade: RecallGrade; label: string; hint: string }[] = [
  { grade: "again", label: "Again", hint: "Blanked" },
  { grade: "hard", label: "Hard", hint: "Struggled" },
  { grade: "good", label: "Good", hint: "Recalled" },
  { grade: "easy", label: "Easy", hint: "Instant" },
];

export interface RetrievalOutcome {
  grades: RecallGrade[];
  missedItemIds: Id[];
}

export function AdaptiveRetrievalBlock({
  cards,
  onComplete,
}: {
  cards: Card[];
  onComplete: (outcome: RetrievalOutcome) => void | Promise<void>;
}) {
  const store = useStore();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [confidence, setConfidence] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [grades, setGrades] = useState<RecallGrade[]>([]);
  const finishedRef = useRef(false);
  const cardShownAt = useRef(0);

  const current = cards[index];
  const done = grades.length;

  useEffect(() => {
    cardShownAt.current = Date.now();
  }, [index]);

  const remaining = cards.slice(index + 1);
  const progressTotal = Math.max(1, cards.length);
  const topic = current ? getTopic(current.topicId) : undefined;

  // useCallback rather than a plain function: this reads the clock and the
  // card-shown ref, which only makes sense once an interaction has happened,
  // never while rendering.
  const grade = useCallback(
    async (value: RecallGrade) => {
      if (!current || finishedRef.current) return;
      const elapsed = cardShownAt.current ? Date.now() - cardShownAt.current : 0;
      // Same persistence path as /review: FSRS grade + review log + session clock.
      await store.reviewCard(current, value, elapsed, confidence ?? undefined);
      const nextGrades = [...grades, value];
      setGrades(nextGrades);
      setRevealed(false);
      setConfidence(null);
      if (index >= cards.length - 1) {
        finishedRef.current = true;
        await onComplete({
          grades: nextGrades,
          missedItemIds: cards.filter((_, i) => nextGrades[i] === "again").map((card) => card.id),
        });
      } else {
        setIndex((i) => i + 1);
      }
    },
    [cards, confidence, current, grades, index, onComplete, store],
  );

  const intervals = current ? previewIntervals(current) : null;

  return (
    <div className="space-y-4">
      <ProgressBar value={progressTotal ? done / progressTotal : 0} label={`${done} of ${cards.length} recalled`} />
      {current ? (
        <Panel className="min-h-[15rem] flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Pill>{cardKindLabel(current)}</Pill>
            {remaining.length ? (
              <span className="text-xs text-ink3 tabular-nums" aria-live="polite">
                {remaining.length} card{remaining.length === 1 ? "" : "s"} left
              </span>
            ) : (
              <span className="text-xs text-ink3">Last card</span>
            )}
            <span className="ml-auto">
              <SpeakButton text={revealed ? current.back : current.front} audioUrl={current.audioUrl} />
            </span>
          </div>

          <div className="flex-1">
            <RichText className="text-base text-ink">{current.front}</RichText>
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
                <div className="flex gap-1.5" role="group" aria-label="Confidence before revealing">
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
                Show answer
              </Button>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-4 gap-1.5" role="group" aria-label="How well did you recall it?">
              {GRADES.map((option) => (
                <button
                  key={option.grade}
                  type="button"
                  onClick={() => void grade(option.grade)}
                  className="card p-2 min-h-[4.25rem] flex flex-col justify-center text-center hover:border-ink3 active:scale-[0.98] transition-all"
                >
                  <span className="block text-xs font-semibold text-ink">{option.label}</span>
                  <span className="block text-[10px] text-ink3">{option.hint}</span>
                  {intervals ? (
                    <span className="block text-[10px] text-ink3 tabular-nums mt-0.5">
                      {intervals[option.grade] === 0 ? "today" : `${intervals[option.grade]}d`}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </Panel>
      ) : (
        <p className="text-xs text-ink3" role="status">
          All {cards.length} cards handled.
        </p>
      )}
      {topic?.commonErrors.length && revealed ? (
        <p className="text-xs text-ink3">
          <span className="font-semibold text-ink2">Examiner note: </span>
          {topic.commonErrors[0]}
        </p>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {current ? `${done + 1} of ${cards.length}` : `${done} recalled`}
      </span>
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
