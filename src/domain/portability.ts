import type { Id, IsoInstant, UserSettings } from "./types";
import type { DeckExport } from "./types";
import { exportDeck } from "./deck-io";
import type { Card } from "./types";

// ---------------------------------------------------------------------------
// Data portability, privacy and account controls.
//
// Three promises in one module, all offline-first:
//
//  1. **Portability (GDPR Art. 20)** — export everything in a single JSON
//     snapshot; import is just `parseDeckJson` + `materialiseDeck` per store
//     plus the non-card stores. No server is required; the file never leaves
//     the device unless the user shares it.
//  2. **Deletion (Art. 17) + retention** — purging is an explicit, reversible
//     step in the UI; the helpers here are pure so the UI can show exactly
//     what will disappear before it does.
//  3. **Local-only / private mode** — Revise already runs without an account.
//     `privacyDisclosure` makes that claim auditable, and `shouldRetain`
//     enforces a configurable retention window without a background job.
// ---------------------------------------------------------------------------

export interface PortabilitySnapshot {
  formatVersion: 1;
  exportedAt: IsoInstant;
  app: "revise";
  userId: Id;
  /** Human label for the export file name, not an id. */
  exportedBy?: string;
  cards: DeckExport;
  attemptsCount: number;
  attempts: unknown[];
  reviewLogsCount: number;
  reviewLogs: unknown[];
  mistakesCount: number;
  mistakes: unknown[];
  planSessionsCount: number;
  plannedSessions: unknown[];
  examDatesCount: number;
  examDates: unknown[];
  settings: UserSettings | null;
  streak: unknown | null;
  // Round-trippable: the app's seed content is *not* duplicated into the
  // snapshot (it is reproducible), but the export records its seed version so
  // a restore on a newer app can warn.
  seedVersion: number;
  notes?: string[];
}

export interface PortabilityInput {
  userId: Id;
  displayName?: string;
  cards: Card[];
  attempts: unknown[];
  reviewLogs: unknown[];
  mistakes: unknown[];
  plannedSessions: unknown[];
  examDates: unknown[];
  settings?: UserSettings | null;
  streak?: unknown | null;
  seedVersion?: number;
  now?: Date;
}

export function buildPortabilitySnapshot(input: PortabilityInput): PortabilitySnapshot {
  const at = (input.now ?? new Date()).toISOString();
  return {
    formatVersion: 1,
    exportedAt: at,
    app: "revise",
    userId: input.userId,
    exportedBy: input.displayName,
    cards: exportDeck(input.cards, { name: `Revise export — ${input.userId}`, includeScheduling: true }),
    attemptsCount: input.attempts.length,
    attempts: input.attempts,
    reviewLogsCount: input.reviewLogs.length,
    reviewLogs: input.reviewLogs,
    mistakesCount: input.mistakes.length,
    mistakes: input.mistakes,
    planSessionsCount: input.plannedSessions.length,
    plannedSessions: input.plannedSessions,
    examDatesCount: input.examDates.length,
    examDates: input.examDates,
    settings: input.settings ?? null,
    streak: input.streak ?? null,
    seedVersion: input.seedVersion ?? 1,
    notes: [
      "This is a complete, machine-readable export of your Revise data. Keep it private — it contains every card you authored.",
      "To restore: Settings → Data → Import and choose this file.",
    ],
  };
}

export interface ParsedPortability {
  ok: boolean;
  snapshot: PortabilitySnapshot | null;
  warnings: string[];
  counts: { cards: number; attempts: number; reviewLogs: number; mistakes: number };
}

export function parsePortabilitySnapshot(text: string): ParsedPortability {
  const warnings: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, snapshot: null, warnings: ["Not valid JSON — is this a Revise export?"], counts: { cards: 0, attempts: 0, reviewLogs: 0, mistakes: 0 } };
  }
  const body = raw as Record<string, unknown>;
  if (body.app !== "revise" || body.formatVersion !== 1) {
    return { ok: false, snapshot: null, warnings: ["This does not look like a Revise export (missing app/formatVersion)."], counts: { cards: 0, attempts: 0, reviewLogs: 0, mistakes: 0 } };
  }
  const snap = body as unknown as PortabilitySnapshot;
  if (!Array.isArray(snap.cards?.cards)) warnings.push("Cards deck missing — the rest of the export was read.");
  if (typeof snap.seedVersion !== "number") warnings.push("No seedVersion — restore may behave differently on a newer app.");
  return {
    ok: warnings.length === 0,
    snapshot: snap,
    warnings,
    counts: {
      cards: Array.isArray(snap.cards?.cards) ? snap.cards.cards.length : 0,
      attempts: Array.isArray(snap.attempts) ? snap.attempts.length : 0,
      reviewLogs: Array.isArray(snap.reviewLogs) ? snap.reviewLogs.length : 0,
      mistakes: Array.isArray(snap.mistakes) ? snap.mistakes.length : 0,
    },
  };
}

export function portabilityFilename(userId: Id, at: IsoInstant = new Date().toISOString()): string {
  const date = at.slice(0, 10);
  const safeUser = String(userId).slice(0, 24).replace(/[^a-z0-9._-]/gi, "_");
  return `revise-export-${safeUser}-${date}.json`;
}

// ---------------------------------------------------------------------------
// Privacy disclosure + retention
// ---------------------------------------------------------------------------

export interface RetentionSettings {
  /** Keep server-synced rows this long after last update (days). null = keep forever locally. */
  serverRetentionDays: number | null;
  /** Whether cloud sync is enabled at all. */
  cloudEnabled: boolean;
  /** When true, no card text, question text or raw review logs are queued for upload even if cloudEnabled. */
  localOnly: boolean;
  updatedAt: IsoInstant;
}

export function defaultRetention(now?: Date): RetentionSettings {
  return {
    serverRetentionDays: 365,
    cloudEnabled: false,
    localOnly: true,
    updatedAt: (now ?? new Date()).toISOString(),
  };
}

/**
 * Whether a row should still be retained given retention settings.
 * Compares the row's updatedAt/createdAt against the window; locally-stored
 * rows are never auto-purged unless the user explicitly deletes the account.
 */
export function shouldRetain(
  row: { updatedAt?: IsoInstant; createdAt?: IsoInstant },
  retention: RetentionSettings,
  now: Date = new Date(),
): boolean {
  if (retention.serverRetentionDays == null) return true;
  const stamp = row.updatedAt ?? row.createdAt;
  if (!stamp) return true;
  const ageDays = Math.round((now.getTime() - new Date(stamp).getTime()) / 86_400_000);
  // Local-only mode never expires local rows; expiry only applies to the
  // server replica. The helper still returns true locally so the UI does not
  // hide rows prematurely.
  if (retention.localOnly) return true;
  return ageDays <= retention.serverRetentionDays;
}

/**
 * Plain-English privacy disclosure the Settings page can render verbatim.
 * The text is kept here so tests can assert its claims.
 */
export function privacyDisclosure(cloudEnabled: boolean): string[] {
  if (!cloudEnabled) {
    return [
      "Local-only mode: everything is stored in your browser (IndexedDB) and never sent to a server.",
      "No analytics, no cookies, no account required. Your cards, attempts and review logs leave this device only if you export or share a deck.",
      "Clear site data or use Settings → Data → Delete to remove everything. Nothing can be recovered after that.",
    ];
  }
  return [
    "Cloud sync relays your data to Supabase so it can appear on other devices. The server stores the same rows that live in IndexedDB — it is a replica, not a separate source of truth.",
    "Data is scoped by your user id with row-level security. Use Settings → Data → Export to get a machine-readable copy, or Delete to remove your account's rows locally and on next sync on the server.",
    "You can switch back to local-only at any time — queued changes stay local and nothing new is uploaded.",
  ];
}

// ---------------------------------------------------------------------------
// Deletion — pure preview of what will be removed
// ---------------------------------------------------------------------------

export interface DeletionPreview {
  stores: Array<{ store: string; count: number }>;
  total: number;
  warning: string;
  /** Rows that contain authored content and are worth double-checking. */
  authoredCards: number;
}

export function deletionPreview(counts: { store: string; count: number }[], authoredCards: number): DeletionPreview {
  const total = counts.reduce((a, r) => a + r.count, 0);
  const warning =
    total === 0
      ? "Nothing to delete — this profile has no stored rows."
      : authoredCards > 0
        ? `This will permanently delete ${total} rows including ${authoredCards} authored cards. Export first if you want a backup — nothing can be recovered after this.`
        : `This will permanently delete ${total} rows. Nothing can be recovered after this.`;
  return { stores: counts, total, warning, authoredCards };
}

/** One-line summary for logs / tests. */
export function deletionSummary(preview: DeletionPreview): string {
  if (preview.total === 0) return "No rows to delete.";
  return `Delete ${preview.total} rows (${preview.stores.map((s) => `${s.store}:${s.count}`).join(", ")}).`;
}
