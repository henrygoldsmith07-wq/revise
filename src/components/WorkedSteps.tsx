"use client";

// A worked example shown a step at a time, so each step can be predicted
// before it is read. Used where a lost mark is repaired
// (LostMarksRepair) and in a lesson's worked-example step (LessonMode).

import { useState } from "react";
import { RichText } from "./RichText";
import { Button } from "./ui";

export interface WorkedExample {
  prompt: string;
  steps: readonly string[];
  answer: string;
}

export function WorkedSteps({ worked, onDone }: { worked: WorkedExample; /** Called once, when the answer has been shown. */ onDone?: () => void }) {
  const [shown, setShown] = useState(1);
  const done = shown > worked.steps.length;
  const reveal = () => {
    const next = shown + 1;
    setShown(next);
    if (next > worked.steps.length) onDone?.();
  };
  return (
    <div className="space-y-2" data-testid="worked-steps">
      <RichText className="text-sm text-ink">{worked.prompt}</RichText>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink2" aria-live="polite">
        {worked.steps.slice(0, shown).map((step) => (
          <li key={step}><RichText className="text-sm text-ink2">{step}</RichText></li>
        ))}
      </ol>
      {done ? (
        <div className="flex gap-1.5 text-sm">
          <span className="shrink-0 font-semibold text-ink">Answer:</span>
          <RichText className="min-w-0 flex-1 text-sm text-ink">{worked.answer}</RichText>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={reveal}>
            {shown >= worked.steps.length ? "Show the answer" : "Show the next step"}
          </Button>
          <span className="text-[11px] text-ink3">Say what comes next before you look.</span>
        </div>
      )}
    </div>
  );
}
