"use client";

// Focus Mode vs Teacher view.
//
// By default (Focus Mode) the student sees plain-English confidence and the
// next step; the raw statistics behind them — Wilson intervals, weighted trial
// counts, sample sizes, forecast-error metrics, readiness weights — appear only
// in Teacher view. It is a display preference, not learner evidence, so it
// lives in localStorage on this device (like the theme hint) rather than in the
// synced settings record, and switching it never changes a number.
//
// useSyncExternalStore keeps every subscriber in step and renders Focus Mode
// on the server and on first paint, so there is no hydration mismatch.

import { useCallback, useId, useSyncExternalStore, type ReactNode } from "react";
import { cx } from "./ui";

export const TEACHER_MODE_KEY = "revise.teacherMode";

const listeners = new Set<() => void>();
// Fallback when storage is unavailable, so the switch still responds.
let memory: boolean | null = null;

function readTeacherMode(): boolean {
  try {
    return window.localStorage.getItem(TEACHER_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === TEACHER_MODE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setTeacherMode(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(TEACHER_MODE_KEY, "1");
    else window.localStorage.removeItem(TEACHER_MODE_KEY);
  } catch {
    /* private browsing: the toggle still works for this page view */
  }
  memory = on;
  for (const listener of listeners) listener();
}

export function useTeacherMode(): [teacher: boolean, setTeacher: (on: boolean) => void] {
  const teacher = useSyncExternalStore(
    subscribe,
    () => memory ?? readTeacherMode(),
    () => false,
  );
  const set = useCallback((on: boolean) => setTeacherMode(on), []);
  return [teacher, set];
}

/** Raw statistics: rendered only in Teacher view. */
export function TeacherOnly({ children }: { children: ReactNode }) {
  const [teacher] = useTeacherMode();
  return teacher ? <>{children}</> : null;
}

/** The plain-English version: rendered only in Focus Mode. */
export function StudentOnly({ children }: { children: ReactNode }) {
  const [teacher] = useTeacherMode();
  return teacher ? null : <>{children}</>;
}

/** One switch, wherever the statistics live. */
export function TeacherModeToggle({ className }: { className?: string }) {
  const [teacher, setTeacher] = useTeacherMode();
  const hintId = useId();
  return (
    <div className={cx("inline-flex items-center gap-2.5", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={teacher}
        aria-describedby={hintId}
        onClick={() => setTeacher(!teacher)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-3 text-xs font-medium text-ink2 hover:bg-surface2"
      >
        <span
          aria-hidden="true"
          className={cx(
            "relative inline-block h-4 w-7 rounded-full transition-colors",
            teacher ? "bg-accent" : "bg-surface2 border border-line",
          )}
        >
          <span
            className={cx(
              "absolute top-0.5 h-3 w-3 rounded-full bg-surface shadow-sm transition-transform",
              teacher ? "translate-x-3.5" : "translate-x-0.5",
            )}
          />
        </span>
        Teacher view
      </button>
      <span id={hintId} className="text-[11px] text-ink3">
        {teacher ? "Showing the statistics behind each estimate." : "Focus Mode: plain-English confidence and next steps."}
      </span>
    </div>
  );
}
