import type { ContentSource, Id, IsoDate, IsoInstant, LicensedSource, VerificationStatus } from "./types";
import type { ReviewFlag } from "./content-review";

// ---------------------------------------------------------------------------
// Moderation workflow — teacher / tutor review with versioned provenance.
//
// Every generated or authored item lives through:
//   draft → pending_review → approved | rejected | needs_changes
//         ↘ archived (superseded by a newer version)
//
// The workflow is pure and offline. It never touches storage; the repository
// persists the entries the UI creates. Three invariants are enforced:
//   1. Nothing is publishable unless status=approved and verification=verified.
//   2. Every version carries its full provenance (source, specVersion, reviewer,
//      lastChecked, licensedSource when licensed) so the audit trail survives.
//   3. Versions are monotonic; bumping always creates a new entry, never mutates
//      the old one in place, and the old one becomes archived.
// ---------------------------------------------------------------------------

export type ContentKind = "topic" | "question" | "card" | "paper";
export type ModerationStatus = "draft" | "pending_review" | "approved" | "rejected" | "needs_changes" | "archived";

export interface ModerationComment {
  authorId: Id;
  at: IsoInstant;
  text: string;
  kind: "note" | "request_changes" | "approval" | "rejection";
}

export interface ModerationProvenance {
  source: ContentSource;
  licensedSource?: LicensedSource | null;
  specVersion?: string;
  verification: VerificationStatus;
  reviewer?: string | null;
  lastChecked?: IsoDate | null;
  specPointIds?: Id[];
}

export interface ModerationEntry {
  id: Id;
  contentKind: ContentKind;
  contentId: Id;
  subjectId: Id;
  topicId?: Id;
  version: string; // semver-ish "1" or "2024-1.0" — opaque, monotonic by createdAt ordering
  status: ModerationStatus;
  authorId: Id;
  reviewerId?: Id;
  provenance: ModerationProvenance;
  flags: ReviewFlag[];
  comments: ModerationComment[];
  history: Array<{ from: ModerationStatus; to: ModerationStatus; at: IsoInstant; by: Id; note?: string }>;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
  submittedAt?: IsoInstant;
  reviewedAt?: IsoInstant;
}

export interface ModerationInput {
  id?: Id;
  contentKind: ContentKind;
  contentId: Id;
  subjectId: Id;
  topicId?: Id;
  version?: string;
  authorId: Id;
  provenance: ModerationProvenance;
  flags?: ReviewFlag[];
  now?: Date;
  idFactory?: () => string;
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

function nowIso(now?: Date): IsoInstant {
  return (now ?? new Date()).toISOString();
}

function nextId(factory?: () => string): string {
  return factory ? factory() : crypto.randomUUID();
}

/** Create a new draft. Caller may supply version; otherwise "1". */
export function createDraft(input: ModerationInput): ModerationEntry {
  const at = nowIso(input.now);
  return {
    id: input.id ?? nextId(input.idFactory),
    contentKind: input.contentKind,
    contentId: input.contentId,
    subjectId: input.subjectId,
    topicId: input.topicId,
    version: input.version ?? "1",
    status: "draft",
    authorId: input.authorId,
    provenance: input.provenance,
    flags: input.flags ?? [],
    comments: [],
    history: [],
    createdAt: at,
    updatedAt: at,
  };
}

/** draft | needs_changes | rejected → pending_review */
export function submitForReview(
  entry: ModerationEntry,
  actorId: Id,
  now?: Date,
): ModerationEntry {
  if (!["draft", "needs_changes", "rejected"].includes(entry.status)) {
    throw new Error(`Cannot submit from status ${entry.status}`);
  }
  const at = nowIso(now);
  return {
    ...entry,
    status: "pending_review",
    submittedAt: at,
    updatedAt: at,
    history: [...entry.history, { from: entry.status, to: "pending_review" as const, at, by: actorId }],
  };
}

export type ReviewDecision = "approve" | "reject" | "request_changes";

/** pending_review → approved | rejected | needs_changes */
export function reviewEntry(
  entry: ModerationEntry,
  decision: ReviewDecision,
  reviewerId: Id,
  opts: { comment?: string; verification?: VerificationStatus; reviewerName?: string; now?: Date } = {},
): ModerationEntry {
  if (entry.status !== "pending_review") {
    throw new Error(`Cannot review from status ${entry.status}`);
  }
  const at = nowIso(opts.now);
  const to: ModerationStatus =
    decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "needs_changes";
  const kind: ModerationComment["kind"] =
    decision === "approve" ? "approval" : decision === "reject" ? "rejection" : "request_changes";
  const comment: ModerationComment | null = opts.comment
    ? { authorId: reviewerId, at, text: opts.comment.slice(0, 2000), kind }
    : decision === "approve"
      ? null
      : { authorId: reviewerId, at, text: decision === "reject" ? "Rejected." : "Changes requested.", kind };

  const provenance: ModerationProvenance =
    decision === "approve" && opts.verification
      ? {
          ...entry.provenance,
          verification: opts.verification,
          reviewer: opts.reviewerName ?? reviewerId,
          lastChecked: at.slice(0, 10),
        }
      : entry.provenance;

  return {
    ...entry,
    status: to,
    reviewerId,
    provenance,
    reviewedAt: at,
    updatedAt: at,
    comments: comment ? [...entry.comments, comment] : entry.comments,
    history: [...entry.history, { from: entry.status, to, at, by: reviewerId, note: opts.comment }],
  };
}

/** Archive a superseded entry (approved → archived). Never called on drafts. */
export function archiveEntry(entry: ModerationEntry, actorId: Id, now?: Date): ModerationEntry {
  if (entry.status === "archived") return entry;
  // Archiving a rejected/needs_changes/draft during a bump is allowed — bumpVersion
  // supersedes the entry. Only archiving a pending_review (still live) is forbidden.
  if (entry.status === "pending_review") {
    throw new Error(`Cannot archive from status ${entry.status}`);
  }
  const at = nowIso(now);
  return {
    ...entry,
    status: "archived",
    updatedAt: at,
    history: [...entry.history, { from: entry.status, to: "archived", at, by: actorId }],
  };
}

/**
 * Bump to a new version: clones the entry as a fresh draft with version+1,
 * archives the previous one. The returned tuple is [archivedPrevious, newDraft].
 * Version string handling: if numeric, increment; if "2024-1.0", bump patch;
 * otherwise append ".1".
 */
export function bumpVersion(
  entry: ModerationEntry,
  authorId: Id,
  changeSummary?: string,
  now?: Date,
  idFactory?: () => string,
): [ModerationEntry, ModerationEntry] {
  const at = nowIso(now);
  // Bumping from draft is the normal correction flow — don't force approval.
  const archived =
    entry.status === "draft" ? { ...entry, status: "archived" as const, updatedAt: at, history: [...entry.history, { from: entry.status as ModerationStatus, to: "archived" as const, at, by: authorId }] } : archiveEntry(entry, authorId, now);
  const nextVersion = incrementVersion(entry.version);
  const draft: ModerationEntry = {
    id: nextId(idFactory),
    contentKind: entry.contentKind,
    contentId: entry.contentId,
    subjectId: entry.subjectId,
    topicId: entry.topicId,
    version: nextVersion,
    status: "draft",
    authorId,
    provenance: { ...entry.provenance },
    flags: [],
    comments: changeSummary
      ? [{ authorId, at, text: changeSummary.slice(0, 2000), kind: "note" as const }]
      : [],
    history: [{ from: "archived" as ModerationStatus, to: "draft", at, by: authorId, note: changeSummary }],
    createdAt: at,
    updatedAt: at,
  };
  return [archived, draft];
}

function incrementVersion(v: string): string {
  // "3" -> "4"
  if (/^\d+$/.test(v)) return String(Number(v) + 1);
  // "2024-1.0" -> "2024-1.1", "1.2.9" -> "1.2.10"
  const m = v.match(/^(.*?)(\d+)$/);
  if (m) return `${m[1]}${Number(m[2]) + 1}`;
  return `${v}.1`;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function isPublishable(entry: ModerationEntry): boolean {
  return entry.status === "approved" && entry.provenance.verification === "verified";
}

export function moderationQueue(
  entries: ModerationEntry[],
  status: ModerationStatus | "all" = "pending_review",
  subjectId?: Id,
): ModerationEntry[] {
  let out = entries;
  if (status !== "all") out = out.filter((e) => e.status === status);
  if (subjectId) out = out.filter((e) => e.subjectId === subjectId);
  // Oldest pending first so nothing starves
  return [...out].sort((a, b) => (a.submittedAt ?? a.createdAt).localeCompare(b.submittedAt ?? b.createdAt));
}

export function moderationStats(entries: ModerationEntry[]): Record<ModerationStatus, number> & { publishable: number; flagged: number } {
  const base: Record<ModerationStatus, number> = {
    draft: 0,
    pending_review: 0,
    approved: 0,
    rejected: 0,
    needs_changes: 0,
    archived: 0,
  };
  for (const e of entries) base[e.status] = (base[e.status] ?? 0) + 1;
  return {
    ...base,
    publishable: entries.filter(isPublishable).length,
    flagged: entries.filter((e) => e.flags.length > 0).length,
  };
}

/** Human summary for the teacher review panel header. */
export function moderationSummary(entries: ModerationEntry[]): string {
  const s = moderationStats(entries);
  if (!entries.length) return "No items in moderation — generate or import content to start a review.";
  if (s.pending_review === 0 && s.draft === 0) return `All caught up — ${s.publishable} publishable of ${entries.length} total.`;
  return `${s.pending_review} awaiting review, ${s.draft} drafts, ${s.needs_changes} need changes — ${s.publishable} publishable.`;
}

/** One-line provenance string for the UI badge: "authored • verified • 2024-1.0 • WJEC/2024-v1" */
export function provenanceBadge(entry: ModerationEntry): string {
  const p = entry.provenance;
  const parts: string[] = [];
  parts.push(p.source);
  parts.push(p.verification);
  if (p.specVersion) parts.push(p.specVersion);
  if (p.reviewer) parts.push(p.reviewer);
  if (p.lastChecked) parts.push(p.lastChecked);
  if (p.source === "licensed" && p.licensedSource?.citation) parts.push(truncate(p.licensedSource.citation, 40));
  return parts.join(" • ");
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ---------------------------------------------------------------------------
// Provenance validation — every publishable item must have the expected fields
// ---------------------------------------------------------------------------

export interface ProvenanceCheck {
  ok: boolean;
  issues: string[];
}

/** Validate that an entry's provenance is complete enough to be publishable. */
export function checkProvenance(entry: ModerationEntry): ProvenanceCheck {
  const issues: string[] = [];
  const p = entry.provenance;
  if (!p.source) issues.push("Missing source (authored/licensed/generated).");
  if (p.source === "licensed" && !p.licensedSource?.citation) issues.push("Licensed items must cite the source.");
  if (!p.specVersion) issues.push("Missing specVersion — which syllabus version was this checked against?");
  if (p.verification !== "verified") issues.push(`Verification is ${p.verification}, not verified.`);
  if (!p.lastChecked) issues.push("Missing lastChecked date.");
  if ((entry.contentKind === "question" || entry.contentKind === "card") && !p.specPointIds?.length) {
    issues.push("Missing specPointIds — link to the statement(s) this item tests.");
  }
  return { ok: issues.length === 0, issues };
}

/** Filter entries that fail provenance so the review queue can surface them first. */
export function entriesWithProvenanceGaps(entries: ModerationEntry[]): Array<{ entry: ModerationEntry; check: ProvenanceCheck }> {
  const out: Array<{ entry: ModerationEntry; check: ProvenanceCheck }> = [];
  for (const e of entries) {
    const c = checkProvenance(e);
    if (!c.ok) out.push({ entry: e, check: c });
  }
  return out;
}
