import { RUN_THRESHOLD } from "@/domain/study-week";
import { StreakIcon, ICON_SIZE } from "@/components/icons";

/**
 * "3 in a row" inside a session: correct answers back to back, reset by the
 * first miss. Silent below the threshold so it only appears when it means
 * something, and announced politely so it never interrupts an answer.
 */
export function RunCounter({ run }: { run: number }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center">
      {run >= RUN_THRESHOLD ? (
        <span key={run} className="run-pop inline-flex items-center gap-1 rounded-full bg-accentsoft px-2.5 py-0.5 text-xs font-semibold text-ink tabular-nums" data-testid="run-counter">
          <StreakIcon size={ICON_SIZE.sm} aria-hidden="true" />
          {run} in a row
        </span>
      ) : null}
    </span>
  );
}
