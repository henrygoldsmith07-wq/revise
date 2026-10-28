"use client";

import { useId } from "react";
import type { ExamBoard, Id } from "@/domain/types";
import { SCHOOL_REGIONS, SCHOOL_REGION_LABEL, type SchoolRegion } from "@/domain/school-region";
import { UNIT4_OPTIONS, type Unit4Option, type YearGroup } from "@/domain/year-group";
import { Panel, cx } from "./ui";
import { CreditedIcon } from "./icons";

// ---------------------------------------------------------------------------
// Onboarding step 1: year group, where the school is, and the exam board.
// Wales preselects WJEC (with a "Not WJEC? Change board" escape); England and
// Other keep the board grid with nothing chosen, because boards vary there.
// The year group lets the next steps fill in exam dates by themselves.
// ---------------------------------------------------------------------------

/** "Pearson Edexcel" reads as "Edexcel" on a tile; single-word boards stay whole. */
export function boardMonogram(name: string): string {
  return name.split(" ").pop() ?? name;
}

type YearChoice = YearGroup | "unknown";

/** A row of large toggle buttons (44px tall), one pressed at a time. */
function ChoiceRow<T extends string>({
  labelId,
  options,
  value,
  onChange,
}: {
  labelId: string;
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={cx(
              "min-h-[44px] min-w-[44px] rounded-xl border px-4 text-sm font-semibold transition-colors",
              on ? "border-accent bg-accentsoft text-ink" : "border-line text-ink2 hover:border-ink3 hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export interface OnboardingSchoolStepProps {
  yearGroup: YearGroup | undefined;
  onYearGroup: (year: YearGroup | undefined) => void;
  unit4Option: Unit4Option | undefined;
  onUnit4Option: (option: Unit4Option | undefined) => void;
  region: SchoolRegion | undefined;
  onRegion: (region: SchoolRegion) => void;
  boards: readonly ExamBoard[];
  boardId: Id | null;
  onBoard: (id: Id) => void;
  /** The board was filled in from the region and the student has not opened the picker. */
  boardInferred: boolean;
  /** The region's usual board is not offered yet (Northern Ireland: CCEA). */
  regionBoardMissing: boolean;
  /** Show the board grid even though a board was inferred. */
  pickingBoard: boolean;
  onChangeBoard: () => void;
}

export function OnboardingSchoolStep(props: OnboardingSchoolStepProps) {
  const { yearGroup, region, boards, boardId, boardInferred, pickingBoard } = props;
  const yearLabel = useId();
  const unit4Label = useId();
  const regionLabel = useId();
  const board = boards.find((b) => b.id === boardId) ?? null;
  const showSummary = Boolean(board && boardInferred && !pickingBoard);

  return (
    <Panel className="space-y-5">
      <section className="space-y-2">
        <h2 id={yearLabel} className="text-sm font-semibold">Which year are you in?</h2>
        <p className="text-xs text-ink3">Revise uses it to find your exam dates. Year 12 plans start with the AS units.</p>
        <ChoiceRow<YearChoice>
          labelId={yearLabel}
          value={yearGroup ?? "unknown"}
          onChange={(value) => props.onYearGroup(value === "unknown" ? undefined : value)}
          options={[
            { value: "year-12", label: "Year 12" },
            { value: "year-13", label: "Year 13" },
            { value: "unknown", label: "Not sure" },
          ]}
        />
      </section>

      {yearGroup === "year-13" ? (
        <section className="space-y-2">
          <h3 id={unit4Label} className="text-xs font-semibold text-ink2">Your Unit 4 option (optional)</h3>
          <p className="text-[11px] text-ink3">Your plan then uses only that option&apos;s topics.</p>
          <ChoiceRow<Unit4Option | "unknown">
            labelId={unit4Label}
            value={props.unit4Option ?? "unknown"}
            onChange={(value) => props.onUnit4Option(value === "unknown" ? undefined : value)}
            options={[...UNIT4_OPTIONS.map((o) => ({ value: o, label: `Option ${o}` })), { value: "unknown" as const, label: "Not sure" }]}
          />
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 id={regionLabel} className="text-sm font-semibold">Where&apos;s your school?</h2>
        <ChoiceRow<SchoolRegion>
          labelId={regionLabel}
          value={region}
          onChange={props.onRegion}
          options={SCHOOL_REGIONS.map((r) => ({ value: r, label: SCHOOL_REGION_LABEL[r] }))}
        />
      </section>

      <section className="space-y-2" aria-live="polite">
        {showSummary && board ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent bg-accentsoft px-3 py-2.5" role="status">
            <p className="text-sm text-ink">
              Exam board: <span className="font-semibold">{board.name}</span>
              <span className="block text-xs text-ink3">Schools in {region ? SCHOOL_REGION_LABEL[region] : "your area"} sit {board.name} A levels.</span>
            </p>
            <button
              type="button"
              onClick={props.onChangeBoard}
              className="min-h-[44px] rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink hover:border-ink3"
            >
              Not {board.name}? Change board
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-sm font-semibold">Which exam board are you studying with?</h2>
            <p className="text-xs text-ink3 -mb-1">
              {props.regionBoardMissing
                ? "CCEA isn't in Revise yet. If your school uses one of these boards for a subject, pick it."
                : "Your specification, questions and past papers follow your board's syllabus. Pick the one your school uses."}
            </p>
            <ul className="grid grid-cols-2 gap-2 pt-2">
              {boards.map((option) => {
                const on = boardId === option.id;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() => props.onBoard(option.id)}
                      aria-pressed={on}
                      className={cx(
                        "relative w-full h-full text-left card p-3 min-h-[7rem] flex flex-col gap-3 transition-all active:scale-[0.98]",
                        on ? "border-accent bg-accentsoft" : "hover:border-ink3",
                      )}
                    >
                      {/* The board's own short name as a tile: recognisable at a glance, and no borrowed logo. */}
                      <span
                        aria-hidden
                        className={cx(
                          "grid h-11 min-w-11 place-items-center self-start rounded-xl px-2 text-sm font-bold tracking-tight",
                          on ? "bg-accent text-onaccent" : "bg-surface2 text-ink",
                        )}
                      >
                        {boardMonogram(option.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">{option.name}</span>
                        <span className="block text-[11px] text-ink3 truncate">{option.country}</span>
                      </span>
                      {on ? (
                        <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-accent text-onaccent">
                          <CreditedIcon size={12} aria-hidden />
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </Panel>
  );
}
