"use client";

import { useState } from "react";
import type { MouseEvent } from "react";
import { addDiagramPoint, MAX_DIAGRAM_LABEL, MAX_DIAGRAM_POINTS, type DiagramPointDraft } from "@/domain/diagrams";
import { imageForCard } from "@/lib/file-data";
import { Button } from "./ui";
import { DeleteIcon, ICON_SIZE, PhotoIcon } from "./icons";

// A learner's own labelled diagram: a photo or screenshot of a figure from
// their textbook or notes, with numbered points they tap onto it and name.
// Review then shows only the numbers ("name each point from memory") and
// "Label a diagram" makes them place each label back on the image.

export function DiagramCardBuilder({
  imageUrl,
  points,
  onImage,
  onPoints,
}: {
  imageUrl: string | undefined;
  points: DiagramPointDraft[];
  onImage: (imageUrl: string | undefined) => void;
  onPoints: (points: DiagramPointDraft[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function attach(file: File) {
    setLoading(true);
    setError(null);
    const dataUrl = await imageForCard(file);
    setLoading(false);
    if (!dataUrl) {
      setError("That file could not be read as an image. Try a JPEG or PNG photo or screenshot.");
      return;
    }
    onImage(dataUrl);
    onPoints([]);
  }

  function drop(event: MouseEvent<HTMLButtonElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    onPoints(addDiagramPoint(points, ((event.clientX - box.left) / box.width) * 100, ((event.clientY - box.top) / box.height) * 100));
  }

  const full = points.length >= MAX_DIAGRAM_POINTS;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn btn-secondary text-sm cursor-pointer">
          <PhotoIcon size={ICON_SIZE.sm} aria-hidden />
          {loading ? "Preparing image…" : imageUrl ? "Replace image" : "Add a photo or screenshot"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={loading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void attach(file);
              event.target.value = "";
            }}
          />
        </label>
        {imageUrl ? (
          <span className="text-xs text-ink3">
            {full ? `That is the maximum of ${MAX_DIAGRAM_POINTS} points.` : "Tap the image where each label belongs."}
          </span>
        ) : null}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}

      {imageUrl ? (
        <div className="relative mx-auto max-w-md">
          <button
            type="button"
            onClick={drop}
            disabled={full}
            aria-label="Diagram image. Tap where a label belongs to add a numbered point."
            className="block w-full cursor-crosshair disabled:cursor-default"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="w-full h-auto rounded-lg border border-line select-none" draggable={false} />
          </button>
          {points.map((point, index) => (
            <span
              key={point.id}
              aria-hidden
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 min-w-[1.5rem] min-h-[1.5rem] rounded-full border-2 border-accent bg-surface text-[11px] font-semibold flex items-center justify-center tabular-nums"
            >
              {index + 1}
            </span>
          ))}
        </div>
      ) : null}

      {points.length ? (
        <ol className="space-y-2" aria-label="Diagram points">
          {points.map((point, index) => (
            <li key={point.id} className="flex items-center gap-2">
              <span className="w-6 text-right text-sm font-semibold tabular-nums text-ink2">{index + 1}.</span>
              <input
                value={point.label}
                maxLength={MAX_DIAGRAM_LABEL}
                onChange={(event) =>
                  onPoints(points.map((candidate) => (candidate.id === point.id ? { ...candidate, label: event.target.value } : candidate)))
                }
                placeholder="What is at this point?"
                aria-label={`Label for point ${index + 1}`}
                className="field text-sm flex-1"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onPoints(points.filter((candidate) => candidate.id !== point.id))}
                aria-label={`Remove point ${index + 1}`}
              >
                <DeleteIcon size={ICON_SIZE.sm} aria-hidden />
              </Button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
