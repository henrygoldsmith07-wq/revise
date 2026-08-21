"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import { aiCardsFromNotes, aiOcr } from "@/ai/client";
import { toBase64 } from "@/components/AnswerInput";
import { getTopic, topicsFor } from "@/domain/curriculum";
import { createCard } from "@/domain/scheduling";
import type { Card } from "@/domain/types";
import { chunkNotes, extractPdfText } from "@/lib/pdf";
import { useStore, useSubjects } from "@/state/store";
import { RichText } from "@/components/RichText";
import { Button, EmptyState, Field, Panel, Pill, ProgressBar, SectionHeading, cx } from "@/components/ui";
import { GenerateIcon, ICON_SIZE, PhotoIcon } from "@/components/icons";

// ---------------------------------------------------------------------------
// One click: notes in, cards out.
//
// The whole point is that it is *one* step. Drop a PDF or paste notes, press
// the button, review what came back, keep it. Everything else — topic, tags,
// scheduling — has a sensible default the student can change afterwards.
//
// Cards are always previewed before they are saved. A generator that writes
// forty cards straight into the deck is a generator whose mistakes are found
// three weeks later in the middle of a review session.
// ---------------------------------------------------------------------------

/** Per chunk of notes. Generating 25 from one page produces filler. */
const CARDS_PER_CHUNK = 10;

interface Draft {
  front: string;
  back: string;
  kind: "basic" | "cloze" | "equation";
  keep: boolean;
}

export default function GeneratePage() {
  return (
    <Suspense fallback={null}>
      <Generate />
    </Suspense>
  );
}

function Generate() {
  const store = useStore();
  const subjects = useSubjects();
  const fileInput = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [topicId, setTopicId] = useState(topicsFor(subjects[0]?.id ?? "")[0]?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  const existingFronts = useMemo(
    () => new Set(store.cards.map((c) => c.front.trim().toLowerCase())),
    [store.cards],
  );

  async function readFile(file: File) {
    setStatus(null);
    setSourceName(file.name);
    setBusy("reading");
    try {
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        const extracted = await extractPdfText(file);
        if (extracted.looksScanned) {
          setStatus(
            `That PDF has almost no selectable text across its ${extracted.pages} pages — it is probably a scan. Photograph the pages instead and they will be read with OCR.`,
          );
        }
        setText(extracted.text);
      } else {
        setText(await file.text());
      }
    } catch {
      setStatus("That file could not be read. Try exporting it as text, or paste the content in.");
    }
    setBusy(null);
  }

  async function readPhotos(files: FileList) {
    setBusy("ocr");
    const pages: string[] = [];
    const list = Array.from(files).slice(0, 12);
    for (const [i, file] of list.entries()) {
      setProgress((i + 1) / list.length);
      const base64 = await toBase64(file);
      const result = await aiOcr(base64, file.type || "image/jpeg", "printed");
      if (result.data.text) pages.push(result.data.text);
      else setStatus(result.note ?? "Those images could not be read.");
    }
    if (pages.length) {
      setText((prev) => `${prev}\n\n${pages.join("\n\n")}`.trim());
      setSourceName(`${list.length} photo${list.length === 1 ? "" : "s"}`);
    }
    setProgress(0);
    setBusy(null);
  }

  async function generate() {
    const trimmed = text.trim();
    if (trimmed.length < 80) {
      setStatus("There is not enough here to make cards from — paste at least a paragraph.");
      return;
    }
    setBusy("generating");
    setStatus(null);
    setDrafts(null);

    const chunks = chunkNotes(trimmed);
    const collected: Draft[] = [];
    let usedAi = false;

    for (const [i, chunk] of chunks.entries()) {
      setProgress((i + 1) / chunks.length);
      const result = await aiCardsFromNotes(chunk, CARDS_PER_CHUNK, topicId);
      if (result.source === "ai") usedAi = true;
      for (const generated of result.data.cards) {
        const key = generated.front.trim().toLowerCase();
        if (existingFronts.has(key) || collected.some((d) => d.front.trim().toLowerCase() === key)) continue;
        collected.push({ front: generated.front, back: generated.back, kind: generated.kind, keep: true });
      }
    }

    setProgress(0);
    setBusy(null);

    if (!collected.length) {
      setStatus(
        usedAi
          ? "Nothing usable came back — the notes may be too short or too fragmentary."
          : "Generating cards from your own notes needs an AI provider: nothing on this device can read arbitrary prose. Set one up in settings, or write cards by hand in the card browser.",
      );
      return;
    }
    setDrafts(collected);
  }

  async function save() {
    if (!drafts) return;
    const keep = drafts.filter((d) => d.keep);
    const topic = getTopic(topicId);
    const cards: Card[] = keep.map((draft) =>
      createCard({
        id: crypto.randomUUID(),
        userId: store.userId,
        subjectId: topic?.subjectId ?? subjectId,
        topicId,
        front: draft.front,
        back: draft.back,
        kind: draft.kind,
        origin: "document",
        // Tagged with the source so a batch can be found or undone later.
        tags: ["from-notes", sourceName ? sourceName.replace(/\.[^.]+$/, "").slice(0, 30) : "notes"],
      }),
    );
    await store.addCards(cards);
    setSaved(cards.length);
    setDrafts(null);
    setText("");
    setSourceName(null);
  }

  const keepCount = drafts?.filter((d) => d.keep).length ?? 0;

  return (
    <div className="space-y-5 max-w-3xl">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Cards from your notes</h1>
        <p className="text-sm text-ink3 mt-0.5">
          Drop a PDF, paste your notes or photograph a page. Everything is previewed before it joins your deck.
        </p>
      </header>

      {saved != null ? (
        <Panel className="fade-in">
          <p className="text-sm text-success font-semibold">{saved} cards added, due immediately.</p>
          <p className="text-xs text-ink3 mt-1">Tagged “from-notes” so you can find or remove the batch later.</p>
          <Button className="mt-3" onClick={() => setSaved(null)}>
            Generate more
          </Button>
        </Panel>
      ) : null}

      {!drafts ? (
        <>
          <Panel className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => fileInput.current?.click()} disabled={busy !== null}>
                {busy === "reading" ? "Reading…" : "Choose a PDF or text file"}
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.txt,.md,.csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void readFile(file);
                  e.target.value = "";
                }}
              />
              <label className={cx("btn btn-secondary text-sm cursor-pointer", busy && "opacity-50 pointer-events-none")}>
                <PhotoIcon size={ICON_SIZE.sm} aria-hidden />
                {busy === "ocr" ? "Reading pages…" : "Photograph pages"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.files?.length) void readPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            {busy && progress > 0 ? <ProgressBar value={progress} label="Working through the pages" /> : null}

            <Field label="Notes" hint={sourceName ? `From ${sourceName} — edit before generating if you like.` : undefined}>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                placeholder="Paste your notes here…"
                className="field nice-scroll text-sm"
              />
            </Field>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Subject">
                <select
                  value={subjectId}
                  onChange={(e) => {
                    setSubjectId(e.target.value);
                    setTopicId(topicsFor(e.target.value)[0]?.id ?? "");
                  }}
                  className="field text-sm"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Topic" hint="Used to ground the wording in your spec.">
                <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className="field text-sm">
                  {topicsFor(subjectId).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Button
              variant="primary"
              className="w-full min-h-[3rem]"
              onClick={() => void generate()}
              disabled={busy !== null || text.trim().length < 80}
            >
              <GenerateIcon size={ICON_SIZE.md} aria-hidden />
              {busy === "generating" ? "Writing cards…" : "Generate flashcards"}
            </Button>

            {busy === "generating" && progress > 0 ? <ProgressBar value={progress} label="Reading your notes" /> : null}
            {status ? <p className="text-xs text-review">{status}</p> : null}
          </Panel>

          {text.trim().length > 0 && text.trim().length < 80 ? (
            <p className="text-xs text-ink3">Add a bit more text — a paragraph or two is plenty.</p>
          ) : null}
        </>
      ) : (
        <>
          <SectionHeading
            title={`${drafts.length} cards drafted`}
            hint="Untick anything that is wrong or redundant. Nothing is saved until you press keep."
            action={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDrafts(drafts.map((d) => ({ ...d, keep: !drafts.every((x) => x.keep) })))}
              >
                {drafts.every((d) => d.keep) ? "Untick all" : "Tick all"}
              </Button>
            }
          />
          <ul className="space-y-2">
            {drafts.map((draft, i) => (
              <Panel as="li" key={i} className={cx(!draft.keep && "opacity-50")}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={draft.keep}
                    onChange={() =>
                      setDrafts(drafts.map((d, index) => (index === i ? { ...d, keep: !d.keep } : d)))
                    }
                    className="mt-1 accent-[var(--accent)] w-4 h-4"
                    aria-label={`Keep card ${i + 1}`}
                  />
                  <div className="min-w-0 flex-1">
                    <Pill className="mb-1.5">{draft.kind}</Pill>
                    <RichText className="text-sm text-ink">{draft.front}</RichText>
                    <div className="mt-1.5 pt-1.5 border-t border-line">
                      <RichText className="text-sm">{draft.back}</RichText>
                    </div>
                  </div>
                </div>
              </Panel>
            ))}
          </ul>
          <div className="sticky bottom-20 lg:bottom-4 flex gap-2">
            <Button variant="primary" className="flex-1 min-h-[3rem]" onClick={() => void save()} disabled={!keepCount}>
              Keep {keepCount} card{keepCount === 1 ? "" : "s"}
            </Button>
            <Button className="min-h-[3rem]" onClick={() => setDrafts(null)}>
              Discard
            </Button>
          </div>
        </>
      )}

      {!drafts && !text ? (
        <EmptyState
          title="Works with anything"
          body="A lesson handout, a textbook chapter, your own revision notes, or a photo of the whiteboard. Cards come back grounded in what you gave it, not in what a model happens to know."
        />
      ) : null}
    </div>
  );
}
