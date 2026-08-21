"use client";

import { useState } from "react";
import { topicsFor } from "@/domain/curriculum";
import { buryCard, normaliseTags, setSuspended, unburyCard } from "@/domain/scheduling";
import type { Card } from "@/domain/types";
import { useStore } from "@/state/store";
import { Button, cx } from "./ui";
import { DeleteIcon, ICON_SIZE } from "./icons";

// The bulk bar. Every action is one write over the whole selection rather than
// N writes in a loop, and destructive ones confirm — a mis-click that deletes
// 300 cards with their review history is not recoverable from IndexedDB.

export function BulkActions({
  selected,
  onDone,
  onExport,
}: {
  selected: Card[];
  onDone: () => void;
  onExport: (cards: Card[]) => void;
}) {
  const store = useStore();
  const [mode, setMode] = useState<"tag" | "untag" | "move" | null>(null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  if (!selected.length) return null;
  const count = selected.length;
  const noun = `${count} card${count === 1 ? "" : "s"}`;

  async function apply(transform: (card: Card) => Card, message: string) {
    await store.updateCards(selected.map(transform));
    setStatus(message);
    setMode(null);
    setValue("");
  }

  async function commitTag() {
    const tags = normaliseTags(value.split(/[,\s]+/));
    if (!tags.length) return;
    if (mode === "tag") {
      await apply(
        (card) => ({ ...card, tags: normaliseTags([...card.tags, ...tags]), updatedAt: new Date().toISOString() }),
        `Added ${tags.join(", ")} to ${noun}.`,
      );
    } else {
      await apply(
        (card) => ({ ...card, tags: card.tags.filter((t) => !tags.includes(t)), updatedAt: new Date().toISOString() }),
        `Removed ${tags.join(", ")} from ${noun}.`,
      );
    }
  }

  async function commitMove() {
    if (!value) return;
    await apply(
      (card) => ({ ...card, topicId: value, updatedAt: new Date().toISOString() }),
      `Moved ${noun}.`,
    );
  }

  // Every selected card must share a subject for "move" to make sense —
  // topics belong to one subject, so a mixed selection has no valid target.
  const subjects = [...new Set(selected.map((c) => c.subjectId))];
  const moveTopics = subjects.length === 1 ? topicsFor(subjects[0]) : [];

  return (
    <div className="sticky bottom-20 lg:bottom-4 z-30">
      <div className="card elev-pop p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold mr-1">{noun} selected</span>

          <Button size="sm" onClick={() => void apply((c) => setSuspended(c, true), `Suspended ${noun}.`)}>
            Suspend
          </Button>
          <Button size="sm" onClick={() => void apply((c) => setSuspended(c, false), `Unsuspended ${noun}.`)}>
            Unsuspend
          </Button>
          <Button size="sm" onClick={() => void apply((c) => buryCard(c), `Buried ${noun} until tomorrow.`)}>
            Bury
          </Button>
          <Button size="sm" onClick={() => void apply((c) => unburyCard(c), `Unburied ${noun}.`)}>
            Unbury
          </Button>

          <Button size="sm" onClick={() => setMode(mode === "tag" ? null : "tag")} aria-pressed={mode === "tag"}>
            Add tags
          </Button>
          <Button size="sm" onClick={() => setMode(mode === "untag" ? null : "untag")} aria-pressed={mode === "untag"}>
            Remove tags
          </Button>
          {moveTopics.length ? (
            <Button size="sm" onClick={() => setMode(mode === "move" ? null : "move")} aria-pressed={mode === "move"}>
              Move topic
            </Button>
          ) : null}

          <Button size="sm" onClick={() => onExport(selected)}>
            Export
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            onClick={async () => {
              if (!confirm(`Delete ${noun}? Their review history goes too, and this cannot be undone.`)) return;
              await store.removeCards(selected.map((c) => c.id));
              setStatus(`Deleted ${noun}.`);
              onDone();
            }}
          >
            <DeleteIcon size={ICON_SIZE.sm} aria-hidden />
            Delete
          </Button>

          <Button size="sm" variant="ghost" className="ml-auto" onClick={onDone}>
            Clear selection
          </Button>
        </div>

        {mode ? (
          <div className="flex gap-1.5 items-center">
            {mode === "move" ? (
              <select
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="field text-sm flex-1"
                aria-label="Topic to move selected cards to"
              >
                <option value="">Choose a topic…</option>
                {moveTopics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title}
                  </option>
                ))}
              </select>
            ) : (
              <input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void commitTag()}
                placeholder="paper-1, tricky"
                className="field text-sm flex-1"
                aria-label="Tags to add to selected cards"
              />
            )}
            <Button
              size="sm"
              variant="primary"
              onClick={() => void (mode === "move" ? commitMove() : commitTag())}
              disabled={!value.trim()}
            >
              Apply
            </Button>
          </div>
        ) : null}

        {status ? <p className={cx("text-[11px]", "text-success")}>{status}</p> : null}
      </div>
    </div>
  );
}
