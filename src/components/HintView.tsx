"use client";

import { formatHint, hintTierLabel, type Hint } from "@/domain/hints";
import { RichText } from "./RichText";

/**
 * One rung of the hint ladder. A rung with no `detail` is its text; one with
 * detail is laid out so it can be read on a phone: the idea as short lines, a
 * worked example of a similar problem as numbered steps, and (top rung only)
 * this question's own answer part by part.
 */
export function HintView({ hint }: { hint: Hint }) {
  const detail = hint.detail;
  if (!detail || (!detail.lines?.length && !detail.example && !detail.solution?.length && !detail.trap)) {
    return <RichText className="text-sm text-ink2">{formatHint(hint)}</RichText>;
  }
  const label = hintTierLabel(hint.tier);
  return (
    <div className="space-y-2 text-sm text-ink2" data-hint-tier={hint.tier}>
      {detail.lines?.length ? (
        <>
          <p className="font-semibold text-ink">{label}: the idea this question uses</p>
          <ul className="space-y-1.5">
            {detail.lines.map((line) => (
              <li key={line}><RichText>{line}</RichText></li>
            ))}
          </ul>
        </>
      ) : null}
      {detail.example ? (
        <>
          <p className="font-semibold text-ink">A similar problem, worked</p>
          <RichText className="text-ink">{detail.example.prompt}</RichText>
          <ol className="list-decimal space-y-1 pl-5">
            {detail.example.steps.map((step) => (
              <li key={step}><RichText>{step}</RichText></li>
            ))}
          </ol>
          <div className="flex gap-1.5">
            <span className="shrink-0 font-semibold text-ink">Answer:</span>
            <RichText className="min-w-0 flex-1 text-ink">{detail.example.answer}</RichText>
          </div>
          <p className="text-xs text-ink3">Different numbers, same method. Now do the same with your question.</p>
        </>
      ) : null}
      {detail.trap ? (
        <p className="text-xs">
          <span className="font-semibold text-ink">Watch for: </span>
          {detail.trap.wrong} <span className="text-ink">{detail.trap.right}</span>
        </p>
      ) : null}
      {detail.example || detail.trap ? <RichText className="text-xs text-ink3">{hint.text}</RichText> : null}
      {detail.solution?.length ? (
        <>
          <p className="font-semibold text-ink">{label} for this question</p>
          {detail.solution.map((part, index) => (
            <div key={`${part.label}:${index}`} className="space-y-1">
              {part.label ? <p className="text-xs font-semibold text-ink">{part.label}</p> : null}
              {part.modelAnswer ? <RichText className="text-ink">{part.modelAnswer}</RichText> : null}
              {part.points.length ? (
                <>
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink3">Marks are given for</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-xs">
                    {part.points.map((point, pointIndex) => (
                      <li key={pointIndex}><RichText>{point}</RichText></li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}
