"use client";

import { useMemo, useRef, useState } from "react";
import { allTopics, topicsFor } from "@/domain/curriculum";
import { exportDeck, materialiseDeck, parseDeckFile, serialiseDeck } from "@/domain/deck-io";
import type { ImportReport } from "@/domain/deck-io";
import type { Card, Id } from "@/domain/types";
import { useStore, useSubjects } from "@/state/store";
import { Button, Field, Panel, Pill, SectionHeading } from "./ui";

// ---------------------------------------------------------------------------
// Import and export.
//
// The import flow shows exactly what will happen *before* anything is written:
// how many cards parsed, how many were rejected and why, how many duplicate an
// existing card, and where cards with unknown topics will land. A silent
// importer that dumps 400 half-broken cards into a deck is worse than no
// importer, because the mess then has to be found by hand.
// ---------------------------------------------------------------------------

export function ExportDeckPanel({ cards, defaultName }: { cards: Card[]; defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const [includeScheduling, setIncludeScheduling] = useState(true);
  const [done, setDone] = useState<string | null>(null);

  function download() {
    const deck = exportDeck(cards, { name, includeScheduling, subjectId: cards[0]?.subjectId });
    const blob = new Blob([serialiseDeck(deck)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "deck"}.revise.json`;
    link.click();
    URL.revokeObjectURL(url);
    setDone(`Exported ${cards.length} cards${includeScheduling ? " with scheduling" : " as a shared deck"}.`);
  }

  return (
    <Panel className="space-y-3">
      <SectionHeading
        title="Export"
        hint={`${cards.length} card${cards.length === 1 ? "" : "s"} in scope — whatever the current filter shows.`}
      />
      <Field label="Deck name">
        <input value={name} onChange={(e) => setName(e.target.value)} className="field text-sm" />
      </Field>
      <div className="space-y-1.5">
        {(
          [
            [true, "Backup", "Keeps your FSRS history, so re-importing restores the deck exactly."],
            [false, "Share with someone", "Strips scheduling — your stability numbers mean nothing to them."],
          ] as const
        ).map(([value, label, hint]) => (
          <label key={label} className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              checked={includeScheduling === value}
              onChange={() => setIncludeScheduling(value)}
              className="mt-1 accent-[var(--accent)]"
            />
            <span>
              <span className="text-sm text-ink block">{label}</span>
              <span className="text-[11px] text-ink3">{hint}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={download} disabled={!cards.length}>
          Download .revise.json
        </Button>
        {done ? <span className="text-xs text-success">{done}</span> : null}
      </div>
    </Panel>
  );
}

export function ImportDeckPanel({ onImported }: { onImported?: (count: number) => void }) {
  const store = useStore();
  const subjects = useSubjects();
  const fileInput = useRef<HTMLInputElement>(null);

  const [report, setReport] = useState<ImportReport | null>(null);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [topicId, setTopicId] = useState(topicsFor(subjects[0]?.id ?? "")[0]?.id ?? "");
  const [keepScheduling, setKeepScheduling] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");

  const knownTopicIds = useMemo(() => new Set(allTopics().map((t) => t.id)), []);
  const existingFronts = useMemo(
    () => new Set(store.cards.map((c) => c.front.trim().toLowerCase())),
    [store.cards],
  );

  const preview = useMemo(() => {
    if (!report?.deck) return null;
    return materialiseDeck(report.deck, {
      userId: store.userId,
      fallbackSubjectId: subjectId,
      fallbackTopicId: topicId,
      knownTopicIds,
      existingFronts: skipDuplicates ? existingFronts : new Set(),
      keepScheduling,
      // Tagged so an import can always be found, reviewed or undone in bulk.
      extraTags: ["imported"],
    });
  }, [report, store.userId, subjectId, topicId, knownTopicIds, existingFronts, skipDuplicates, keepScheduling]);

  function read(text: string, filename: string) {
    const parsed = parseDeckFile(text, filename);
    setReport(parsed);
    setStatus(null);
    if (parsed.deck?.cards.some((c) => c.scheduling)) setKeepScheduling(true);
  }

  async function commit() {
    if (!preview?.cards.length) return;
    await store.addCards(preview.cards);
    setStatus(
      `Imported ${preview.cards.length} cards${preview.duplicates ? `, skipped ${preview.duplicates} duplicates` : ""}. Tagged "imported".`,
    );
    onImported?.(preview.cards.length);
    setReport(null);
    setPasted("");
  }

  return (
    <Panel className="space-y-3">
      <SectionHeading
        title="Import"
        hint="A Revise export, or any Anki/Quizlet CSV or TSV with front, back and optional tags."
      />

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => fileInput.current?.click()}>Choose a file</Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.csv,.tsv,.txt"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) read(await file.text(), file.name);
            e.target.value = "";
          }}
        />
        {pasted.trim() ? (
          <Button onClick={() => read(pasted, pasted.trimStart().startsWith("{") ? "pasted.json" : "pasted.csv")}>
            Read pasted text
          </Button>
        ) : null}
      </div>

      <Field label="…or paste it" hint="One card per line: front, back, tags">
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={3}
          placeholder="What is the unit of force?, The newton (N), physics"
          className="field nice-scroll text-sm"
        />
      </Field>

      {report ? (
        <div className="space-y-3 border-t border-line pt-3">
          {report.warnings.map((warning, i) => (
            <p key={i} className="text-xs text-review">
              {warning}
            </p>
          ))}

          {report.deck ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="success">{report.accepted} cards read</Pill>
                {report.rejected.length ? <Pill tone="danger">{report.rejected.length} rejected</Pill> : null}
                {preview?.duplicates ? <Pill tone="review">{preview.duplicates} duplicates</Pill> : null}
                {preview?.retargeted ? <Pill>{preview.retargeted} need a topic</Pill> : null}
              </div>

              {report.rejected.length ? (
                <details className="text-xs text-ink3">
                  <summary className="cursor-pointer">Why rows were rejected</summary>
                  <ul className="mt-1 space-y-0.5">
                    {report.rejected.map((row) => (
                      <li key={row.row}>
                        Row {row.row}: {row.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Subject" hint="Where cards without a known topic land.">
                  <select
                    value={subjectId}
                    onChange={(e) => {
                      setSubjectId(e.target.value);
                      setTopicId(topicsFor(e.target.value)[0]?.id ?? "");
                    }}
                    className="field text-sm"
                  >
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Topic">
                  <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className="field text-sm">
                    {topicsFor(subjectId).map((topic) => (
                      <option key={topic.id} value={topic.id}>
                        {topic.title}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  Skip cards whose front already exists
                </label>
                {report.deck.cards.some((c) => c.scheduling) ? (
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={keepScheduling}
                      onChange={(e) => setKeepScheduling(e.target.checked)}
                      className="accent-[var(--accent)]"
                    />
                    Keep the file&apos;s scheduling history
                    <span className="text-[11px] text-ink3">(only sensible for your own backup)</span>
                  </label>
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                <Button variant="primary" onClick={() => void commit()} disabled={!preview?.cards.length}>
                  Import {preview?.cards.length ?? 0} cards
                </Button>
                <Button onClick={() => setReport(null)}>Cancel</Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {status ? <p className="text-xs text-success">{status}</p> : null}
    </Panel>
  );
}

/** Small helper so both panels can name a deck after the current filter. */
export function deckNameFor(subjectName: string | undefined, query: string): Id {
  const base = subjectName ?? "Revise deck";
  return query.trim() ? `${base} — ${query.trim()}` : base;
}
