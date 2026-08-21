"use client";

import { useMemo, useState } from "react";
import {
  answerLearn,
  buildChoices,
  learnProgress,
  startLearnSession,
  strugglingCards,
} from "@/domain/study-modes";
import { matchesWritten } from "@/domain/study-modes";
import type { Card } from "@/domain/types";
import { RichText } from "../RichText";
import { SpeakButton } from "../SpeakButton";
import { Button, EmptyState, Panel, Pill, ProgressBar, cx } from "../ui";
import { CreditedIcon, ICON_SIZE, MissedIcon } from "../icons";

// Learn mode walks each card from recognition to production: multiple choice
// first, then type it from memory. A card only graduates once the student has
// produced it, because recognising an answer among four options is a much
// weaker signal than writing it — and the exam asks for the latter.

export function LearnMode({ cards, onExit }: { cards: Card[]; onExit: () => void }) {
  const [seed] = useState(() => Math.floor(Math.random() * 100000));
  const [session, setSession] = useState(() => startLearnSession(cards, seed));
  const [typed, setTyped] = useState("");
  const [verdict, setVerdict] = useState<{ correct: boolean; expected: string } | null>(null);

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const currentId = session.queue[0];
  const current = currentId ? byId.get(currentId) : undefined;
  const state = currentId ? session.states[currentId] : undefined;
  const progress = learnProgress(session);

  const stage = state?.stage;
  const seen = state?.seen ?? 0;
  const choices = useMemo(
    () => (current && stage === "multiple-choice" ? buildChoices(current, cards, 4, seed + seen) : []),
    [current, cards, stage, seen, seed],
  );

  function submit(correct: boolean, expected: string) {
    if (!current) return;
    setVerdict({ correct, expected });
  }

  function next() {
    if (!current || !verdict) return;
    setSession((prev) => answerLearn(prev, current.id, verdict.correct));
    setVerdict(null);
    setTyped("");
  }

  if (!cards.length) {
    return <EmptyState title="Nothing to learn" body="No cards match this selection." action={<Button onClick={onExit}>Back</Button>} />;
  }

  if (!current) {
    const struggling = strugglingCards(session);
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <Panel>
          <p className="text-2xl font-semibold tabular-nums">{progress.total} learned</p>
          <p className="text-sm text-ink3 mt-1">
            {Math.round(progress.accuracy * 100)}% of your answers were right first time.
          </p>
          {struggling.length ? (
            <div className="mt-4 pt-3 border-t border-line">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1.5">
                Kept slipping — worth rewriting
              </p>
              <ul className="space-y-1">
                {struggling.slice(0, 5).map((id) => (
                  <li key={id} className="text-xs text-ink2 line-clamp-1">
                    {byId.get(id)?.front}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>
        <Button variant="primary" className="w-full" onClick={onExit}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Pill tone={state?.stage === "typed" ? "success" : undefined}>
            {state?.stage === "typed" ? "Type it from memory" : "Choose the answer"}
          </Pill>
          <SpeakButton text={current.front} />
        </div>
        <Button size="sm" variant="ghost" onClick={onExit}>
          End
        </Button>
      </div>

      <ProgressBar value={progress.total ? progress.done / progress.total : 0} label={`${progress.done} of ${progress.total} learned`} />

      <Panel className="min-h-[14rem]">
        <RichText className="text-base text-ink">{current.front}</RichText>
        {current.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.imageUrl} alt="" className="mt-3 max-h-52 rounded-[8px] border border-line" />
        ) : null}

        {state?.stage === "multiple-choice" ? (
          <ul className="mt-5 space-y-2">
            {choices.map((choice) => {
              const isAnswer = choice === current.back.trim();
              const chosenWrong = verdict && !verdict.correct && !isAnswer;
              return (
                <li key={choice}>
                  <button
                    disabled={Boolean(verdict)}
                    type="button"
                    onClick={() => submit(isAnswer, current.back)}
                    className={cx(
                      "w-full text-left card px-3.5 py-3 min-h-[3rem] transition-colors",
                      !verdict && "hover:border-ink3 active:scale-[0.99]",
                      verdict && isAnswer && "border-success bg-successsoft",
                      chosenWrong && "opacity-50",
                    )}
                  >
                    <RichText className="text-sm">{choice}</RichText>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-5 space-y-2">
            <input
              value={typed}
              autoFocus
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                if (verdict) next();
                else if (typed.trim()) submit(matchesWritten(typed, current.back), current.back);
              }}
              disabled={Boolean(verdict)}
              placeholder="Type the answer…"
              className="field"
            />
            {!verdict ? (
              <Button
                variant="primary"
                className="w-full"
                disabled={!typed.trim()}
                onClick={() => submit(matchesWritten(typed, current.back), current.back)}
              >
                Check
              </Button>
            ) : null}
          </div>
        )}

        {verdict ? (
          <div className="mt-4 pt-4 border-t border-line fade-in">
            <p className={cx("text-sm font-semibold flex items-center gap-1.5", verdict.correct ? "text-success" : "text-danger")}>
              {verdict.correct ? (
                <>
                  <CreditedIcon size={ICON_SIZE.md} aria-hidden /> Correct
                </>
              ) : (
                <>
                  <MissedIcon size={ICON_SIZE.md} aria-hidden /> Not quite
                </>
              )}
            </p>
            {!verdict.correct ? (
              <div className="mt-1.5">
                <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Answer</p>
                <RichText className="text-sm">{verdict.expected}</RichText>
              </div>
            ) : null}
            <Button variant="primary" className="w-full mt-3" onClick={next} autoFocus>
              Continue
            </Button>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
