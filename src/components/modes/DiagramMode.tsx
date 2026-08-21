"use client";

import { useMemo, useState } from "react";
import {
  diagramScore,
  isDiagramComplete,
  parseDiagram,
  placeLabel,
  startDiagramRound,
} from "@/domain/diagrams";
import type { DiagramSpec } from "@/domain/diagrams";
import type { Card } from "@/domain/types";
import { Button, EmptyState, Panel, Pill, cx } from "../ui";
import { CreditedIcon, ICON_SIZE } from "../icons";

// Diagram labelling. Pick a label, tap the point it belongs to. Wrong
// placements are counted and rejected rather than left on the image — a label
// sitting in the wrong place is exactly the thing the student would remember.

export function DiagramMode({ cards, onExit }: { cards: Card[]; onExit: () => void }) {
  const diagrams = useMemo(
    () => cards.map((card) => ({ card, spec: parseDiagram(card) })).filter((d): d is { card: Card; spec: DiagramSpec } => d.spec !== null),
    [cards],
  );
  const [index, setIndex] = useState(0);
  const entry = diagrams[index];

  if (!diagrams.length) {
    return (
      <EmptyState
        title="No diagrams yet"
        body="Diagram cards carry an image and a set of labelled points. Create one from the card editor, or import a deck that has them."
        action={<Button onClick={onExit}>Back</Button>}
      />
    );
  }

  return (
    <DiagramRound
      key={entry.card.id}
      spec={entry.spec}
      title={entry.card.front}
      position={{ index: index + 1, total: diagrams.length }}
      onNext={() => (index + 1 < diagrams.length ? setIndex(index + 1) : onExit())}
      onExit={onExit}
    />
  );
}

function DiagramRound({
  spec,
  title,
  position,
  onNext,
  onExit,
}: {
  spec: DiagramSpec;
  title: string;
  position: { index: number; total: number };
  onNext: () => void;
  onExit: () => void;
}) {
  const [round, setRound] = useState(() => startDiagramRound(spec, Math.floor(Math.random() * 10000)));
  const [picked, setPicked] = useState<string | null>(null);
  const [shake, setShake] = useState<string | null>(null);

  const complete = isDiagramComplete(round);
  const score = diagramScore(round);

  function tapHotspot(hotspotId: string) {
    if (!picked || round.placed[hotspotId]) return;
    const outcome = placeLabel(round, hotspotId, picked);
    setRound(outcome.round);
    if (outcome.correct) setPicked(null);
    else {
      setShake(hotspotId);
      setTimeout(() => setShake(null), 400);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Pill>
          {position.index} of {position.total}
        </Pill>
        <Button size="sm" variant="ghost" onClick={onExit}>
          End
        </Button>
      </div>

      <p className="text-sm text-ink">{title}</p>

      <Panel className="p-2 sm:p-3">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={spec.imageUrl} alt="" className="w-full h-auto rounded-[8px] select-none" draggable={false} />
          {spec.hotspots.map((hotspot) => {
            const done = round.placed[hotspot.id];
            return (
              <button
                type="button"
                key={hotspot.id}
                onClick={() => tapHotspot(hotspot.id)}
                aria-label={done ? `${done}, placed` : "Unlabelled point"}
                style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }}
                className={cx(
                  // Translated by half its own size so the marker's centre sits
                  // exactly on the stored coordinate at any image scale.
                  "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-all",
                  "min-w-[1.75rem] min-h-[1.75rem] flex items-center justify-center text-[10px] font-semibold px-1.5",
                  done
                    ? "bg-success text-white border-success"
                    : picked
                      ? "bg-surface border-accent animate-pulse"
                      : "bg-surface border-ink3",
                  shake === hotspot.id && "border-danger bg-dangersoft",
                )}
              >
                {done ? done.slice(0, 18) : "?"}
              </button>
            );
          })}
        </div>
      </Panel>

      {complete ? (
        <Panel className="fade-in">
          <p className="text-sm font-semibold text-success flex items-center gap-1.5">
            <CreditedIcon size={ICON_SIZE.md} aria-hidden />
            All {score.total} labelled
          </p>
          <p className="text-xs text-ink3 mt-1">
            {round.wrong === 0
              ? "No wrong placements."
              : `${round.wrong} wrong placement${round.wrong === 1 ? "" : "s"} — ${Math.round(score.accuracy * 100)}% accurate.`}
          </p>
          <Button variant="primary" className="w-full mt-3" onClick={onNext}>
            {position.index < position.total ? "Next diagram" : "Finish"}
          </Button>
        </Panel>
      ) : (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">
            {picked ? "Now tap where it goes" : "Pick a label"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {round.bank.map((label) => (
              <button
                type="button"
                key={label}
                onClick={() => setPicked(picked === label ? null : label)}
                className={cx(
                  "pill min-h-[2.25rem] transition-colors",
                  picked === label ? "bg-accent text-onaccent border-transparent" : "hover:border-ink3",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
