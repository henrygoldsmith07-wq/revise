"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildMatchBoard, isMatch, matchScore, MATCH_PAIRS } from "@/domain/study-modes";
import type { MatchTile } from "@/domain/study-modes";
import type { Card } from "@/domain/types";
import { RichText } from "../RichText";
import { Button, EmptyState, Panel, Pill, cx } from "../ui";
import { TimerIcon, ICON_SIZE } from "../icons";

// The match game. The only mode where speed is the point: it drills the
// front↔back association until recognition is instant, which is what makes
// the slower recall modes feel less like wading.

export function MatchGame({ cards, onExit }: { cards: Card[]; onExit: () => void }) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));
  const [selected, setSelected] = useState<MatchTile | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrongPair, setWrongPair] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const [finished, setFinished] = useState(false);

  const board = useMemo(() => buildMatchBoard(cards, MATCH_PAIRS, seed), [cards, seed]);
  const pairs = board.length / 2;

  useEffect(() => {
    startedAt.current = Date.now();
    const tick = setInterval(() => setElapsed(Date.now() - startedAt.current), 200);
    return () => clearInterval(tick);
  }, [seed]);

  function choose(tile: MatchTile) {
    if (finished || matched.has(tile.id) || wrongPair.length) return;
    if (!selected) {
      setSelected(tile);
      return;
    }
    if (selected.id === tile.id) {
      setSelected(null);
      return;
    }

    if (isMatch(selected, tile)) {
      const next = new Set([...matched, selected.id, tile.id]);
      setMatched(next);
      setSelected(null);
      // Decided here rather than in an effect: the move that completes the
      // board is exactly when the game is over, and the timer must stop then.
      if (next.size === board.length) setFinished(true);
      return;
    }

    // Show the wrong pair briefly before clearing — an instant reset gives no
    // chance to register what was wrong.
    setMistakes((m) => m + 1);
    setWrongPair([selected.id, tile.id]);
    setSelected(null);
    setTimeout(() => setWrongPair([]), 450);
  }

  function restart() {
    setSeed(Math.floor(Math.random() * 100000));
    setSelected(null);
    setMatched(new Set());
    setWrongPair([]);
    setMistakes(0);
    setElapsed(0);
    setFinished(false);
  }

  if (cards.length < 2) {
    return (
      <EmptyState
        title="Not enough cards"
        body="The match game needs at least two cards in the selection."
        action={<Button onClick={onExit}>Back</Button>}
      />
    );
  }

  if (finished) {
    const score = matchScore(elapsed, mistakes);
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <Panel className="text-center">
          <p className="text-3xl font-semibold tabular-nums">{score}</p>
          <p className="text-xs text-ink3 mt-1">
            {(elapsed / 1000).toFixed(1)}s + {mistakes} mistake{mistakes === 1 ? "" : "s"} × 5s penalty
          </p>
        </Panel>
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" onClick={restart}>
            Play again
          </Button>
          <Button className="flex-1" onClick={onExit}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Pill>
            <TimerIcon size={ICON_SIZE.sm} aria-hidden />
            {(elapsed / 1000).toFixed(1)}s
          </Pill>
          <Pill tone={mistakes ? "danger" : undefined}>
            {matched.size / 2} of {pairs}
          </Pill>
        </div>
        <Button size="sm" variant="ghost" onClick={onExit}>
          End
        </Button>
      </div>

      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {board.map((tile) => {
          const isMatched = matched.has(tile.id);
          const isWrong = wrongPair.includes(tile.id);
          return (
            <li key={tile.id}>
              <button
                type="button"
                onClick={() => choose(tile)}
                disabled={isMatched}
                aria-pressed={selected?.id === tile.id}
                className={cx(
                  // Tall enough to be a comfortable phone target, and to fit
                  // a two-line definition without clipping.
                  "w-full h-24 sm:h-28 card p-2.5 text-left overflow-hidden transition-all",
                  isMatched && "opacity-0 pointer-events-none scale-95",
                  isWrong && "border-danger bg-dangersoft",
                  selected?.id === tile.id && "border-ink3 bg-surface2 scale-[0.98]",
                  !isMatched && !isWrong && "active:scale-[0.98]",
                )}
              >
                <RichText className="text-xs line-clamp-4">{tile.text}</RichText>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] text-ink3 text-center">Tap a question, then its answer.</p>
    </div>
  );
}
