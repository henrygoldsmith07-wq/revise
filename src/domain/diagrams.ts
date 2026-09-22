import { shuffleWithSeed } from "./shuffle";
import type { Card, Id } from "./types";

// ---------------------------------------------------------------------------
// Diagram labelling.
//
// A large share of A-level biology and physics marks come from labelling a
// figure — the nephron, a cell, a ray diagram, a circuit. That is a different
// skill from prose recall and needs its own card type: an image plus labelled
// points, where the student places each label on the right spot.
//
// Hotspots are stored as percentages of the image's own width and height, so
// a diagram labelled on a laptop still lines up on a phone at any zoom.
// ---------------------------------------------------------------------------

export interface Hotspot {
  id: Id;
  /** 0–100, as a percentage of the image's width/height. */
  x: number;
  y: number;
  label: string;
  /** Optional extra shown after a correct placement. */
  note?: string;
}

export interface DiagramSpec {
  imageUrl: string;
  hotspots: Hotspot[];
}

export interface DiagramBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The diagram lives on the card's `back` as JSON behind this marker. */
const MARKER = "@diagram:";
const CARD_IMAGE_REF = "@card-image";

function safeDiagramImageUrl(value: string | undefined): string | null {
  const url = value?.trim();
  if (!url) return null;
  if (/^\/(?!\/)/.test(url)) return url; // bundled /public asset
  if (/^https?:\/\//i.test(url)) return url;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(url)) return url;
  return null;
}

/**
 * Serialise a diagram. User-authored data URLs can reference the card's
 * `imageUrl` instead of embedding the same image bytes a second time inside
 * the JSON payload.
 */
export function serialiseDiagram(
  spec: DiagramSpec,
  options: { referenceCardImage?: boolean } = {},
): string {
  const stored = {
    ...spec,
    imageUrl: options.referenceCardImage ? CARD_IMAGE_REF : spec.imageUrl,
  };
  return `${MARKER}${JSON.stringify(stored)}`;
}

/** Turn a pointer coordinate into stable percentage coordinates on an image. */
export function diagramPercentPosition(
  clientX: number,
  clientY: number,
  bounds: DiagramBounds,
): { x: number; y: number } | null {
  if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }
  const x = clampPercent(((clientX - bounds.left) / bounds.width) * 100);
  const y = clampPercent(((clientY - bounds.top) / bounds.height) * 100);
  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
  };
}

/**
 * Validate and normalise an authored diagram before it enters storage. Blank
 * labels block saving rather than being silently discarded.
 */
export function buildDiagramSpec(imageUrlRaw: string | undefined, hotspots: Hotspot[]): DiagramSpec | null {
  const imageUrl = imageUrlRaw?.trim();
  if (!imageUrl || !hotspots.length) return null;
  if (hotspots.some((hotspot) => !hotspot.label.trim())) return null;
  return {
    imageUrl,
    hotspots: hotspots.map((hotspot, index) => ({
      id: String(hotspot.id || index),
      x: clampPercent(Number(hotspot.x)),
      y: clampPercent(Number(hotspot.y)),
      label: hotspot.label.trim().slice(0, 120),
      note: hotspot.note?.trim() ? hotspot.note.trim().slice(0, 300) : undefined,
    })),
  };
}

/**
 * Read a diagram back off a card. Returns null for any card that is not a
 * diagram, and for one whose payload is damaged — a half-parsed diagram would
 * render as an unanswerable question.
 */
export function parseDiagram(card: Card): DiagramSpec | null {
  if (!card.back.startsWith(MARKER)) return null;
  try {
    const raw = JSON.parse(card.back.slice(MARKER.length)) as { imageUrl?: string; hotspots?: Hotspot[] };
    const referencedImage = raw?.imageUrl === CARD_IMAGE_REF ? card.imageUrl : raw?.imageUrl;
    const imageUrl = safeDiagramImageUrl(referencedImage);
    if (!imageUrl || !Array.isArray(raw.hotspots) || !raw.hotspots.length) return null;
    const hotspots = raw.hotspots
      .filter((h) => typeof h?.label === "string" && h.label.trim().length > 0)
      .map((h, index) => ({
        id: String(h.id ?? index),
        x: clampPercent(Number(h.x)),
        y: clampPercent(Number(h.y)),
        label: String(h.label).slice(0, 120),
        note: h.note ? String(h.note).slice(0, 300) : undefined,
      }));
    return hotspots.length ? { imageUrl, hotspots } : null;
  } catch {
    return null;
  }
}

export function isDiagramCard(card: Card): boolean {
  return parseDiagram(card) !== null;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, value));
}

// --- the labelling round ---------------------------------------------------

export interface DiagramRound {
  spec: DiagramSpec;
  /** Labels to place, shuffled so their order is not a hint. */
  bank: string[];
  /** hotspotId → label the student has placed there. */
  placed: Record<Id, string>;
  wrong: number;
}

export function startDiagramRound(spec: DiagramSpec, seed = 1): DiagramRound {
  return {
    spec,
    bank: shuffleWithSeed(spec.hotspots.map((h) => h.label), seed),
    placed: {},
    wrong: 0,
  };
}

/**
 * Place a label. A wrong placement is counted and rejected rather than stuck
 * on the diagram — leaving it there would teach the wrong position.
 */
export function placeLabel(round: DiagramRound, hotspotId: Id, label: string): { round: DiagramRound; correct: boolean } {
  const hotspot = round.spec.hotspots.find((h) => h.id === hotspotId);
  if (!hotspot || round.placed[hotspotId]) return { round, correct: false };

  const correct = normalise(hotspot.label) === normalise(label);
  if (!correct) return { round: { ...round, wrong: round.wrong + 1 }, correct: false };

  // Remove a single occurrence: two hotspots may legitimately share a label,
  // and removing both would leave the second one impossible to complete.
  const bank = [...round.bank];
  const at = bank.indexOf(hotspot.label);
  if (at >= 0) bank.splice(at, 1);

  return {
    round: {
      ...round,
      placed: { ...round.placed, [hotspotId]: hotspot.label },
      bank,
    },
    correct: true,
  };
}

export function isDiagramComplete(round: DiagramRound): boolean {
  return round.spec.hotspots.every((h) => round.placed[h.id]);
}

export function diagramScore(round: DiagramRound): { placed: number; total: number; accuracy: number } {
  const placed = Object.keys(round.placed).length;
  const attempts = placed + round.wrong;
  return { placed, total: round.spec.hotspots.length, accuracy: attempts ? placed / attempts : 0 };
}

export function normaliseMath(input: string): string {
  // Normalise handwriting/ocr maths: unicode symbols, whitespace and common lookalikes
  return input
    .replace(/[–—]/g, "-")
    .replace(/×/g, "*").replace(/÷/g, "/")
    .replace(/−/g, "-").replace(/[²³]/g, (m)=> m==="²" ? "^2" : "^3")
    .replace(/\s+/g, " ").trim();
}

/** Light OCR reliability signal: returns a 0–1 confidence and a flag for handwriting vs typed. */
export function ocrReliability(input: string): { confidence: number; looksHandwritten: boolean } {
  const trimmed = input.trim();
  if (!trimmed) return { confidence: 0, looksHandwritten: false };
  const hasDigits = /\d/.test(trimmed);
  const hasMathSymbols = /[+\-×÷^/=²³√π]/.test(trimmed);
  const weirdChars = (trimmed.match(/[^a-zA-Z0-9+\-.^/=²³×÷\s]/g) ?? []).length / Math.max(1, trimmed.length);
  const confidence = Math.max(0, Math.min(1, 0.92 - weirdChars * 1.5 + (hasDigits && hasMathSymbols ? 0.05 : 0)));
  const looksHandwritten = weirdChars > 0.08 || /[~`]{2,}/.test(trimmed);
  return { confidence, looksHandwritten };
}

/** Per-diagram reliability: hotspot-level marking that tolerates label synonyms and OCR slips. */
export function markDiagramWithTolerance(spec: DiagramSpec, placements: Record<Id, string>): { awarded: number; max: number; flagged: Id[] } {
  let awarded = 0;
  const flagged: Id[] = [];
  for (const h of spec.hotspots) {
    const given = placements[h.id]?.trim() ?? "";
    if (!given) { flagged.push(h.id); continue; }
    const rel = ocrReliability(given);
    if (rel.confidence < 0.35) { flagged.push(h.id); continue; }
    const ok = normalise(h.label) === normalise(given) || normalise(h.label).replace(/\s+/g, "").includes(normalise(given).replace(/\s+/g, ""));
    if (ok) awarded++;
    else flagged.push(h.id);
  }
  return { awarded, max: spec.hotspots.length, flagged };
}

function normalise(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}
