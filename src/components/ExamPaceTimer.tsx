"use client";

import { useState, useSyncExternalStore } from "react";
import { EXAM_SECONDS_PER_MARK, examPaceState, examPaceTargetSeconds, formatClock } from "@/domain/practice-step-mode";
import { cx } from "./ui";

const NO_SUBSCRIBE = () => () => {};

/**
 * The visible clock for a repair plan's "Timed question" step. It counts up
 * against exam pace (90 seconds a mark, the baseline the response-time
 * calibration already uses) and never submits for the student: running over
 * is information, not a penalty. It stops the moment the answer is marked.
 *
 * Elapsed time is a wall-clock span against the mount instant, not an
 * accumulated state number — so a slow frame cannot lose a second and the
 * freeze on marking is the reading at that moment, not the last tick's.
 */
export function ExamPaceTimer({ marks, stopped }: { marks: number; stopped: boolean }) {
  const target = examPaceTargetSeconds(marks);
  const startedAt = useState(() => Date.now())[0];
  const subscribeTick = (onChange: () => void) => {
    if (stopped) return NO_SUBSCRIBE;
    const id = window.setInterval(onChange, 500);
    return () => window.clearInterval(id);
  };
  const now = useSyncExternalStore(
    subscribeTick,
    () => Date.now(),
    () => startedAt,
  );
  // `stopped` freezes the subscription, so `now` holds the last reading at
  // the moment marking landed — no separate frozen-state copy to fall behind.
  const shown = Math.max(0, Math.floor((now - startedAt) / 1000));
  const state = examPaceState(shown, target);

  return (
    <div
      className={cx(
        "rounded-lg border px-3 py-2 mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1",
        state === "over" ? "border-danger bg-dangersoft" : "border-accent bg-accentsoft",
      )}
      data-testid="exam-pace-timer"
      data-pace={state}
    >
      <p className="text-sm font-semibold text-ink">
        {stopped ? "Time taken" : "Timed"}{" "}
        <span role="timer" aria-live="off" className="tabular-nums">{formatClock(shown)}</span>
        <span className="text-ink3 font-normal"> / {formatClock(target)} exam pace</span>
      </p>
      <p className="text-[11px] text-ink3">
        {stopped
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
