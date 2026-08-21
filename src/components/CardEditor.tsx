"use client";

import { useEffect, useRef, useState } from "react";
import { toBase64 } from "./AnswerInput";
import { RichText } from "./RichText";
import { Button, Field, Panel, Pill, cx } from "./ui";
import { DeleteIcon, ICON_SIZE, PhotoIcon } from "./icons";
import { normaliseTags } from "@/domain/scheduling";
import { topicsFor } from "@/domain/curriculum";
import type { Card, CardKind, Id } from "@/domain/types";

// ---------------------------------------------------------------------------
// The card editor. Rich in the ways a STEM revision card actually needs:
// LaTeX, images, audio and tables — with a live preview, because a card whose
// maths does not render is a card that wastes a review when it comes up.
//
// Media is stored as a data URL on the card itself rather than as a file
// reference. That is the only option that keeps a photographed diagram working
// offline, in a PWA, and through export/import to another device.
// ---------------------------------------------------------------------------

/** Beyond this, a single card starts to bloat every snapshot read. */
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_AUDIO_BYTES = 2_000_000;

const KINDS: { value: CardKind; label: string; hint: string }[] = [
  { value: "basic", label: "Basic", hint: "Question on the front, answer on the back" },
  { value: "cloze", label: "Cloze", hint: "Blank out a term with […]" },
  { value: "equation", label: "Equation", hint: "Maths-heavy — LaTeX between $ signs" },
  { value: "image", label: "Image", hint: "A diagram to identify or label" },
  { value: "audio", label: "Audio", hint: "A clip to recall from" },
];

const SNIPPETS: { label: string; insert: string; hint: string }[] = [
  { label: "Inline maths", insert: "$x^2$", hint: "$…$" },
  { label: "Display maths", insert: "$$\\frac{a}{b}$$", hint: "$$…$$" },
  { label: "Table", insert: "| Term | Meaning |\n| --- | --- |\n| a | b |", hint: "pipe table" },
  { label: "Bullets", insert: "- first\n- second", hint: "- list" },
  { label: "Bold", insert: "**important**", hint: "**…**" },
  { label: "Cloze blank", insert: "[…]", hint: "blank" },
];

export interface CardDraft {
  front: string;
  back: string;
  kind: CardKind;
  tags: string[];
  note: string;
  imageUrl?: string;
  audioUrl?: string;
  topicId: Id;
}

export function draftFromCard(card: Card): CardDraft {
  return {
    front: card.front,
    back: card.back,
    kind: card.kind,
    tags: card.tags,
    note: card.note ?? "",
    imageUrl: card.imageUrl,
    audioUrl: card.audioUrl,
    topicId: card.topicId,
  };
}

export function applyDraft(card: Card, draft: CardDraft, now: Date = new Date()): Card {
  const next: Card = {
    ...card,
    front: draft.front.trim(),
    back: draft.back.trim(),
    kind: draft.kind,
    tags: normaliseTags(draft.tags),
    topicId: draft.topicId,
    note: draft.note.trim() || undefined,
    imageUrl: draft.imageUrl,
    audioUrl: draft.audioUrl,
    updatedAt: now.toISOString(),
  };
  if (!next.note) delete next.note;
  if (!next.imageUrl) delete next.imageUrl;
  if (!next.audioUrl) delete next.audioUrl;
  return next;
}

export function CardEditor({
  draft,
  subjectId,
  onChange,
  onSave,
  onCancel,
  saveLabel = "Save card",
}: {
  draft: CardDraft;
  subjectId: Id;
  onChange: (draft: CardDraft) => void;
  onSave: () => void;
  onCancel?: () => void;
  saveLabel?: string;
}) {
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLTextAreaElement>(null);
  const [focusField, setFocusField] = useState<"front" | "back">("front");

  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  const set = (patch: Partial<CardDraft>) => onChange({ ...draft, ...patch });

  function insert(snippet: string) {
    const field = focusField;
    const ref = field === "front" ? frontRef : backRef;
    const element = ref.current;
    const value = field === "front" ? draft.front : draft.back;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    set(field === "front" ? { front: next } : { back: next });
    // Put the caret after what we inserted rather than at the end of the field.
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  }

  async function attachImage(file: File) {
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`That image is ${(file.size / 1e6).toFixed(1)} MB. Keep attachments under 1.5 MB.`);
      return;
    }
    const base64 = await toBase64(file);
    setError(null);
    set({ imageUrl: `data:${file.type};base64,${base64}`, kind: draft.kind === "basic" ? "image" : draft.kind });
  }

  async function attachAudio(file: File) {
    if (file.size > MAX_AUDIO_BYTES) {
      setError(`That clip is ${(file.size / 1e6).toFixed(1)} MB. Keep attachments under 2 MB.`);
      return;
    }
    const base64 = await toBase64(file);
    setError(null);
    set({ audioUrl: `data:${file.type};base64,${base64}` });
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser cannot record audio. Attach a file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      media.ondataavailable = (event) => chunks.push(event.data);
      media.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: media.mimeType || "audio/webm" });
        if (blob.size > MAX_AUDIO_BYTES) {
          setError("That recording is too long — keep it under about 30 seconds.");
          return;
        }
        await attachAudio(new File([blob], "recording", { type: blob.type }));
      };
      recorder.current = media;
      media.start();
      setRecording(true);
      setError(null);
    } catch {
      setError("Microphone permission was refused.");
    }
  }

  function addTag(raw: string) {
    const tags = normaliseTags([...draft.tags, ...raw.split(/[,\s]+/)]);
    set({ tags });
    setTagInput("");
  }

  const topics = topicsFor(subjectId);
  const canSave = draft.front.trim().length > 0 && draft.back.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((kind) => (
          <button
            key={kind.value}
            type="button"
            onClick={() => set({ kind: kind.value })}
            title={kind.hint}
            className={cx(
              "pill transition-colors",
              draft.kind === kind.value ? "bg-accent text-onaccent border-transparent" : "hover:border-ink3",
            )}
          >
            {kind.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SNIPPETS.map((snippet) => (
          <button
            key={snippet.label}
            type="button"
            onClick={() => insert(snippet.insert)}
            title={`Insert ${snippet.hint} into the ${focusField}`}
            className="pill hover:border-ink3 transition-colors"
          >
            {snippet.label}
          </button>
        ))}
      </div>

      <Field label="Front" hint="The prompt. Ask a question — a heading tests nothing.">
        <textarea
          ref={frontRef}
          value={draft.front}
          onFocus={() => setFocusField("front")}
          onChange={(e) => set({ front: e.target.value })}
          rows={3}
          className="field nice-scroll"
        />
      </Field>

      <Field label="Back" hint="The answer, exactly as an examiner would want it.">
        <textarea
          ref={backRef}
          value={draft.back}
          onFocus={() => setFocusField("back")}
          onChange={(e) => set({ back: e.target.value })}
          rows={4}
          className="field nice-scroll"
        />
      </Field>

      <Field label="Note" hint="Optional context shown under the answer. Never tested.">
        <textarea value={draft.note} onChange={(e) => set({ note: e.target.value })} rows={2} className="field" />
      </Field>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Topic">
          <select value={draft.topicId} onChange={(e) => set({ topicId: e.target.value })} className="field text-sm">
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tags" hint="Enter or comma to add.">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                if (tagInput.trim()) addTag(tagInput);
              }
              if (e.key === "Backspace" && !tagInput && draft.tags.length) {
                set({ tags: draft.tags.slice(0, -1) });
              }
            }}
            onBlur={() => tagInput.trim() && addTag(tagInput)}
            placeholder="paper-1, tricky"
            className="field text-sm"
          />
        </Field>
      </div>

      {draft.tags.length ? (
        <div className="flex flex-wrap gap-1.5">
          {draft.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => set({ tags: draft.tags.filter((t) => t !== tag) })}
              className="pill hover:border-danger hover:text-danger transition-colors"
              aria-label={`Remove tag ${tag}`}
            >
              {tag} ×
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="btn btn-secondary text-sm cursor-pointer">
          <PhotoIcon size={ICON_SIZE.sm} aria-hidden />
          {draft.imageUrl ? "Replace image" : "Add image"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void attachImage(file);
              e.target.value = "";
            }}
          />
        </label>
        {draft.imageUrl ? (
          <Button size="sm" variant="ghost" onClick={() => set({ imageUrl: undefined })}>
            <DeleteIcon size={ICON_SIZE.sm} aria-hidden />
            Remove image
          </Button>
        ) : null}

        <Button size="sm" onClick={() => void toggleRecording()} className={cx(recording && "text-danger")}>
          {recording ? "◉ Stop recording" : "Record audio"}
        </Button>
        <label className="btn btn-secondary text-sm cursor-pointer">
          Add audio file
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void attachAudio(file);
              e.target.value = "";
            }}
          />
        </label>
        {draft.audioUrl ? (
          <Button size="sm" variant="ghost" onClick={() => set({ audioUrl: undefined })}>
            Remove audio
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <Panel className="card-2">
        <div className="flex items-center gap-2 mb-3">
          <Pill>Preview</Pill>
          <span className="text-[11px] text-ink3">This is exactly how the card will appear in review.</span>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1">Front</p>
            <RichText className="text-base text-ink">{draft.front || "_(empty)_"}</RichText>
            {draft.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draft.imageUrl}
                alt="Card attachment"
                className="mt-2 max-h-56 rounded-[8px] border border-line"
              />
            ) : null}
          </div>
          <div className="pt-3 border-t border-line">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1">Back</p>
            <RichText className="text-base">{draft.back || "_(empty)_"}</RichText>
            {draft.audioUrl ? <audio controls src={draft.audioUrl} className="w-full mt-2 h-9" /> : null}
            {draft.note ? <p className="text-xs text-ink3 mt-2 italic">{draft.note}</p> : null}
          </div>
        </div>
      </Panel>

      <div className="flex gap-2">
        <Button variant="primary" onClick={onSave} disabled={!canSave}>
          {saveLabel}
        </Button>
        {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
        {!canSave ? <span className="text-xs text-ink3 self-center">Both sides need content.</span> : null}
      </div>
    </div>
  );
}
