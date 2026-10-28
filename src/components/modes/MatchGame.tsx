"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { buildMatchBoard, isMatch, matchScore, MATCH_PAIRS } from "@/domain/study-modes";
import type { MatchTile } from "@/domain/study-modes";
import type { Card } from "@/domain/types";
import { RichText } from "../RichText";
import { Button, EmptyState, Panel, Pill, cx } from "../ui";
import { TimerIcon, ICON_SIZE } from "../icons";

// The match game. The only mode where speed is the point: it drills the
// front→back association until recognition is instant, which is what makes
// the slower recall modes feel less like wading.

/** The next move the game accepts for one tapped tile. */
type MatchChoice =
  | { action: "select"; tile: MatchTile }
  | { action: "deselect" }
  | { action: "match"; tile: MatchTile }
  | { action: "wrong"; tile: MatchTile }
  | { action: "ignore" };

/**
 * The game's rules, pure so the component only commits their result. A tap is
 * ignored while the round is over, the tile is already matched, or a wrong
 * pair is still on show; a first tap selects, a second either matches or is
 * briefly shown as wrong.
 */
export function nextMove(
  tap: MatchTile,
  game: { finished: boolean; selected: MatchTile | null; matched: ReadonlySet<string>; showingWrong: boolean },
): MatchChoice {
  if (game.finished || game.showingWrong || game.matched.has(tap.id)) return { action: "ignore" };
  if (!game.selected) return { action: "select", tile: tap };
  if (game.selected.id === tap.id) return { action: "deselect" };
  return isMatch(game.selected, tap) ? { action: "match", tile: tap } : { action: "wrong", tile: tap };
}

const NO_SUBSCRIBE = () => () => {};
let clientSeedCache: number | null = null;
function clientSeed(): number {
  if (clientSeedCache == null) clientSeedCache = Math.floor(Math.random() * 100000) + 1;
  return clientSeedCache;
}
const DETERMINISTIC_SEED = () => 1;

export function MatchGame({ cards, onExit }: { cards: Card[]; onExit: () => void }) {
  // A random seed computed during render would build a different board on the
  // server and the client; the server snapshot stays deterministic and React
  // swaps to the per-load random seed right after hydration.
  const seed = useSyncExternalStore(NO_SUBSCRIBE, clientSeed, DETERMINISTIC_SEED);
  // Restart resets every round value in one move: the round is keyed on the
  // deal, so React discards the old state and mounts fresh — no effect that
  // copies a snapshot of the state into more state.
  const [round, setRound] = useState(0);

  const board = useMemo(() => buildMatchBoard(cards, MATCH_PAIRS, seed), [cards, seed]);
  const pairs = board.length / 2;

  if (cards.length < 2) {
    return (
      <EmptyState
        title="Not enough cards"
        body="The match game needs at least two cards in the selection."
        action={<Button onClick={onExit}>Back</Button>}
      />
    );
  }

  return <MatchRound key={round} board={board} pairs={pairs} onRestart={() => setRound((n) => n + 1)} onExit={onExit} />;
}

/**
 * Seconds on the round's clock, read as a wall-clock span instead of an
 * accumulated state number. A 200 ms tick that stored elapsed state kept
 * running after the last matching move, so the finished screen read up to a
 * fifth of a second fast — a score reward for doing it well. The store
 * subscription stops as soon as the round is over, so the last tick before
 * the freeze is the time the final matching move landed.
 */
function useStopwatch(finished: boolean): number {
  const startedAt = useState(() => Date.now())[0];
  const subscribeTick = useCallback(
    (onChange: () => void) => {
      if (finished) return NO_SUBSCRIBE;
      const id = window.setInterval(onChange, 200);
      return () => window.clearInterval(id);
    },
    [finished],
  );
  const tick = useSyncExternalStore(
    subscribeTick,
    () => Date.now(),
    () => 0,
  );
  return Math.max(0, tick - startedAt);
}

function MatchRound({
  board,
  pairs,
  onRestart,
  onExit,
}: {
  board: MatchTile[];
  pairs: number;
  onRestart: () => void;
  onExit: () => void;
}) {
  const [selected, setSelected] = useState<MatchTile | null>(null);
  const [matched, setMatched] = useState<ReadonlySet<string>>(() => new Set());
  const [wrongPair, setWrongPair] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const finished = matched.size === board.length && board.length > 0;
  const elapsed = useStopwatch(finished);
  const wrongTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear a pending "wrong pair" reveal on unmount so a fast exit cannot
  // resurrect state on a dead component.
  useEffect(
    () => () => {
      if (wrongTimer.current) clearTimeout(wrongTimer.current);
    },
    [],
  );

  const choose = (tile: MatchTile) => {
    const move = nextMove(tile, { finished, selected, matched, showingWrong: wrongPair.length > 0 });
    switch (move.action) {
      case "ignore":
        return;
      case "select":
        setSelected(move.tile);
        return;
      case "deselect":
        setSelected(null);
        return;
      case "match": {
        const next = new Set([...matched, move.tile.id, tile.id]);
        setMatched(next);
        setSelected(null);
        // The stopwatch freezes with this commit: `finished` flips true here,
        // which unsubscribes the tick, so the score reads the time the final
        // matching move landed, not whenever the next 200 ms tick came.
        return;
      }
      case "wrong":
        setMistakes((m) => m + 1);
        setWrongPair([selected!.id, move.tile.id]);
        setSelected(null);
        if (wrongTimer.current) clearTimeout(wrongTimer.current);
        // Show the wrong pair briefly before clearing — an instant reset gives
        // no chance to register what was wrong.
        wrongTimer.current = setTimeout(() => setWrongPair([]), 450);
        return;
    }
  };

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
          <Button variant="primary" className="flex-1" onClick={onRestart}>
            Play again
          </Button>
          <Button className="flex-1" onClick={onExit}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  // Tiles flip while they are on show: selected, one of a just-missed pair, or
  // still hidden. A matched pair leaves the grid so nothing can be re-tapped.
  const tileTone = (tile: MatchTile) => {
    if (matched.has(tile.id)) return "matched" as const;
    if (wrongPair.includes(tile.id)) return "wrong" as const;
    if (selected?.id === tile.id) return "selected" as const;
    return "hidden" as const;
  };

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
          const tone = tileTone(tile);
          return (
            <li key={tile.id}>
              <button
                type="button"
                onClick={() => choose(tile)}
                disabled={tone === "matched"}
                aria-pressed={tone === "selected"}
                aria-label={tone === "selected" || tone === "wrong" ? tile.text : "Card tile"}
                className={cx(
                  // Tall enough to be a comfortable phone target, and to fit
                  // a two-line definition without clipping.
                  "w-full h-24 sm:h-28 card p-2.5 text-left overflow-hidden transition-all",
                  tone === "matched" && "opacity-0 pointer-events-none scale-95",
                  tone === "wrong" && "border-danger bg-dangersoft",
                  tone === "selected" && "border-ink3 bg-surface2 scale-[0.98]",
                  (tone === "hidden" || tone === "wrong") && "active:scale-[0.98]",
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
