import { createCard, normaliseTags } from "./scheduling";
import { normaliseCloze } from "./cloze";
import { isLocalDateKey, todayLocal } from "./local-date";
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
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      rejected.push({ row: index + 1, reason: "not a card" });
      return;
    }
    const record = row as Record<string, unknown>;
    const front = str(record.front ?? record.question ?? record.Front);
    const back = str(record.back ?? record.answer ?? record.Back);
    if (!front.trim() || !back.trim()) {
      rejected.push({ row: index + 1, reason: "missing front or back" });
      return;
    }
    const scheduling = record.scheduling as Record<string, unknown> | undefined;
    const requestedKind = normaliseKind(record.kind);
    const importedClozeSource = str(record.clozeSource) || undefined;
    const cloze =
      requestedKind === "cloze"
        ? normaliseCloze(front, back, importedClozeSource)
        : null;
    const kind = requestedKind === "cloze" && !cloze ? "basic" : requestedKind;
    if (requestedKind === "cloze" && !cloze) {
      warnings.push(`Row ${index + 1} was labelled cloze but had no recoverable deletion, so it was imported as basic.`);
    }
    cards.push({
      front: cloze?.front ?? front,
      back: cloze?.back ?? back,
      kind,
      tags: normaliseTags(Array.isArray(record.tags) ? record.tags.map((t) => String(t)) : []),
      note: str(record.note) || undefined,
      imageUrl: safeMedia(record.imageUrl),
      audioUrl: safeMedia(record.audioUrl),
      clozeSource: cloze?.clozeSource,
      topicId: str(record.topicId, 200) || undefined,
      subjectId: str(record.subjectId, 200) || undefined,
      scheduling: scheduling
        ? {
            due: isLocalDateKey(scheduling.due) ? scheduling.due : todayLocal(),
            stability: clamp(Number(scheduling.stability) || 0, 0, 36500),
            difficulty: clamp(Number(scheduling.difficulty) || 5, 1, 10),
            reps: clamp(Math.round(Number(scheduling.reps) || 0), 0, 100000),
            lapses: clamp(Math.round(Number(scheduling.lapses) || 0), 0, 100000),
            state: clamp(Math.round(Number(scheduling.state) || 0), 0, 3),
            lastReviewedAt:
              typeof scheduling.lastReviewedAt === "string" && Number.isFinite(Date.parse(scheduling.lastReviewedAt))
                ? scheduling.lastReviewedAt
                : null,
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

/** Anki's named `#separator:` values; anything else is taken as the literal character. */
const ANKI_SEPARATORS: Record<string, string> = { tab: "\t", comma: ",", semicolon: ";", pipe: "|", space: " ", colon: ":" };
/** Anki columns that are neither side of the card. */
const ANKI_META_COLUMNS = ["notetype column", "deck column", "guid column"];

/**
 * Parse delimited text — the lingua franca of shared decks (Anki, Quizlet and
 * every spreadsheet export). Columns: front, back, tags. Anki's leading
 * `#key:value` lines name the separator and the tag column.
 */
export function parseDeckCsv(text: string, name = "Imported deck"): ImportReport {
  const rejected: ImportReport["rejected"] = [];
  const warnings: string[] = [];
  // Excel writes a byte-order mark, which would otherwise hide a header row.
  const body = text.replace(/^\uFEFF/, "");
  const directives = leadingDirectives(body);
  const firstRow = body.split(/\r?\n/).find((line) => line.trim() && !line.startsWith("#")) ?? "";
  const separator = directives.get("separator");
  // Tabs win when present: Anki exports are tab-separated and answers commonly
  // contain commas, so guessing comma-first mangles them.
  const delimiter = separator
    ? (ANKI_SEPARATORS[separator.toLowerCase()] ?? separator[0]!)
    : firstRow.includes("\t") ? "\t" : ",";
  const columnIndex = (key: string) => {
    const column = Number(directives.get(key));
    return Number.isInteger(column) && column >= 1 ? column - 1 : null;
  };
  const tagIndex = columnIndex("tags column") ?? 2;
  const skipped = new Set([tagIndex, ...ANKI_META_COLUMNS.map(columnIndex).filter((i): i is number => i !== null)]);

  const records = readDelimitedRecords(body, delimiter, MAX_CARDS + 1);
  if (!records.length) return { deck: null, accepted: 0, rejected, warnings: ["That file is empty."] };
  const cards: DeckExportCard[] = [];

  records.slice(0, MAX_CARDS).forEach((record, index) => {
    const [front, back] = record.fields.filter((_, column) => !skipped.has(column));
    if (index === 0 && /^(front|question|term)$/i.test(front?.trim() ?? "")) return; // header
    if (!front?.trim() || !back?.trim()) {
      rejected.push({ row: record.line, reason: "needs at least two columns" });
      return;
    }
    cards.push({
      front: front.slice(0, MAX_FIELD),
      back: back.slice(0, MAX_FIELD),
      kind: "basic",
      tags: normaliseTags((record.fields[tagIndex] ?? "").split(/[ ,;]+/)),
    });
  });

  if (records.length > MAX_CARDS) warnings.push(`Only the first ${MAX_CARDS} rows were read.`);
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

/** Anki's `#key:value` header lines, keys lower-cased. Only the ones before the first row count. */
function leadingDirectives(text: string): Map<string, string> {
  const directives = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!line.startsWith("#")) break;
    const match = /^#([^:]+):(.*)$/.exec(line);
    if (match) directives.set(match[1]!.trim().toLowerCase(), match[2]!.trim());
  }
  return directives;
}

interface DelimitedRecord {
  fields: string[];
  /** 1-based source line the record starts on, for the rejection report. */
  line: number;
}

/**
 * RFC 4180 records: a quote opens a field only at its first character, `""`
 * inside one is a literal quote, and a quoted field may span lines (a
 * spreadsheet cell with line breaks). A quote anywhere else is plain text, so
 * `A 5" screen` cannot swallow the rest of the file. Blank records and
 * `#`-prefixed lines (Anki directives and comments) are skipped.
 */
function readDelimitedRecords(text: string, delimiter: string, limit: number): DelimitedRecord[] {
  const records: DelimitedRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let fieldStart = true;
  let comment = false;
  let line = 1;
  let recordLine = 1;
  const endRecord = () => {
    fields.push(field);
    if (!comment && fields.some((value) => value.trim())) records.push({ fields, line: recordLine });
    fields = [];
    field = "";
    fieldStart = true;
    comment = false;
  };
  for (let i = 0; i < text.length && records.length < limit; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else if (char === "\r" && text[i + 1] === "\n") {
        continue;
      } else {
        if (char === "\n") line++;
        field += char;
      }
      continue;
    }
    if (char === '"' && fieldStart) {
      quoted = true;
      fieldStart = false;
    } else if (char === delimiter) {
      fields.push(field);
      field = "";
      fieldStart = true;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      if (char === "#" && fieldStart && !fields.length) comment = true;
      field += char;
      fieldStart = false;
    }
  }
  if (records.length < limit) endRecord();
  return records;
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

/** Coerce an untrusted kind string onto the allowed card kinds. */
export function normaliseKind(value: unknown): DeckExportCard["kind"] {
  const kind = String(value ?? "basic").toLowerCase();
  const allowed = ["basic", "cloze", "image", "equation", "mistake", "audio"];
  return (allowed.includes(kind) ? kind : "basic") as DeckExportCard["kind"];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
