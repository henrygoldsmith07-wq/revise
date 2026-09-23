// ---------------------------------------------------------------------------
// Editorial review pipeline — the trust chain between Revise and a revision
// publisher.
//
//   Draft → Structural validation → Subject review → Mark-scheme review →
//   Exam-style review → Verified → Published → (periodic re-review)
//
// Every transition is an APPENDED record: who reviewed, when, what they
// decided. Stages cannot be skipped; a human reviewer may never review their
// own authorship; failing any review returns the item to Draft; retiring
// requires a stated reason; published items come back for re-review on a
// fixed clock; a major user-reported issue pulls published content out of the
// published set until the subject stage re-passes it.
//
// editorialConfidence() distils the whole chain into one 0..1 number and a
// tier, so the UI can visibly separate "Verified" from "Generated /
// unreviewed". Pure domain throughout.
// ---------------------------------------------------------------------------

import type { ContentSource, Id, IsoInstant } from "./types";

export const EDITORIAL_STAGES = [
  "draft",
  "structural",
  "subject",
  "mark_scheme",
  "exam_style",
  "verified",
  "published",
] as const;

export type EditorialStage =
  | (typeof EDITORIAL_STAGES)[number]
  | "rejected"
  | "retired";

export type ReviewerRole = "author" | "subject_reviewer" | "mark_scheme_reviewer" | "exam_style_reviewer" | "editor";

export interface StageRecord {
  /** The gate/decision this record represents, including terminal decisions. */
  stage: EditorialStage;
  decision: "pass" | "fail" | "publish" | "retire";
  reviewerId: Id;
  reviewerRole: ReviewerRole;
  at: IsoInstant;
  notes?: string;
}

export interface UserIssue {
  id: Id;
  reportedBy: string | null;
  text: string;
  severity: "minor" | "major";
  at: IsoInstant;
  resolvedAt: IsoInstant | null;
}

export interface Retirement {
  reason: string;
  at: IsoInstant;
  by: Id;
}

export interface EditorialRecord {
  contentKind: "question" | "card" | "topic";
  contentId: Id;
  authorId: Id;
  source: ContentSource;
  specVersion: string;
  stage: EditorialStage;
  /** Append-only: every transition ever made, oldest first. */
  history: StageRecord[];
  issues: UserIssue[];
  retirement: Retirement | null;
  reReviewIntervalDays: number;
  lastPublishedAt: IsoInstant | null;
  reReviewCount: number;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

/** The next stage a record must pass before it can move forward. */
const FORWARD_CHAIN: EditorialStage[] = [
  "draft",
  "structural",
  "subject",
  "mark_scheme",
  "exam_style",
  "verified",
  "published",
];

const HUMAN_STAGES = new Set(["subject", "mark_scheme", "exam_style"]);

function nowIso(now?: Date): IsoInstant {
  return (now ?? new Date()).toISOString();
}

export function createEditorialRecord(input: {
  contentKind: EditorialRecord["contentKind"];
  contentId: Id;
  authorId: Id;
  source: ContentSource;
  specVersion: string;
  now?: Date;
  reReviewIntervalDays?: number;
}): EditorialRecord {
  const at = nowIso(input.now);
  return {
    contentKind: input.contentKind,
    contentId: input.contentId,
    authorId: input.authorId,
    source: input.source,
    specVersion: input.specVersion,
    stage: "draft",
    history: [],
    issues: [],
    retirement: null,
    reReviewIntervalDays: input.reReviewIntervalDays ?? 180,
    lastPublishedAt: null,
    reReviewCount: 0,
    createdAt: at,
    updatedAt: at,
  };
}

/**
 * Advance one stage. Enforces:
 *   * exact forward order (no skipping);
 *   * human stages require a reviewer who is not the author;
 *   * a failed review returns the item to Draft (history keeps everything);
 *   * publish only from verified; retire only with a stated reason.
 */
export function advanceStage(
  record: EditorialRecord,
  input: {
    /** The PENDING gate being decided - must match record.stage exactly. */
    target: Extract<EditorialStage, "draft" | "structural" | "subject" | "mark_scheme" | "exam_style" | "verified">;
    decision: "pass" | "fail";
    reviewerId: Id;
    reviewerRole: ReviewerRole;
    notes?: string;
    now?: Date;
  },
): EditorialRecord {
  const at = nowIso(input.now);
  if (record.stage === "rejected" || record.stage === "retired") {
    throw new Error("Terminal records cannot advance.");
  }
  // A freshly drafted record sits at the structural-validation gate.
  const pendingGate = record.stage === "draft" ? "structural" : record.stage;
  if (input.target !== pendingGate) {
    throw new Error(
      `Out-of-order transition: the pending gate is "${pendingGate}", got "${input.target}".`,
    );
  }
  if (input.decision === "pass" && HUMAN_STAGES.has(input.target) && input.reviewerId === record.authorId) {
    throw new Error("A human review stage cannot be passed by the author.");
  }

  const entry: StageRecord = {
    stage: input.target,
    decision: input.decision,
    reviewerId: input.reviewerId,
    reviewerRole: input.reviewerRole,
    at,
    ...(input.notes ? { notes: input.notes } : {}),
  };

  if (input.decision === "fail") {
    return { ...record, stage: "draft", history: [...record.history, entry], updatedAt: at };
  }

  // Stage names the PENDING gate: passing subject review means the record
  // now sits at mark-scheme review. Verified is held until publish() runs.
  const idx = FORWARD_CHAIN.indexOf(input.target);
  const nextGate = input.target === "verified" ? "verified" : FORWARD_CHAIN[Math.min(idx + 1, FORWARD_CHAIN.length - 1)];
  return { ...record, stage: nextGate, history: [...record.history, entry], updatedAt: at };
}

/** Publish a verified record. */
export function publish(record: EditorialRecord, editorId: Id, now?: Date): EditorialRecord {
  if (record.stage !== "verified") {
    throw new Error(`Only verified records can be published (currently "${record.stage}").`);
  }
  const at = nowIso(now);
  return {
    ...record,
    stage: "published",
    history: [
      ...record.history,
      { stage: "published", decision: "publish", reviewerId: editorId, reviewerRole: "editor", at },
    ],
    lastPublishedAt: at,
    updatedAt: at,
  };
}

/** Retire with a mandatory reason — vague cleanups are not allowed. */
export function retire(record: EditorialRecord, reason: string, by: Id, now?: Date): EditorialRecord {
  if (!reason || !reason.trim()) throw new Error("Retirement requires a stated reason.");
  const at = nowIso(now);
  return {
    ...record,
    stage: "retired",
    retirement: { reason: reason.trim(), at, by },
    history: [
      ...record.history,
      { stage: "retired", decision: "retire", reviewerId: by, reviewerRole: "editor", at, notes: reason.trim() },
    ],
    updatedAt: at,
  };
}

/** Published items come back for subject review once their interval elapses. */
export function dueForReReview(record: EditorialRecord, now: Date = new Date()): boolean {
  if (record.stage !== "published" || record.lastPublishedAt == null) return false;
  const elapsed = (now.getTime() - new Date(record.lastPublishedAt).getTime()) / 86_400_000;
  return elapsed >= record.reReviewIntervalDays;
}

/** Pull a published item back into subject review; history and count persist. */
export function flagForReReview(record: EditorialRecord, now?: Date): EditorialRecord {
  if (record.stage !== "published") throw new Error("Only published records can be flagged for re-review.");
  const at = nowIso(now);
  return {
    ...record,
    stage: "subject",
    reReviewCount: record.reReviewCount + 1,
    history: [
      ...record.history,
      {
        stage: "subject",
        decision: "fail",
        reviewerId: "system",
        reviewerRole: "editor",
        at,
        notes: `Periodic re-review #${record.reReviewCount + 1}`,
      },
    ],
    updatedAt: at,
  };
}

/** A major user issue quarantines published content back into subject review. */
export function reportIssue(
  record: EditorialRecord,
  input: { text: string; severity: "minor" | "major"; reportedBy?: string | null; now?: Date },
): EditorialRecord {
  if (!input.text.trim()) throw new Error("Issue text is required.");
  const at = nowIso(input.now);
  const issue: UserIssue = {
    id: `issue-${Math.floor(Math.random() * 1e9).toString(36)}`,
    reportedBy: input.reportedBy ?? null,
    text: input.text.trim(),
    severity: input.severity,
    at,
    resolvedAt: null,
  };
  const quarantined = issue.severity === "major" && record.stage === "published";
  return {
    ...record,
    issues: [...record.issues, issue],
    stage: quarantined ? "subject" : record.stage,
    updatedAt: at,
  };
}

// --- confidence ---------------------------------------------------------------

const SOURCE_CONFIDENCE: Record<ContentSource, number> = {
  authored: 0.9,
  licensed: 0.88,
  "past-paper": 0.85,
  adapted: 0.7,
  import: 0.55,
  generated: 0.45,
  unreviewed: 0.25,
};

export type ConfidenceTier = "high" | "moderate" | "low";

export interface EditorialConfidence {
  score: number;
  tier: ConfidenceTier;
  /** Human-readable reasons for the value — shown in the UI badge tooltip. */
  reasons: string[];
}

/**
 * Distil the chain into one honest number. Verified-with-full-chain tops out
 * near the source ceiling; generated-and-unreviewed floors near 0.25. Open
 * major issues cap the score regardless of lineage.
 */
export function editorialConfidence(record: EditorialRecord): EditorialConfidence {
  const reasons: string[] = [];
  let score = SOURCE_CONFIDENCE[record.source] ?? 0.5;
  reasons.push(`Source ${record.source} starts at ${score}.`);

  const passedStages = new Set(record.history.filter((h) => h.decision === "pass").map((h) => h.stage));
  for (const stage of ["structural", "subject", "mark_scheme", "exam_style"] as const) {
    if (passedStages.has(stage)) {
      score += 0.03;
      reasons.push(`${stage} review passed.`);
    }
  }
  if (record.stage === "published") {
    score += 0.02;
    reasons.push("Published.");
  }

  const openMajor = record.issues.filter((i) => i.severity === "major" && i.resolvedAt == null);
  if (openMajor.length) {
    // An unresolved major issue caps the score no matter how good the lineage:
    // trust is currently broken until a human re-reviews.
    score = Math.min(score, 0.7);
    reasons.push(`${openMajor.length} open major issue(s) cap confidence.`);
  }
  const openMinor = record.issues.filter((i) => i.severity === "minor" && i.resolvedAt == null).length;
  if (openMinor) {
    score -= 0.02 * Math.min(3, openMinor);
    reasons.push(`${openMinor} open minor issue(s).`);
  }
  if (dueForReReview(record)) {
    score -= 0.05;
    reasons.push("Past its re-review date.");
  }

  score = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  const tier: ConfidenceTier = score >= 0.8 ? "high" : score >= 0.55 ? "moderate" : "low";
  return { score, tier, reasons };
}
