import { Button, cx } from "./ui";

export interface QuestionNavigationProps {
  currentIndex: number;
  total: number;
  answered: readonly boolean[];
  drafted?: readonly boolean[];
  onSelect: (index: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  nextLabel?: string;
  controlsClassName?: string;
}

export function QuestionNavigator({
  currentIndex,
  total,
  answered,
  drafted,
  onSelect,
  onPrevious,
  onNext,
  previousDisabled = false,
  nextDisabled = false,
  nextLabel = "Next question",
  controlsClassName,
}: QuestionNavigationProps) {
  if (total < 1) return null;

  const safeIndex = Math.min(Math.max(currentIndex, 0), total - 1);
  const answeredCount = answered.filter(Boolean).length;
  const draftCount = drafted?.filter(Boolean).length ?? 0;

  return (
    <nav aria-label="Question navigation" className="card card-2 p-3 space-y-3 sticky top-[4.5rem] lg:top-4 z-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Question navigation</p>
          <p className="text-sm font-semibold text-ink mt-0.5">
            Question {safeIndex + 1} of {total}
          </p>
        </div>
        <p className="text-xs text-ink3 tabular-nums text-right" aria-live="polite">
          {answeredCount}/{total} answered{draftCount ? ` · ${draftCount} draft saved` : ""}
        </p>
      </div>

      <ol className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto" aria-label="Questions">
        {Array.from({ length: total }, (_, index) => {
          const isCurrent = index === safeIndex;
          const isAnswered = Boolean(answered[index]);
          const hasDraft = Boolean(drafted?.[index]) && !isAnswered;
          const state = isCurrent ? "current" : isAnswered ? "answered" : hasDraft ? "Draft saved" : "not answered";
          return (
            <li key={index}>
              <button
                type="button"
                aria-label={`Question ${index + 1}, ${state}`}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => onSelect(index)}
                className={cx(
                  "min-w-9 h-9 px-2 rounded-[9px] border text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none",
                  isCurrent && "border-accent bg-accentsoft text-accent",
                  !isCurrent && isAnswered && "border-success bg-successsoft text-success",
                  !isCurrent && hasDraft && "border-review bg-reviewsoft text-review",
                  !isCurrent && !isAnswered && !hasDraft && "border-line bg-surface text-ink3 hover:bg-surface2",
                )}
              >
                {index + 1}
              </button>
            </li>
          );
        })}
      </ol>

      <div className={cx(controlsClassName ?? "flex gap-2")}>
        <Button type="button" size="sm" className="flex-1" disabled={previousDisabled} onClick={onPrevious}>
          Previous
        </Button>
        <Button type="button" size="sm" variant="primary" className="flex-1" disabled={nextDisabled} onClick={onNext}>
          {nextLabel}
        </Button>
      </div>
    </nav>
  );
}
