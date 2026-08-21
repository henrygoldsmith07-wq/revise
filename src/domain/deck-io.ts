import { createCard, normaliseTags } from "./scheduling";
import type { Card, DeckExport, DeckExportCard, Id } from "./types";

// ---------------------------------------------------------------------------
// Deck import and export.
//
// Two shapes, deliberately:
//
// * **Backup** keeps scheduling state, so exporting and re-importing on another
//   device restores the deck exactly, FSRS history intact.
// * **Shared** strips scheduling, because one student's stability numbers are
//   meaningless to another and importing them would hand the recipient a deck
//   that claims to be learned when it is not.
//
// Import is defensive throughout: this is the one place the app ingests a file
// a stranger wrote, so every field is validated and clamped rather than
// trusted, and a malformed row is skipped with a reason rather than failing the
// whole file.
// ---------------------------------------------------------------------------

export const DECK_FORMAT_VERSION = 1;
/** Guards against a pasted novel or a hostile file exhausting memory. */
const MAX_CARDS = 5000;
const MAX_FIELD = 8000;
/** Data URLs are held in IndexedDB, so a huge one bloats every later read. */
const MAX_MEDIA_BYTES = 2_000_000;

export interface ExportOptions {
  name: string;
  description?: string;
  subjectId?: Id;
  /** Shared decks drop scheduling; backups keep it. */
  includeScheduling: boolean;
}

export function exportDeck(cards: Card[], options: ExportOptions): DeckExport {
  return {
    formatVersion: DECK_FORMAT_VERSION,
    name: options.name,
    description: options.description,
    exportedAt: new Date().toISOString(),
    source: "revise",
    subjectId: options.subjectId,
    cards: cards.map((card) => {
      const row: DeckExportCard = {
        front: card.front,
        back: card.back,
        kind: card.kind,
        tags: card.tags,
        note: card.note,
        imageUrl: card.imageUrl,
        audioUrl: card.audioUrl,
        clozeSource: card.clozeSource,
        topicId: card.topicId,
        subjectId: card.subjectId,
      };
      if (options.includeScheduling) {
        row.scheduling = {
          due: card.due,
          stability: card.stability,
          difficulty: card.difficulty,
          reps: card.reps,
          lapses: card.lapses,
          state: card.state,
          lastReviewedAt: card.lastReviewedAt,
        };
      }
      return row;
    }),
  };
}

export function serialiseDeck(deck: DeckExport): string {
  return JSON.stringify(deck, null, 2);
}

export interface ImportReport {
  deck: DeckExport | null;
  /** Rows that parsed cleanly. */
  accepted: number;
  /** Rows dropped, with the reason, capped so the UI stays readable. */
  rejected: { row: number; reason: string }[];
  warnings: string[];
}

function str(value: unknown, max = MAX_FIELD): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function safeMedia(value: unknown): string | undefined {
  const url = str(value, MAX_MEDIA_BYTES + 100);
  if (!url) return undefined;
  // Only self-contained data URLs and plain http(s) are allowed through —
  // `javascript:` and friends must never reach an href or src attribute.
  const isData = /^data:(image|audio)\/[a-z0-9.+-]+;base64,/i.test(url);
  const isHttp = /^https?:\/\//i.test(url);
  if (!isData && !isHttp) return undefined;
  if (url.length > MAX_MEDIA_BYTES) return undefined;
  return url;
}

/** Parse a `.json` deck (ours or hand-written) into a validated DeckExport. */
export function parseDeckJson(text: string): ImportReport {
  const rejected: ImportReport["rejected"] = [];
  const warnings: string[] = [];

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { deck: null, accepted: 0, rejected, warnings: ["That file is not valid JSON."] };
  }

  // A bare array of cards is accepted too — it is what people hand-write.
  const body = Array.isArray(raw) ? { cards: raw } : (raw as Record<string, unknown>);
  const rows = body?.cards;
  if (!Array.isArray(rows)) {
    return {
      deck: null,
      accepted: 0,
      rejected,
      warnings: ["No `cards` array found. Expected { name, cards: [{ front, back }] }."],
    };
  }

  const version = Number(body.formatVersion ?? DECK_FORMAT_VERSION);
  if (version > DECK_FORMAT_VERSION) {
    return {
      deck: null,
      accepted: 0,
      rejected,
      warnings: [`This deck is format v${version}; this version of Revise reads v${DECK_FORMAT_VERSION}.`],
    };
  }

  if (rows.length > MAX_CARDS) {
    warnings.push(`Deck has ${rows.length} cards; only the first ${MAX_CARDS} were read.`);
  }

  const cards: DeckExportCard[] = [];
  rows.slice(0, MAX_CARDS).forEach((row, index) => {
    const record = row as Record<string, unknown>;
    const front = str(record.front ?? record.question ?? record.Front);
    const back = str(record.back ?? record.answer ?? record.Back);
    if (!front.trim() || !back.trim()) {
      rejected.push({ row: index + 1, reason: "missing front or back" });
      return;
    }
    const scheduling = record.scheduling as Record<string, unknown> | undefined;
    cards.push({
      front,
      back,
      kind: normaliseKind(record.kind),
      tags: normaliseTags(Array.isArray(record.tags) ? record.tags.map((t) => String(t)) : []),
      note: str(record.note) || undefined,
      imageUrl: safeMedia(record.imageUrl),
      audioUrl: safeMedia(record.audioUrl),
      clozeSource: str(record.clozeSource) || undefined,
      topicId: str(record.topicId, 200) || undefined,
      subjectId: str(record.subjectId, 200) || undefined,
      scheduling: scheduling
        ? {
            due: str(scheduling.due, 10) || new Date().toISOString().slice(0, 10),
            stability: clamp(Number(scheduling.stability) || 0, 0, 36500),
            difficulty: clamp(Number(scheduling.difficulty) || 5, 1, 10),
            reps: clamp(Math.round(Number(scheduling.reps) || 0), 0, 100000),
            lapses: clamp(Math.round(Number(scheduling.lapses) || 0), 0, 100000),
            state: clamp(Math.round(Number(scheduling.state) || 0), 0, 3),
            lastReviewedAt: typeof scheduling.lastReviewedAt === "string" ? scheduling.lastReviewedAt : null,
          }
        : undefined,
    });
  });

  if (!cards.length) {
    warnings.push("No usable cards in that file.");
    return { deck: null, accepted: 0, rejected, warnings };
  }

  return {
    deck: {
      formatVersion: DECK_FORMAT_VERSION,
      name: str(body.name, 120) || "Imported deck",
      description: str(body.description, 500) || undefined,
      exportedAt: str(body.exportedAt, 40) || new Date().toISOString(),
      source: str(body.source, 60) || undefined,
      subjectId: str(body.subjectId, 200) || undefined,
      cards,
    },
    accepted: cards.length,
    rejected: rejected.slice(0, 20),
    warnings,
  };
}

/**
 * Parse delimited text — the lingua franca of shared decks (Anki, Quizlet and
 * every spreadsheet export). Columns: front, back, tags.
 */
export function parseDeckCsv(text: string, name = "Imported deck"): ImportReport {
  const rejected: ImportReport["rejected"] = [];
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { deck: null, accepted: 0, rejected, warnings: ["That file is empty."] };

  // Tabs win when present: Anki exports are tab-separated and answers commonly
  // contain commas, so guessing comma-first mangles them.
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const cards: DeckExportCard[] = [];

  lines.slice(0, MAX_CARDS).forEach((line, index) => {
    // Skip Anki's `#`-prefixed metadata lines.
    if (line.startsWith("#")) return;
    const fields = splitDelimited(line, delimiter);
    if (index === 0 && /^(front|question|term)$/i.test(fields[0]?.trim() ?? "")) return; // header
    const [front, back, tags] = fields;
    if (!front?.trim() || !back?.trim()) {
      rejected.push({ row: index + 1, reason: "needs at least two columns" });
      return;
    }
    cards.push({
      front: front.slice(0, MAX_FIELD),
      back: back.slice(0, MAX_FIELD),
      kind: "basic",
      tags: normaliseTags((tags ?? "").split(/[ ,;]+/)),
    });
  });

  if (lines.length > MAX_CARDS) warnings.push(`Only the first ${MAX_CARDS} rows were read.`);
  if (!cards.length) {
    warnings.push("No rows had both a front and a back.");
    return { deck: null, accepted: 0, rejected, warnings };
  }

  return {
    deck: {
      formatVersion: DECK_FORMAT_VERSION,
      name,
      exportedAt: new Date().toISOString(),
      cards,
    },
    accepted: cards.length,
    rejected: rejected.slice(0, 20),
    warnings,
  };
}

/** Respects quoted fields so a comma inside an answer does not split it. */
function splitDelimited(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}

export function parseDeckFile(text: string, filename: string): ImportReport {
  return /\.(csv|tsv|txt)$/i.test(filename)
    ? parseDeckCsv(text, filename.replace(/\.[^.]+$/, ""))
    : parseDeckJson(text);
}

export interface MaterialiseOptions {
  userId: Id;
  /** Where cards land when the deck does not name a topic, or names an unknown one. */
  fallbackSubjectId: Id;
  fallbackTopicId: Id;
  /** Known topic ids; anything else falls back rather than dangling. */
  knownTopicIds: Set<Id>;
  /** Existing fronts, lower-cased, used to skip duplicates. */
  existingFronts?: Set<string>;
  /** Import scheduling state when the file carries it. */
  keepScheduling: boolean;
  /** Applied to every imported card so the batch stays identifiable. */
  extraTags?: string[];
  now?: Date;
  idFactory?: () => string;
}

export interface MaterialiseResult {
  cards: Card[];
  duplicates: number;
  retargeted: number;
}

/** Turn a validated deck into real cards, ready to save. */
export function materialiseDeck(deck: DeckExport, options: MaterialiseOptions): MaterialiseResult {
  const now = options.now ?? new Date();
  const nextId = options.idFactory ?? (() => crypto.randomUUID());
  const seen = new Set(options.existingFronts ?? []);
  const cards: Card[] = [];
  let duplicates = 0;
  let retargeted = 0;

  for (const row of deck.cards) {
    const key = row.front.trim().toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);

    const topicId = row.topicId && options.knownTopicIds.has(row.topicId) ? row.topicId : options.fallbackTopicId;
    if (topicId !== row.topicId) retargeted++;
    const subjectId =
      topicId === row.topicId && row.subjectId ? row.subjectId : options.fallbackSubjectId;

    const card = createCard(
      {
        id: nextId(),
        userId: options.userId,
        subjectId,
        topicId,
        front: row.front,
        back: row.back,
        kind: row.kind,
        origin: "import",
        clozeSource: row.clozeSource,
        imageUrl: row.imageUrl,
        audioUrl: row.audioUrl,
        note: row.note,
        tags: [...row.tags, ...(options.extraTags ?? [])],
      },
      now,
    );

    if (options.keepScheduling && row.scheduling) {
      cards.push({
        ...card,
        due: row.scheduling.due,
        stability: row.scheduling.stability,
        difficulty: row.scheduling.difficulty,
        reps: row.scheduling.reps,
        lapses: row.scheduling.lapses,
        state: row.scheduling.state,
        lastReviewedAt: row.scheduling.lastReviewedAt,
      });
    } else {
      cards.push(card);
    }
  }

  return { cards, duplicates, retargeted };
}

function normaliseKind(value: unknown): DeckExportCard["kind"] {
  const kind = String(value ?? "basic").toLowerCase();
  const allowed = ["basic", "cloze", "image", "equation", "mistake", "audio"];
  return (allowed.includes(kind) ? kind : "basic") as DeckExportCard["kind"];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
