import { exportDeck } from "./deck-io";
import type { Card, DeckExport } from "./types";

// ---------------------------------------------------------------------------
// Sharing a deck.
//
// There is no server to upload to — the app is local-first and works with no
// account — so a shared deck travels in one of two ways:
//
// * as a **link** whose fragment carries the deck itself. The fragment is
//   never sent to any server by the browser, so a deck shared this way stays
//   between the two people sharing it. Links have a hard size limit, so this
//   is for small decks only and the UI says so.
// * as a **file**, via the Web Share API on a phone or a plain download
//   everywhere else. No size limit, no third party.
//
// Shared decks always drop scheduling: see deck-io.
// ---------------------------------------------------------------------------

/** Comfortably inside what browsers, iMessage and WhatsApp will carry. */
export const MAX_LINK_BYTES = 8000;

/**
 * A compact wire form. Long JSON keys would eat a third of the link budget,
 * so shared decks use one-letter keys — this is a transport encoding, not a
 * storage format, and it never touches the domain model.
 */
interface WireCard {
  f: string;
  b: string;
  t?: string[];
  k?: string;
}

interface WireDeck {
  v: 1;
  n: string;
  d?: string;
  c: WireCard[];
}

export function encodeDeckForLink(deck: DeckExport): string {
  const wire: WireDeck = {
    v: 1,
    n: deck.name.slice(0, 80),
    d: deck.description?.slice(0, 200),
    c: deck.cards.map((card) => ({
      f: card.front,
      b: card.back,
      ...(card.tags.length ? { t: card.tags } : {}),
      ...(card.kind !== "basic" ? { k: card.kind } : {}),
    })),
  };
  return toBase64Url(JSON.stringify(wire));
}

export function decodeDeckFromLink(encoded: string): DeckExport | null {
  try {
    const wire = JSON.parse(fromBase64Url(encoded)) as WireDeck;
    if (wire?.v !== 1 || !Array.isArray(wire.c) || !wire.c.length) return null;
    return {
      formatVersion: 1,
      name: String(wire.n ?? "Shared deck").slice(0, 120),
      description: wire.d ? String(wire.d).slice(0, 500) : undefined,
      exportedAt: new Date().toISOString(),
      source: "shared-link",
      cards: wire.c
        .filter((card) => typeof card?.f === "string" && typeof card?.b === "string")
        .map((card) => ({
          front: String(card.f).slice(0, 4000),
          back: String(card.b).slice(0, 4000),
          kind: (card.k as DeckExport["cards"][number]["kind"]) ?? "basic",
          tags: Array.isArray(card.t) ? card.t.map(String).slice(0, 10) : [],
        })),
    };
  } catch {
    return null;
  }
}

export interface ShareLink {
  url: string;
  bytes: number;
  /** False when the deck is too big to travel in a URL. */
  withinLimit: boolean;
  cardsIncluded: number;
}

/**
 * Build a share link, trimming to whatever fits rather than failing outright —
 * a partial deck plus an honest count beats a dead end.
 */
export function buildShareLink(cards: Card[], name: string, origin: string): ShareLink {
  let included = cards;
  let encoded = encodeDeckForLink(exportDeck(included, { name, includeScheduling: false }));

  while (encoded.length > MAX_LINK_BYTES && included.length > 1) {
    // Halve rather than step down one at a time: encoding is the expensive
    // part and a 500-card deck would otherwise re-encode hundreds of times.
    included = included.slice(0, Math.floor(included.length / 2));
    encoded = encodeDeckForLink(exportDeck(included, { name, includeScheduling: false }));
  }

  return {
    url: `${origin.replace(/\/$/, "")}/shared#${encoded}`,
    bytes: encoded.length,
    withinLimit: encoded.length <= MAX_LINK_BYTES,
    cardsIncluded: included.length,
  };
}

/** Base64url, unicode-safe — card text is full of °, ⇌, α and −. */
export function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  // Chunked: String.fromCharCode(...bytes) blows the call stack on a big deck.
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
