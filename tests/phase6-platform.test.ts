import { describe, expect, it } from "vitest";
import {
  createDraft,
  submitForReview,
  reviewEntry,
  archiveEntry,
  bumpVersion,
  isPublishable,
  moderationQueue,
  moderationStats,
  moderationSummary,
  provenanceBadge,
  checkProvenance,
  entriesWithProvenanceGaps,
} from "@/domain/moderation";
import {
  detectConflict,
  isNewerByTimestamp,
  mergeCardConflict,
  simulateConcurrentWrites,
  collapseOutboxById,
  syncStatusCopy,
} from "@/domain/sync-conflicts";
import {
  buildPortabilitySnapshot,
  parsePortabilitySnapshot,
  portabilityFilename,
  defaultRetention,
  shouldRetain,
  privacyDisclosure,
  deletionPreview,
  deletionSummary,
} from "@/domain/portability";
import { regressionReport, teacherSummaryWithModeration } from "@/domain/content-review";
import type { Card } from "@/domain/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const NOW = new Date("2025-06-10T12:00:00.000Z");
const AT = NOW.toISOString();

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: "c1",
    userId: "u",
    subjectId: "s1",
    topicId: "t1",
    kind: "basic",
    front: "Q",
    back: "A",
    tags: [],
    origin: "manual",
    due: "2025-06-10",
    stability: 5,
    difficulty: 5,
    reps: 2,
    lapses: 0,
    state: 2,
    lastReviewedAt: AT,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  } as Card;
}

// ---------------------------------------------------------------------------
// moderation — lifecycle
// ---------------------------------------------------------------------------
describe("moderation lifecycle", () => {
  it("draft → pending → approved is publishable only when verified", () => {
    const d = createDraft({
      contentKind: "card",
      contentId: "c1",
      subjectId: "s1",
      topicId: "t1",
      authorId: "author",
      provenance: { source: "authored", verification: "checked", specVersion: "2024-1.0", specPointIds: ["t1.sp-01"] },
      now: NOW,
      idFactory: () => "m1",
    });
    expect(d.status).toBe("draft");
    expect(isPublishable(d)).toBe(false);
    const pending = submitForReview(d, "author", NOW);
    expect(pending.status).toBe("pending_review");
    const approved = reviewEntry(pending, "approve", "tutor", { verification: "verified", reviewerName: "Ms Jones", now: NOW });
    expect(approved.status).toBe("approved");
    expect(approved.provenance.verification).toBe("verified");
    expect(isPublishable(approved)).toBe(true);
  });

  it("reject and request_changes transitions", () => {
    const d = createDraft({ contentKind: "question", contentId: "q1", subjectId: "s1", authorId: "a", provenance: { source: "generated", verification: "unverified", specPointIds: ["t1.sp-01"] }, now: NOW, idFactory: () => "m2" });
    const p = submitForReview(d, "a", NOW);
    const rej = reviewEntry(p, "reject", "tutor", { comment: "Not aligned to spec", now: NOW });
    expect(rej.status).toBe("rejected");
    expect(rej.comments[0].kind).toBe("rejection");
    // Can resubmit after reject
    const p2 = submitForReview(rej, "a", NOW);
    expect(p2.status).toBe("pending_review");
    const needs = reviewEntry(p2, "request_changes", "tutor", { comment: "Fix scheme", now: NOW });
    expect(needs.status).toBe("needs_changes");
  });

  it("submit throws from wrong status", () => {
    const d = createDraft({ contentKind: "card", contentId: "c1", subjectId: "s1", authorId: "a", provenance: { source: "authored", verification: "checked" }, now: NOW, idFactory: () => "m3" });
    expect(() => reviewEntry(d, "approve", "tutor", { now: NOW })).toThrow(/Cannot review/);
    const p = submitForReview(d, "a", NOW);
    expect(() => submitForReview(p, "a", NOW)).toThrow(/Cannot submit/);
  });

  it("archive rejects pending_review but allows drafts via bump", () => {
    const draft = createDraft({ contentKind: "card", contentId: "c1", subjectId: "s1", authorId: "a", provenance: { source: "authored", verification: "checked" }, now: NOW, idFactory: () => "m4" });
    const pending = submitForReview(draft, "a", NOW);
    expect(() => archiveEntry(pending, "a", NOW)).toThrow(/Cannot archive/);
    const pendingApp = submitForReview(draft, "a", NOW);
    const app = reviewEntry(pendingApp, "approve", "tutor", { verification: "verified", now: NOW });
    const archived = archiveEntry(app, "tutor", NOW);
    expect(archived.status).toBe("archived");
    expect(archiveEntry(archived, "tutor", NOW).status).toBe("archived");
  });

  it("bumpVersion increments and archives previous", () => {
    const d = createDraft({ contentKind: "card", contentId: "c1", subjectId: "s1", authorId: "a", provenance: { source: "authored", verification: "checked", specVersion: "1" }, now: NOW, idFactory: () => "m5", version: "1" });
    const p = submitForReview(d, "a", NOW);
    const app = reviewEntry(p, "approve", "tutor", { verification: "verified", now: NOW });
    const [archived, draft] = bumpVersion(app, "a", "Fix wording", NOW, () => "m5-v2");
    expect(archived.status).toBe("archived");
    expect(draft.version).toBe("2");
    expect(draft.status).toBe("draft");
    expect(draft.comments[0].text).toBe("Fix wording");
  });

  it("incrementVersion handles dotted versions", () => {
    void ((v: string) => {
      const e = createDraft({ contentKind: "card", contentId: "c1", subjectId: "s1", authorId: "a", provenance: { source: "authored", verification: "checked", specVersion: v }, now: NOW, idFactory: () => `m-${v}`, version: v });
      const [ad] = bumpVersion(e, "a", undefined, NOW, () => `m-${v}-v2`);
      return ad;
    });
    // numeric
    const [a1, d1] = bumpVersion(
      createDraft({ contentKind: "card", contentId: "c1", subjectId: "s1", authorId: "a", provenance: { source: "authored", verification: "checked" }, now: NOW, idFactory: () => "m-v1", version: "3" }),
      "a",
      undefined,
      NOW,
      () => "m-v1-next",
    );
    void a1;
    expect(d1.version).toBe("4");
    // dotted date
    const [a2, d2] = bumpVersion(
      createDraft({ contentKind: "card", contentId: "c1", subjectId: "s1", authorId: "a", provenance: { source: "authored", verification: "checked" }, now: NOW, idFactory: () => "m-v2", version: "2024-1.0" }),
      "a",
      undefined,
      NOW,
      () => "m-v2-next",
    );
    void a2;
    expect(d2.version).toBe("2024-1.1");
  });
});

describe("moderation queries", () => {
  it("moderationQueue filters and orders oldest-first", () => {
    const a = createDraft({ contentKind: "card", contentId: "c1", subjectId: "s1", authorId: "a", provenance: { source: "authored", verification: "checked" }, now: new Date("2025-06-08T10:00:00.000Z"), idFactory: () => "mq1" });
    const b = createDraft({ contentKind: "card", contentId: "c2", subjectId: "s1", authorId: "a", provenance: { source: "authored", verification: "checked" }, now: new Date("2025-06-09T10:00:00.000Z"), idFactory: () => "mq2" });
    const pa = submitForReview(a, "a", new Date("2025-06-08T11:00:00.000Z"));
    const pb = submitForReview(b, "a", new Date("2025-06-09T11:00:00.000Z"));
    const q = moderationQueue([pb, pa], "pending_review");
    expect(q[0].id).toBe("mq1"); // oldest first
    expect(moderationQueue([pa, pb], "pending_review", "s1")).toHaveLength(2);
    expect(moderationQueue([pa, pb], "pending_review", "other-subject")).toHaveLength(0);
  });

  it("moderationStats is internally consistent", () => {
    const d = createDraft({ contentKind: "card", contentId: "c1", subjectId: "s1", authorId: "a", provenance: { source: "authored", verification: "verified", specPointIds: ["t1.sp-01"], specVersion: "2024-1.0", lastChecked: "2025-06-09" }, now: NOW, idFactory: () => "ms1" });
    const p = submitForReview(d, "a", NOW);
    const app = reviewEntry(p, "approve", "tutor", { verification: "verified", now: NOW });
    const stats = moderationStats([d, app]);
    expect(stats.draft).toBe(1);
    expect(stats.approved).toBe(1);
    expect(stats.publishable).toBe(1);
  });

  it("moderationSummarycopy is human", () => {
    expect(moderationSummary([])).toContain("No items");
    const d = createDraft({ contentKind: "card", contentId: "c1", subjectId: "s1", authorId: "a", provenance: { source: "authored", verification: "checked" }, now: NOW, idFactory: () => "ms2" });
    const p = submitForReview(d, "a", NOW);
    expect(moderationSummary([p])).toContain("awaiting review");
  });

  it("provenanceBadge is non-empty", () => {
    const e = createDraft({ contentKind: "card", contentId: "c1", subjectId: "s1", authorId: "a", provenance: { source: "authored", verification: "verified", specVersion: "2024-1.0", reviewer: "Ms Jones", lastChecked: "2025-06-09", specPointIds: ["t1.sp-01"] }, now: NOW, idFactory: () => "mb1" });
    const badge = provenanceBadge(e);
    expect(badge).toContain("authored");
    expect(badge).toContain("verified");
  });

  it("checkProvenance catches gaps", () => {
    const gaps = createDraft({ contentKind: "question", contentId: "q1", subjectId: "s1", authorId: "a", provenance: { source: "generated", verification: "checked" }, now: NOW, idFactory: () => "pg1" });
    const c = checkProvenance(gaps);
    expect(c.ok).toBe(false);
    expect(c.issues.join(" ")).toContain("specPointIds");
    expect(c.issues.join(" ")).toContain("specVersion");
    const good = createDraft({ contentKind: "card", contentId: "c1", subjectId: "s1", authorId: "a", provenance: { source: "authored", verification: "verified", specVersion: "2024-1.0", lastChecked: "2025-06-09", specPointIds: ["t1.sp-01"] }, now: NOW, idFactory: () => "pg2" });
    expect(checkProvenance(good).ok).toBe(true);
    expect(entriesWithProvenanceGaps([gaps, good])).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// sync-conflicts
// ---------------------------------------------------------------------------
describe("sync conflicts", () => {
  type Row = { id: string; userId?: string; updatedAt: string; due: string; front?: string };

  it("isNewerByTimestamp orders by updatedAt, tie is true", () => {
    expect(isNewerByTimestamp({ updatedAt: "2025-06-02T11:00:00Z" } as never, { updatedAt: "2025-06-02T10:00:00Z" } as never)).toBe(true);
    expect(isNewerByTimestamp({ updatedAt: "2025-06-02T11:00:00Z" } as never, { updatedAt: "2025-06-02T11:00:00Z" } as never)).toBe(true);
  });

  it("detectConflict returns null when only one side changed vs baseline", () => {
    const baseline: Row = { id: "x", updatedAt: "2025-06-01T00:00:00Z", due: "2025-06-03" } as Row;
    const local: Row = { id: "x", updatedAt: "2025-06-02T10:00:00Z", due: "2025-06-03" } as Row;
    const remote: Row = { id: "x", updatedAt: "2025-06-01T00:00:00Z", due: "2025-06-03" } as Row; // unchanged vs baseline
    expect(detectConflict(baseline, local, remote)).toBeNull();
  });

  it("detectConflict returns null for identical rows", () => {
    const a: Row = { id: "x", updatedAt: "2025-06-02T10:00:00Z", due: "2025-06-04" } as Row;
    expect(detectConflict(null, a, { ...a })).toBeNull();
  });

  it("detectConflict detects tie deterministically (remote wins)", () => {
    const local: Row = { id: "x", updatedAt: "2025-06-02T10:00:00Z", due: "2025-06-03" } as Row;
    const remote: Row = { id: "x", updatedAt: "2025-06-02T10:00:00Z", due: "2025-06-05" } as Row;
    const c = detectConflict(null, local, remote);
    expect(c).not.toBeNull();
    expect(c!.newer).toBe("tie");
    expect(c!.winner).toBe(remote);
    expect(c!.explanation).toContain("same second");
  });

  it("detectConflict picks local when local is newer", () => {
    const local: Row = { id: "x", updatedAt: "2025-06-02T11:00:00Z", due: "2025-06-04" } as Row;
    const remote: Row = { id: "x", updatedAt: "2025-06-02T10:00:00Z", due: "2025-06-05" } as Row;
    const c = detectConflict(null, local, remote);
    expect(c!.newer).toBe("local");
    expect(c!.winner).toBe(local);
  });

  it("mergeCardConflict preserves FSRS of winner and notes content divergence", () => {
    const local = card({ id: "c1", front: "Local front", due: "2025-06-04", updatedAt: "2025-06-02T10:00:00.000Z" } as never);
    const remote = card({ id: "c1", front: "Remote front", due: "2025-06-05", updatedAt: "2025-06-02T11:00:00.000Z" } as never);
    const merged = mergeCardConflict(local, remote);
    // Remote wins (later) so due is remote's, but a conflictNote is produced because front differed
    expect(merged.due).toBe("2025-06-05");
    expect((merged as unknown as Record<string, unknown>).conflictNote as string).toContain("front");
  });

  it("mergeCardConflict with matching content returns winner without note", () => {
    const local = card({ id: "c1", due: "2025-06-04", updatedAt: "2025-06-02T10:00:00.000Z" } as never);
    const remote = card({ id: "c1", due: "2025-06-05", updatedAt: "2025-06-02T11:00:00.000Z" } as never);
    const merged = mergeCardConflict(local, remote);
    expect(((merged as unknown as Record<string, unknown>).conflictNote as string | undefined)).toBeUndefined();
  });

  it("simulateConcurrentWrites latest wins; history is deterministic", () => {
    const baseline = { id: "x", updatedAt: "2025-06-01T00:00:00.000Z", due: "2025-06-03" } as never;
    const r1 = simulateConcurrentWrites(baseline, [
      { label: "phone", mutate: (r) => ({ due: "2025-06-04" }) as never, offsetMs: 10_000 },
      { label: "laptop", mutate: (r) => ({ due: "2025-06-06" }) as never, offsetMs: 20_000 },
      { label: "tablet", mutate: (r) => ({ due: "2025-06-05" }) as never, offsetMs: 5_000 },
    ]);
    expect((r1.winner as Row).due).toBe("2025-06-06"); // laptop latest
    expect(r1.history[0].label).toBe("laptop");
    // Run again: same determinism
    const r2 = simulateConcurrentWrites(baseline, [
      { label: "phone", mutate: (r) => ({ due: "2025-06-04" }) as never, offsetMs: 10_000 },
      { label: "laptop", mutate: (r) => ({ due: "2025-06-06" }) as never, offsetMs: 20_000 },
      { label: "tablet", mutate: (r) => ({ due: "2025-06-05" }) as never, offsetMs: 5_000 },
    ]);
    expect((r2.winner as Row).due).toBe((r1.winner as Row).due);
  });

  it("collapseOutboxById keeps last queued per id", () => {
    const items = [
      { id: "c1", payload: { id: "c1", front: "v1" } as never, queuedAt: "2025-06-01T10:00:00.000Z" },
      { id: "c1", payload: { id: "c1", front: "v2" } as never, queuedAt: "2025-06-01T11:00:00.000Z" },
      { id: "c2", payload: { id: "c2", front: "x" } as never, queuedAt: "2025-06-01T10:30:00.000Z" },
    ];
    const collapsed = collapseOutboxById(items);
    expect(collapsed.size).toBe(2);
    expect(collapsed.get("c1")).toMatchObject({ front: "v2" });
  });

  it("syncStatusCopy renders all cases", () => {
    expect(syncStatusCopy({ pending: 3 })).toContain("3 changes queued");
    expect(syncStatusCopy({ pending: 1 })).toContain("1 change queued");
    expect(syncStatusCopy({ pending: 0, lastError: "network gone" })).toContain("Sync paused");
    expect(syncStatusCopy({ pending: 0 })).toContain("Working offline");
  });
});

// ---------------------------------------------------------------------------
// portability / privacy
// ---------------------------------------------------------------------------
describe("portability", () => {
  it("builds and parses a round-trippable snapshot", () => {
    const cards: Card[] = [card({ id: "c1" }), card({ id: "c2", front: "Q2", back: "A2" })];
    const snap = buildPortabilitySnapshot({
      userId: "u1",
      displayName: "Alice",
      cards,
      attempts: [{ id: "a1" }],
      reviewLogs: [{ id: "rl1" }],
      mistakes: [],
      plannedSessions: [],
      examDates: [],
      settings: null,
      streak: null,
      seedVersion: 1,
      now: NOW,
    });
    expect(snap.formatVersion).toBe(1);
    expect(snap.cards.cards.length).toBe(2);
    expect(snap.attemptsCount).toBe(1);
    const text = JSON.stringify(snap);
    const parsed = parsePortabilitySnapshot(text);
    expect(parsed.snapshot).not.toBeNull();
    expect(parsed.ok).toBe(true);
    expect(parsed.counts.cards).toBe(2);
  });

  it("parsePortabilitySnapshot rejects bad JSON / non-revise", () => {
    expect(parsePortabilitySnapshot("not json").ok).toBe(false);
    expect(parsePortabilitySnapshot(JSON.stringify({ app: "other", formatVersion: 1 })).ok).toBe(false);
  });

  it("portabilityFilename is safe", () => {
    const name = portabilityFilename("user/with spaces@example.com", AT);
    expect(name).toContain("revise-export-");
    expect(name).toContain("2025-06-10");
    expect(name.endsWith(".json")).toBe(true);
    expect(name.includes("/")).toBe(false);
  });

  it("shouldRetain obeys retentionDays and localOnly", () => {
    const r365 = { ...defaultRetention(NOW), serverRetentionDays: 30, cloudEnabled: true, localOnly: false };
    const recent = { updatedAt: "2025-06-09T10:00:00.000Z" as const };
    const old = { updatedAt: "2025-05-01T10:00:00.000Z" as const };
    expect(shouldRetain(recent, r365, NOW)).toBe(true);
    expect(shouldRetain(old, r365, NOW)).toBe(false);
    // localOnly never purges locally
    const local = { ...r365, localOnly: true };
    expect(shouldRetain(old, local, NOW)).toBe(true);
    // null retention never purges
    expect(shouldRetain(old, { ...r365, serverRetentionDays: null }, NOW)).toBe(true);
  });

  it("privacyDisclosure branches on cloudEnabled", () => {
    expect(privacyDisclosure(false).join(" ")).toContain("Local-only");
    expect(privacyDisclosure(true).join(" ")).toContain("Supabase");
  });

  it("deletionPreview warns with and without authored content", () => {
    const withAuthored = deletionPreview([{ store: "cards", count: 10 }, { store: "attempts", count: 2 }], 5);
    expect(withAuthored.total).toBe(12);
    expect(withAuthored.warning).toContain("5 authored");
    expect(deletionSummary(withAuthored)).toContain("Delete 12");
    const empty = deletionPreview([], 0);
    expect(empty.warning).toContain("Nothing to delete");
    expect(deletionSummary(empty)).toContain("No rows");
  });
});

describe("teacherSummaryWithModeration", () => {
  it("includes moderation line when entries present", () => {
    // Minimal: use an empty moderation mix — no provenance gaps
    const lines = teacherSummaryWithModeration({
      subjectLabel: "Maths",
      coverage: { statementCoverage: 80, examQuestions: 12 } as never,
      report: { flags: [], staleCount: 0, unmappedQuestions: [], thinTopics: [], ok: true },
      moderationEntries: [
        createDraft({ contentKind: "card", contentId: "c1", subjectId: "s1", authorId: "a", provenance: { source: "authored", verification: "verified", specVersion: "2024-1.0", lastChecked: "2025-06-09", specPointIds: ["t1.sp-01"] }, now: NOW, idFactory: () => "tm1" }),
      ],
    });
    expect(lines.join(" ").toLowerCase()).toContain("moderation");
  });

  it("omits moderation line when no entries", () => {
    const lines = teacherSummaryWithModeration({
      subjectLabel: "Maths",
      coverage: { statementCoverage: 80, examQuestions: 12 } as never,
      report: { flags: [], staleCount: 0, unmappedQuestions: [], thinTopics: [], ok: true },
    });
    expect(lines.join(" ")).not.toContain("Moderation");
  });
});

describe("teacher regressionReport integration", () => {
  it("still flags unverified and missing mappings", () => {
    const report = regressionReport({
      topics: [{ id: "t1", title: "Gaps", subjectId: "s1", unitId: "u1", order: 0, intrinsicDifficulty: 3, summary: "s", keyPoints: ["k"], commonErrors: ["e"], specPoints: [], aos: [], verification: "unverified", source: "authored" } as never],
      questions: [{ id: "q1", subjectId: "s1", topicIds: ["unknown"], kind: "short", stem: "?", parts: [{ id: "p1", label: "a", prompt: "x", marks: 2, markScheme: ["point"], modelAnswer: "a" }], totalMarks: 2, calculatorAllowed: false, difficulty: 3, origin: "seed", createdAt: AT }],
      today: "2025-06-10",
    } as never);
    expect(report.flags.some((f) => f.kind === "unverified")).toBe(true);
    expect(report.flags.some((f) => f.kind === "no-specPoints")).toBe(true);
  });
});
