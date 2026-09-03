// ---------------------------------------------------------------------------
// PII masking for AI prompts.
//
// Student free text (essays, explanations, chat) can contain personal details
// — their name, a teacher's name, their school, contact details. Those details
// do not belong in a payload sent to a third-party model endpoint, so they are
// replaced with stable placeholders ([ENTITY_1], [ENTITY_2], …) before the
// request leaves the browser.
//
// Local heuristics, zero dependencies, no model download: this runs on every
// AI request, so it must be fast and always available. The patterns below
// catch the high-risk, high-precision categories (emails, phones, postcodes,
// school names, person-name introductions); a local NER model would catch
// more but costs megabytes and latency on every call — the honest trade-off
// for a privacy guard that must never be the reason marking fails.
//
// Masking is *stable within one request*: the same name maps to the same
// placeholder everywhere, so "Priya said…" and "…asked Priya" both become
// [ENTITY_1] and the model can still reason about coreference. Mark scheme
// keywords and subject terminology never match the patterns, so the model
// still sees the evidence it grades against.
// ---------------------------------------------------------------------------

/** A masked entity and what the student can see was replaced. */
export interface MaskedEntity {
  /** Stable placeholder used in the outgoing text. */
  placeholder: string;
  /** What kind of PII was detected. */
  kind: PiiKind;
  /** The original text — kept only for the local preview; never leaves the device. */
  original: string;
}

export type PiiKind = "email" | "phone" | "postcode" | "school" | "name" | "address";

export interface MaskResult {
  /** Text safe to send to the AI endpoint. */
  masked: string;
  /** What was replaced, for the local "what was withheld" disclosure. */
  entities: MaskedEntity[];
}

// Ordered high-precision → lower-precision: earlier patterns claim their
// matches so later, broader ones cannot double-mask overlapping text.
const PATTERNS: { kind: PiiKind; re: RegExp }[] = [
  { kind: "email", re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi },
  // UK mobile/landline shapes: 07xxx xxxxxx, +44 …, 020 xxxx xxxx, etc.
  { kind: "phone", re: /(?:\+44\s?|0)(?:7\d{3}\s?\d{6}|1\d{3}\s?\d{6}|2\d{3}\s?\d{6}|3\d{3}\s?\d{6}|7\d{4}\s?\d{5})(?:\s?ext\.?\s?\d+)?/g },
  // UK postcodes (incl. partial on its own is too noisy; full only).
  { kind: "postcode", re: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g },
  // School-ish institutions: catches "X High School", "St Bede's College",
  // "Grange Primary School", "X Sixth Form College", "X Academy".
  {
    kind: "school",
    re: /\b((?:st\.?|saint)\s+[a-z]+(?:'s)?|[a-z]+(?:\s+[a-z]+)?)\s+(high\s+school|secondary\s+(?:school|college)|grammar\s+school|primary\s+school|sixth\s+form\s+college|college|academy|free\s+school)\b/gi,
  },
  // Street addresses: number + street-type word ("12 Maple Road", "34a High St").
  {
    kind: "address",
    re: /\b\d{1,4}[a-z]?\s+[a-z]+(?:\s+[a-z]+){0,2}\s+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|close|court|way|gardens|grove|terrace|walk|hill|park)\b\.?/gi,
  },
  // Person-name introductions: "My name is X", "I am X", "I'm X", "teacher
  // Mr/Mrs/… X". Case-insensitive — real essays open with "My name is…" and
  // "Mr Patel", both capitalised, and a case-sensitive pattern silently
  // misses them (the bug the property tests caught).
  { kind: "name", re: /\b(?:my name is|name's|i am|i'm|this is|written by|signed)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi },
  { kind: "name", re: /\b(?:mr|mrs|ms|miss|dr|sir|madam)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/gi },
];

/**
 * Escape a user-derived string so it can sit inside a RegExp safely.
 */
function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Capitalised-word runs are only masked in *introduction* contexts above —
 *  scanning every capitalised noun ("Photosynthesis", "The Mitochondria")
 *  without context would damage the answer the model is meant to grade. Once
 *  a person's name *is* established by an introduction or title, though,
 *  later bare mentions of the same name in the request are propagated to its
 *  placeholder, so coreference survives masking without a full NER model. */
export function maskPii(text: string): MaskResult {
  const entities: MaskedEntity[] = [];
  const byOriginal = new Map<string, string>();
  let masked = text;

  for (const { kind, re } of PATTERNS) {
    masked = masked.replace(re, (match, captured) => {
      const target = typeof captured === "string" && captured ? captured : match;
      const existing = byOriginal.get(target);
      if (existing) return match.replace(target, existing);
      const placeholder = `[ENTITY_${entities.length + 1}]`;
      byOriginal.set(target, placeholder);
      entities.push({ placeholder, kind, original: target });
      return match.replace(target, placeholder);
    });
  }

  // Propagation pass: a name already replaced in an introduction context is
  // masked again wherever the same name reappears later in the request
  // (full phrase for multi-word names — no term-collision risk).
  for (const e of entities) {
    if (e.kind !== "name") continue;
    if (/^entity\d*$/i.test(e.original)) continue; // never touch our own marker
    masked = masked.replace(new RegExp(`\\b${escapeRegExp(e.original)}\\b`, "gi"), e.placeholder);
  }

  return { masked, entities };
}

/** True when the outgoing text differs from the student's input. */
export function hasMaskedContent(result: MaskResult): boolean {
  return result.entities.length > 0;
}

/** One-shot helper for outgoing payloads: text in, masked text out. */
export function maskStudentText(text: string): string {
  return maskPii(text).masked;
}

/** Mask every entry of a chat history without mutating the original. */
export function maskChatHistory(history: { role: "user" | "assistant"; content: string }[]): {
  role: "user" | "assistant";
  content: string;
}[] {
  return history.map((entry) => ({
    role: entry.role,
    content: entry.role === "user" ? maskStudentText(entry.content) : entry.content,
  }));
}

/** Human-readable summary for the local disclosure ("2 details withheld"). */
export function maskSummary(result: MaskResult): string | null {
  if (!result.entities.length) return null;
  const counts = new Map<PiiKind, number>();
  for (const e of result.entities) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  return [...counts.entries()].map(([kind, n]) => `${n} ${kind}${n > 1 ? "s" : ""}`).join(", ");
}

/** Aggregate a multi-part answer's masking into one disclosure line, or null
 *  when nothing was withheld. Counts total placeholders, not occurrences. */
export function maskSummaryMany(results: MaskResult[]): string | null {
  const counts = new Map<PiiKind, number>();
  for (const r of results) {
    for (const e of r.entities) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  }
  if (!counts.size) return null;
  return [...counts.entries()].map(([kind, n]) => `${n} ${kind}${n > 1 ? "s" : ""}`).join(", ");
}
