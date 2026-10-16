"use client";

import { RichText } from "@/components/RichText";
import { Pill } from "@/components/ui";
import type { WorkedExampleChoice } from "@/domain/practice-step-mode";

/**
 * The repair plan's "Worked example" step: one real question from the topic,
 * shown with its own authored model answer and mark-scheme points, before a
 * fresh question to try. Nothing here is generated; the content is the
 * question's existing worked solution. Open by default so the example comes
 * first; it collapses so the try can be reached quickly on a phone.
 */
export function WorkedExamplePanel({ choice }: { choice: WorkedExampleChoice }) {
  const { example, basis } = choice;
  return (
    <details open className="card border-accent bg-accentsoft p-3 sm:p-4" data-testid="worked-example">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2">
        <Pill tone="accent">Worked example</Pill>
        <span className="text-sm font-semibold text-ink">How this question earns its {example.totalMarks} mark{example.totalMarks === 1 ? "" : "s"}</span>
        <span className="text-[11px] text-ink3">
          {basis === "your-answer" ? "A question you have answered before" : "A practice question, never one used as proof"} · tap to hide
        </span>
      </summary>
      <div className="mt-2 space-y-3">
        <RichText className="text-sm text-ink2">{example.stem}</RichText>
        {example.parts.map((part) => (
          <div key={part.id} className="space-y-1.5 border-t border-line pt-2">
            <p className="text-xs font-semibold text-ink">
              {part.label ? `${part.label} ` : ""}
              <span className="font-normal text-ink3">({part.marks} mark{part.marks === 1 ? "" : "s"})</span>
            </p>
            {part.prompt && part.prompt !== example.stem ? <RichText className="text-sm text-ink2">{part.prompt}</RichText> : null}
            <p className="text-[11px] uppercase tracking-[0.1em] font-bold text-ink3">Model answer</p>
            <RichText className="text-sm text-ink">{part.modelAnswer}</RichText>
            {part.markScheme.length ? (
              <>
                <p className="text-[11px] uppercase tracking-[0.1em] font-bold text-ink3">Marks are given for</p>
                <ul className="list-disc pl-5 space-y-0.5 text-xs text-ink2">
                  {part.markScheme.map((point, index) => <li key={index}><RichText>{point}</RichText></li>)}
                </ul>
              </>
            ) : null}
          </div>
        ))}
        <p className="text-xs text-ink2 border-t border-line pt-2">
          Now try the question below yourself. Practice, not proof: after studying an example it counts as supported practice. Only an unaided answer on a teacher-reviewed question can count as proof.
        </p>
      </div>
    </details>
  );
}
