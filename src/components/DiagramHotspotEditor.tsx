"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { diagramPercentPosition, type Hotspot } from "@/domain/diagrams";
import { Button } from "./ui";
import { DeleteIcon, ICON_SIZE } from "./icons";

const MAX_HOTSPOTS = 12;

export function DiagramHotspotEditor({
  imageUrl,
  hotspots,
  onChange,
}: {
  imageUrl: string;
  hotspots: Hotspot[];
  onChange: (hotspots: Hotspot[]) => void;
}) {
  const update = (id: string, patch: Partial<Hotspot>) => {
    onChange(hotspots.map((hotspot) => (hotspot.id === id ? { ...hotspot, ...patch } : hotspot)));
  };

  const addAt = (x: number, y: number) => {
    if (hotspots.length >= MAX_HOTSPOTS) return;
    onChange([
      ...hotspots,
      {
        id: crypto.randomUUID(),
        x,
        y,
        label: "",
      },
    ]);
  };

  const addFromImage = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (hotspots.length >= MAX_HOTSPOTS) return;
    const point = diagramPercentPosition(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
    );
    if (point) addAt(point.x, point.y);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-ink">Label points</p>
        <p className="text-xs text-ink3 mt-0.5">
          Click or tap the image where a label belongs, then name that point below. Up to {MAX_HOTSPOTS} points.
        </p>
      </div>

      <div
        className="relative rounded-[8px] border border-line overflow-hidden cursor-crosshair bg-surface2"
        onClick={addFromImage}
        aria-label="Diagram hotspot placement area"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="Diagram being labelled" className="block w-full h-auto select-none" draggable={false} />
        {hotspots.map((hotspot, index) => (
          <button
            key={hotspot.id}
            type="button"
            aria-label={hotspot.label ? `Point ${index + 1}: ${hotspot.label}` : `Point ${index + 1}, label not set`}
            title={hotspot.label || `Point ${index + 1}`}
            style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 min-w-8 min-h-8 rounded-full border-2 border-accent bg-surface text-xs font-semibold text-ink shadow-sm"
            onClick={(event) => {
              event.stopPropagation();
              document.getElementById(`diagram-label-${hotspot.id}`)?.focus();
            }}
          >
            {index + 1}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-ink3">
          {hotspots.length}/{MAX_HOTSPOTS} points
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={hotspots.length >= MAX_HOTSPOTS}
          onClick={() => addAt(50, 50)}
        >
          Add centre point
        </Button>
      </div>

      {hotspots.length ? (
        <ol className="space-y-2">
          {hotspots.map((hotspot, index) => (
            <li key={hotspot.id} className="card card-2 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center rounded-full border border-line w-7 h-7 text-xs font-semibold shrink-0">
                  {index + 1}
                </span>
                <input
                  id={`diagram-label-${hotspot.id}`}
                  value={hotspot.label}
                  onChange={(event) => update(hotspot.id, { label: event.target.value })}
                  maxLength={120}
                  placeholder="Label — e.g. Nucleus"
                  aria-label={`Label for point ${index + 1}`}
                  className="field text-sm flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove point ${index + 1}`}
                  onClick={() => onChange(hotspots.filter((candidate) => candidate.id !== hotspot.id))}
                >
                  <DeleteIcon size={ICON_SIZE.sm} aria-hidden />
                </Button>
              </div>

              <input
                value={hotspot.note ?? ""}
                onChange={(event) => update(hotspot.id, { note: event.target.value })}
                maxLength={300}
                placeholder="Optional note shown after recall"
                aria-label={`Note for point ${index + 1}`}
                className="field text-xs"
              />

              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-ink3">
                  X position %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={hotspot.x}
                    onChange={(event) => update(hotspot.id, { x: clampInput(event.target.value) })}
                    className="field text-xs mt-1"
                  />
                </label>
                <label className="text-[11px] text-ink3">
                  Y position %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={hotspot.y}
                    onChange={(event) => update(hotspot.id, { y: clampInput(event.target.value) })}
                    className="field text-xs mt-1"
                  />
                </label>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-ink3 rounded-[8px] border border-dashed border-line px-3 py-3">
          No points yet. Add at least one labelled point before saving this as a label diagram.
        </p>
      )}
    </div>
  );
}

function clampInput(raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
