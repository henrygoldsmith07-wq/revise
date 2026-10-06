"use client";

import { cardAnswer } from "@/domain/card-display";
import type { DiagramSpec } from "@/domain/diagrams";
import type { Card } from "@/domain/types";
import { RichText } from "./RichText";

// Shared flip-card faces. Review and the adaptive session's retrieval step
// both render cards; keeping the faces here means a diagram card shows its
// figure (not its JSON payload) everywhere a card can be flipped.

/** The image under a card's prompt: a numbered figure for diagram cards. */
export function CardPromptMedia({ card }: { card: Card }) {
  const answer = cardAnswer(card);
  if (answer.kind === "diagram") {
    return (
      <>
        <DiagramFigure spec={answer.spec} title={card.front} />
        <p className="text-xs text-ink3 mt-2">Name each numbered point from memory, then reveal the labels.</p>
      </>
    );
  }
  if (!card.imageUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={card.imageUrl} alt="" className="mt-3 max-h-60 rounded-[8px] border border-line mx-auto" />
  );
}

/** The revealed side of a card. */
export function CardAnswerBody({ card }: { card: Card }) {
  const answer = cardAnswer(card);
  if (answer.kind === "diagram") {
    return (
      <ol className="space-y-1.5" aria-label="Diagram labels">
        {answer.spec.hotspots.map((hotspot, index) => (
          <li key={hotspot.id} className="text-sm text-ink">
            <span className="font-semibold tabular-nums">{index + 1}.</span> {hotspot.label}
            {hotspot.note ? <span className="block text-xs text-ink3 ml-4">{hotspot.note}</span> : null}
          </li>
        ))}
      </ol>
    );
  }
  if (answer.kind === "cloze") {
    return (
      <>
        <RichText className="text-base">{answer.sentence}</RichText>
        <p className="text-xs text-ink3 mt-2">
          Hidden answer: <span className="font-semibold text-ink2">{answer.hidden}</span>
        </p>
      </>
    );
  }
  return <RichText className="text-base">{answer.text}</RichText>;
}

/** Heading for the revealed side, matched to what it shows. */
export function cardAnswerHeading(card: Card): string {
  const kind = cardAnswer(card).kind;
  return kind === "cloze" ? "Completed sentence" : kind === "diagram" ? "Labels" : "Answer";
}

function DiagramFigure({ spec, title }: { spec: DiagramSpec; title: string }) {
  return (
    <div className="relative mt-3 mx-auto max-w-md">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={spec.imageUrl}
        alt={`Unlabelled diagram: ${title}`}
        className="w-full h-auto rounded-[8px] border border-line select-none"
        draggable={false}
      />
      {spec.hotspots.map((hotspot, index) => (
        <span
          key={hotspot.id}
          aria-hidden
          style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }}
          className="absolute -translate-x-1/2 -translate-y-1/2 min-w-[1.5rem] min-h-[1.5rem] rounded-full border-2 border-ink3 bg-surface text-[11px] font-semibold flex items-center justify-center tabular-nums"
        >
          {index + 1}
        </span>
      ))}
    </div>
  );
}
