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

/** `a|bc d` → `[Aa]|[Bb]c\s+[Dd]`: each word's first letter in either case. */
function anyCase(alternatives: string): string {
  return alternatives
    .split("|")
    .map((phrase) => phrase.split(" ").map((word) => `[${word[0]!.toUpperCase()}${word[0]}]${word.slice(1)}`).join("\\s+"))
    .join("|");
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
  // "Grange Primary School", "X Sixth Form College", "X Academy". The name is
  // a proper noun, so it must be capitalised: matching any words made "so the
  // college" lose "so the".
  {
    kind: "school",
    re: new RegExp(
      `\\b((?:St\\.?|Saint)\\s+[A-Z][a-z]+(?:['’]s)?|[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\s+(?:${anyCase("high school|secondary school|secondary college|grammar school|primary school|sixth form college|college|academy|free school")})\\b`,
      "g",
    ),
  },
  // Street addresses: number + capitalised street name + street-type word
  // ("12 Maple Road", "34a High St"). Lower-case words made "30 m along the
  // road" and "12 V cells drive" an address and took the data off an answer.
  {
    kind: "address",
    re: new RegExp(
      `\\b\\d{1,4}[a-zA-Z]?\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2}\\s+(?:${anyCase("street|st|road|rd|avenue|ave|lane|ln|drive|dr|close|court|way|gardens|grove|terrace|walk|hill|park")})\\b\\.?`,
      "g",
    ),
  },
  // Person-name introductions: "My name is X", "I am X", "I'm X", "teacher
  // Mr/Mrs/… X". The trigger may open a sentence, so its first letter takes
  // either case; the name itself must be capitalised. An `i` flag here made
  // the name class match any word, so "This is because the…" and "I am
  // confident that…" lost their reasoning words before marking, and the
  // propagation pass below then masked every repeat. A possessive is a law
  // or a scientist ("This is Newton's second law"), not an introduction.
  { kind: "name", re: /\b(?:[Mm]y name is|[Nn]ame['’]s|[Ii] am|[Ii]['’]m|[Tt]his is|[Ww]ritten by|[Ss]igned)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b(?!['’]s\b)/g },
  // Lower-case "ms" (milliseconds) and "miss" are ordinary words in answers.
  { kind: "name", re: /\b(?:[Mm]rs?|[Dd]r|Ms|Miss|Sir|Madam)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g },
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
    // Case-sensitive: a student called Ray or Will must not take every "ray"
    // and "will" out of a physics answer.
    masked = masked.replace(new RegExp(`\\b${escapeRegExp(e.original)}\\b`, "g"), e.placeholder);
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

/**
 * Mask every entry of a chat history, both roles, without mutating the
 * original. "Assistant" turns are sent back by the browser, so they are no
 * more trustworthy than the student's own: a reply can echo the student's
 * name, and a hand-written request can put anything in that role. A name
 * established in any turn ("My name is Anna") is also masked wherever it
 * recurs in the other turns ("Anna, the answer is…").
 */
export function maskChatHistory(history: { role: "user" | "assistant"; content: string }[]): {
  role: "user" | "assistant";
  content: string;
}[] {
  const results = history.map((entry) => maskPii(entry.content));
  const names = new Map<string, string>();
  for (const result of results) {
    for (const e of result.entities) {
      if (e.kind === "name" && !/^entity\d*$/i.test(e.original) && !names.has(e.original)) names.set(e.original, e.placeholder);
    }
  }
  return history.map((entry, index) => {
    let content = results[index]!.masked;
    for (const [original, placeholder] of names) {
      content = content.replace(new RegExp(`\\b${escapeRegExp(original)}\\b`, "g"), placeholder);
    }
    return { role: entry.role, content };
  });
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
