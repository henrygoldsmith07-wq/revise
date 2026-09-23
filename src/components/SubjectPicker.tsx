"use client";

import type { Id } from "@/domain/types";
import { CreditedIcon, ICON_SIZE } from "./icons";
import { cx } from "./ui";

export interface SubjectPickerOption {
  id: Id;
  name: string;
  /** Optional qualification or board context shown under the subject name. */
  detail?: string;
}

/**
 * Card-based subject selection used by onboarding and subject-scoped screens.
 * Buttons retain aria-pressed so the grid is still a normal keyboard control,
 * while the selected state is visible without relying on colour alone.
 */
export function SubjectPicker({
  options,
  selectedIds,
  onChange,
  selectionMode = "multiple",
  ariaLabel = "Subjects",
  density = "comfortable",
}: {
  options: SubjectPickerOption[];
  selectedIds: Id[];
  onChange: (ids: Id[]) => void;
  selectionMode?: "multiple" | "single";
  ariaLabel?: string;
  density?: "comfortable" | "compact";
}) {
  const single = selectionMode === "single";

  function choose(id: Id) {
    if (single) {
      if (selectedIds.length === 1 && selectedIds[0] === id) return;
      onChange([id]);
      return;
    }
    onChange(selectedIds.includes(id) ? selectedIds.filter((selected) => selected !== id) : [...selectedIds, id]);
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx(
        "grid gap-2",
        density === "compact" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2",
      )}
    >
      {options.map((option) => {
        const selected = selectedIds.includes(option.id);
        const initials = option.name.trim().slice(0, 2).toUpperCase() || "?";
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => choose(option.id)}
            aria-pressed={selected}
            className={cx(
              "card group flex w-full items-center gap-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
              density === "compact" ? "min-h-[3.5rem] px-3 py-2.5" : "min-h-[4.5rem] px-3.5 py-3",
              selected ? "border-ink3 bg-surface2" : "hover:border-ink3 hover:bg-surface2/60",
            )}
          >
            <span
              className={cx(
                "flex shrink-0 items-center justify-center rounded-xl border text-[11px] font-bold tracking-wide transition-colors",
                density === "compact" ? "h-8 w-8" : "h-9 w-9",
                selected ? "border-accent bg-accent text-onaccent" : "border-line bg-surface2 text-ink2",
              )}
              aria-hidden="true"
            >
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{option.name}</span>
              {option.detail ? <span className="mt-0.5 block truncate text-[11px] text-ink3">{option.detail}</span> : null}
            </span>
            <span
              className={cx(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                selected ? "border-accent bg-accent text-onaccent" : "border-line text-ink3",
              )}
              aria-hidden="true"
            >
              {selected ? <CreditedIcon size={ICON_SIZE.sm} /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
