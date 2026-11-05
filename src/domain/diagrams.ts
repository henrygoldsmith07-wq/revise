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

/** The diagram lives on the card's `back` as JSON behind this marker. */
const MARKER = "@diagram:";

/**
 * A learner's own diagram keeps its photo on the card's `imageUrl`, not inside
 * the `back` payload: `imageUrl` is the media field every path already carries
 * at full size (sync, deck export/import, shared decks), while `back` is a text
 * field those paths cap at a few thousand characters. The payload then names
 * the card's own image with this placeholder.
 */
export const CARD_IMAGE = "card:image";

/** Enough points for any exam figure; more and the numbered markers overlap. */
export const MAX_DIAGRAM_POINTS = 20;
export const MAX_DIAGRAM_LABEL = 120;

export function serialiseDiagram(spec: DiagramSpec): string {
  return `${MARKER}${JSON.stringify(spec)}`;
}

/**
 * Read a diagram back off a card. Returns null for any card that is not a
 * diagram, and for one whose payload is damaged — a half-parsed diagram would
 * render as an unanswerable question.
 */
export function parseDiagram(card: Pick<Card, "back"> & { imageUrl?: string }): DiagramSpec | null {
  if (!card.back.startsWith(MARKER)) return null;
  try {
    const raw = JSON.parse(card.back.slice(MARKER.length)) as DiagramSpec;
    if (raw?.imageUrl === CARD_IMAGE) raw.imageUrl = card.imageUrl ?? "";
    if (!raw?.imageUrl || !Array.isArray(raw.hotspots) || !raw.hotspots.length) return null;
    const hotspots = raw.hotspots
      .filter((h) => typeof h?.label === "string" && h.label.trim().length > 0)
      .map((h, index) => ({
        id: String(h.id ?? index),
        x: clampPercent(Number(h.x)),
        y: clampPercent(Number(h.y)),
        label: String(h.label).slice(0, MAX_DIAGRAM_LABEL),
        note: h.note ? String(h.note).slice(0, 300) : undefined,
      }));
    return hotspots.length ? { imageUrl: raw.imageUrl, hotspots } : null;
  } catch {
    return null;
  }
}

/**
 * A diagram whose image is the card's own `imageUrl`. It cannot travel in a
 * share link, which carries text fields only; a file export keeps it whole.
 */
export function diagramNeedsCardImage(card: Pick<Card, "back">): boolean {
  if (!card.back.startsWith(MARKER)) return false;
  try {
    return (JSON.parse(card.back.slice(MARKER.length)) as { imageUrl?: unknown })?.imageUrl === CARD_IMAGE;
  } catch {
    return false;
  }
}

export function isDiagramCard(card: Pick<Card, "back"> & { imageUrl?: string }): boolean {
  return parseDiagram(card) !== null;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, value));
}

// --- the learner's own diagrams (image occlusion) -------------------------

/** A point the learner has dropped on their image, label possibly not yet typed. */
export interface DiagramPointDraft {
  id: Id;
  x: number;
  y: number;
  label: string;
}

/**
 * Drop a point where the learner tapped. Coordinates are percentages of the
 * displayed image, rounded so the payload stays short. Ids count up from the
 * highest used, so deleting a point never reuses another's id.
 */
export function addDiagramPoint(points: DiagramPointDraft[], x: number, y: number): DiagramPointDraft[] {
  if (points.length >= MAX_DIAGRAM_POINTS) return points;
  const next = points.reduce((max, point) => Math.max(max, Number(point.id.replace(/^p/, "")) || 0), 0) + 1;
  const round = (value: number) => Math.round(clampPercent(value) * 10) / 10;
  return [...points, { id: `p${next}`, x: round(x), y: round(y), label: "" }];
}

/** Why the draft cannot be saved yet, or null when it can. */
export function diagramDraftIssue(imageUrl: string | undefined, points: DiagramPointDraft[]): string | null {
  if (!imageUrl) return "Add a photo or screenshot of the diagram first.";
  if (!points.length) return "Tap the image to mark each point you want to recall.";
  const unnamed = points.findIndex((point) => !point.label.trim());
  if (unnamed >= 0) return `Name point ${unnamed + 1}, or remove it.`;
  return null;
}

/**
 * The `back` of a learner's diagram card. The image itself goes on the card's
 * `imageUrl` (see CARD_IMAGE); this is only the points, so it survives every
 * path that caps a card's text fields.
 */
export function diagramCardBack(points: DiagramPointDraft[]): string {
  const hotspots: Hotspot[] = points
    .filter((point) => point.label.trim())
    .slice(0, MAX_DIAGRAM_POINTS)
    .map((point) => ({ id: point.id, x: point.x, y: point.y, label: point.label.trim().slice(0, MAX_DIAGRAM_LABEL) }));
  return serialiseDiagram({ imageUrl: CARD_IMAGE, hotspots });
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
