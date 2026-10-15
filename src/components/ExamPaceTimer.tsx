"use client";

import { useEffect, useState } from "react";
import { EXAM_SECONDS_PER_MARK, examPaceState, examPaceTargetSeconds, formatClock } from "@/domain/practice-step-mode";
import { cx } from "./ui";

/**
 * The visible clock for a repair plan's "Timed question" step. It counts up
 * against exam pace (90 seconds a mark, the baseline the response-time
 * calibration already uses) and never submits for the student: running over
 * is information, not a penalty. It stops the moment the answer is marked.
 */
export function ExamPaceTimer({ marks, stopped }: { marks: number; stopped: boolean }) {
  const target = examPaceTargetSeconds(marks);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    // Stamped after mount so render stays pure; the interval only ticks.
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Freeze on marking: one last reading, then no more ticks.
  const [frozen, setFrozen] = useState<number | null>(null);
  if (stopped && frozen === null) setFrozen(elapsed);
  const shown = frozen ?? elapsed;
  const state = examPaceState(shown, target);

  return (
    <div
      className={cx(
        "rounded-[8px] border px-3 py-2 mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1",
        state === "over" ? "border-danger bg-dangersoft" : "border-accent bg-accentsoft",
      )}
      data-testid="exam-pace-timer"
      data-pace={state}
    >
      <p className="text-sm font-semibold text-ink">
        {frozen !== null ? "Time taken" : "Timed"}{" "}
        <span role="timer" aria-live="off" className="tabular-nums">{formatClock(shown)}</span>
        <span className="text-ink3 font-normal"> / {formatClock(target)} exam pace</span>
      </p>
      <p className="text-[11px] text-ink3">
        {frozen !== null
          ? state === "over"
            ? `Over exam pace by ${formatClock(shown - target)}.`
            : "Within exam pace."
          : state === "over"
            ? "Over exam pace. Finish the answer anyway — it still gets marked."
            : `${marks} mark${marks === 1 ? "" : "s"} × ${EXAM_SECONDS_PER_MARK} s. No hints in a timed answer.`}
      </p>
    </div>
  );
}
