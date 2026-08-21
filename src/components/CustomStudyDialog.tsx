"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildCustomStudy, CUSTOM_STUDY_PRESETS, DEFAULT_CUSTOM_STUDY } from "@/domain/custom-study";
import { tagCounts } from "@/domain/browser";
import type { Card, CustomStudySpec } from "@/domain/types";
import { Button, Field, Panel, Pill, cx } from "./ui";
import { useFocusTrap } from "./useFocusTrap";

// A session the student builds themselves. The dialog always shows how many
// cards the current spec would actually produce, so nobody starts a "cram
// everything" session and finds three cards in it.

export const CUSTOM_STUDY_KEY = "revise.customStudy";

export function CustomStudyDialog({
  cards,
  initialQuery = "",
  onClose,
}: {
  cards: Card[];
  initialQuery?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [spec, setSpec] = useState<CustomStudySpec>({ ...DEFAULT_CUSTOM_STUDY, query: initialQuery });
  const dialogRef = useFocusTrap(true, onClose);

  const result = useMemo(() => buildCustomStudy(cards, spec), [cards, spec]);
  const tags = useMemo(() => tagCounts(cards).slice(0, 12), [cards]);
  const set = (patch: Partial<CustomStudySpec>) => setSpec((prev) => ({ ...prev, ...patch }));

  function start() {
    // The chosen ids are handed to the review screen through sessionStorage:
    // a queue of 60 ids does not belong in a URL, and it should not survive a
    // browser restart the way a stored session would.
    sessionStorage.setItem(
      CUSTOM_STUDY_KEY,
      JSON.stringify({ ids: result.cards.map((c) => c.id), preview: result.isPreview, createdAt: Date.now() }),
    );
    router.push("/review?mode=custom");
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-start justify-center p-4 sm:pt-16 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-study-title"
      tabIndex={-1}
    >
      <div className="w-full max-w-2xl fade-in" onClick={(e) => e.stopPropagation()}>
        <Panel className="elev-pop space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h2 id="custom-study-title" className="text-sm font-semibold">Custom study</h2>
              <p className="text-xs text-ink3 mt-0.5">
                Build a session yourself when the recommendation is not what you need.
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CUSTOM_STUDY_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                // A preset replaces the whole spec, query included. Merging it
                // with whatever was typed produced silent surprises like
                // "cram everything" quietly meaning "cram only leeches".
                onClick={() => setSpec({ ...preset.spec })}
                title={preset.hint}
                className="pill hover:border-ink3 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <Field label="Filter" hint="Same syntax as the browser: is:leech, tag:paper-1, prop:lapses>3">
            <input
              value={spec.query}
              onChange={(e) => set({ query: e.target.value })}
              placeholder="Leave empty for everything in scope"
              className="field text-sm"
            />
          </Field>

          {tags.length ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map(({ tag, count }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => set({ query: `${spec.query} tag:${tag}`.trim() })}
                  className="pill hover:border-ink3 transition-colors"
                >
                  {tag} <span className="text-ink3">{count}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Draw from">
              <select
                value={spec.pool}
                onChange={(e) => set({ pool: e.target.value as CustomStudySpec["pool"] })}
                className="field text-sm"
              >
                <option value="due">Cards due today</option>
                <option value="new">Never seen</option>
                <option value="lapsed">Forgotten before</option>
                <option value="suspended">Suspended</option>
                <option value="all">Everything</option>
              </select>
            </Field>
            <Field label="Order">
              <select
                value={spec.order}
                onChange={(e) => set({ order: e.target.value as CustomStudySpec["order"] })}
                className="field text-sm"
              >
                <option value="due">Most overdue first</option>
                <option value="difficulty">Hardest first</option>
                <option value="lapses">Most forgotten first</option>
                <option value="added">Oldest first</option>
                <option value="random">Random</option>
              </select>
            </Field>
            <Field label={`Limit — ${spec.limit} cards`}>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={spec.limit}
                onChange={(e) => set({ limit: Number(e.target.value) })}
                className="w-full accent-[var(--accent)]"
              />
            </Field>
          </div>

          <div className={cx("card card-2 p-3", !result.cards.length && "border-danger")}>
            <p className="text-sm text-ink2">{result.description}</p>
            {result.warnings.map((warning, i) => (
              <p key={i} className="text-xs text-review mt-1">
                {warning}
              </p>
            ))}
            {result.isPreview ? (
              <div className="mt-2">
                <Pill tone="review">Preview only — scheduling untouched</Pill>
              </div>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Button variant="primary" onClick={start} disabled={!result.cards.length}>
              Start {result.cards.length} cards
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
