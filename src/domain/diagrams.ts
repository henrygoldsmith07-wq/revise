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

export function serialiseDiagram(spec: DiagramSpec): string {
  return `${MARKER}${JSON.stringify(spec)}`;
}

/**
 * Read a diagram back off a card. Returns null for any card that is not a
 * diagram, and for one whose payload is damaged — a half-parsed diagram would
 * render as an unanswerable question.
 */
export function parseDiagram(card: Card): DiagramSpec | null {
  if (!card.back.startsWith(MARKER)) return null;
  try {
    const raw = JSON.parse(card.back.slice(MARKER.length)) as DiagramSpec;
    if (!raw?.imageUrl || !Array.isArray(raw.hotspots) || !raw.hotspots.length) return null;
    const hotspots = raw.hotspots
      .filter((h) => typeof h?.label === "string" && h.label.trim().length > 0)
      .map((h, index) => ({
        id: String(h.id ?? index),
        x: clampPercent(Number(h.x)),
        y: clampPercent(Number(h.y)),
        label: String(h.label).slice(0, 120),
        note: h.note ? String(h.note).slice(0, 300) : undefined,
      }));
    return hotspots.length ? { imageUrl: raw.imageUrl, hotspots } : null;
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

  return {
    round: {
      ...round,
      placed: { ...round.placed, [hotspotId]: hotspot.label },
      bank: round.bank.filter((l) => l !== label),
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
