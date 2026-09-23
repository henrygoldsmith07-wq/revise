import { describe, expect, it } from "vitest";
import {
  advanceStage,
  createEditorialRecord,
  dueForReReview,
  editorialConfidence,
  flagForReReview,
  publish,
  reportIssue,
  retire,
} from "@/domain/editorial-pipeline";

// ---------------------------------------------------------------------------
// Editorial review pipeline — order, accountability, quarantine and honest
// confidence. Every rule here encodes what separates a publisher from a
// content generator.
// ---------------------------------------------------------------------------

const NOW = new Date("2026-08-22T09:00:00.000Z");
const AUTHOR = "author-1";
const REVIEWER = "reviewer-1";
const EDITOR = "editor-1";

function fresh(source: Parameters<typeof createEditorialRecord>[0]["source"] = "authored") {
  return createEditorialRecord({
    contentKind: "question",
    contentId: "q-1",
    authorId: AUTHOR,
    source,
    specVersion: "2024-1.0",
    now: NOW,
    reReviewIntervalDays: 180,
  });
}

/** Walk a record through every human stage to published in one call. */
function toPublished(source: Parameters<typeof createEditorialRecord>[0]["source"] = "authored") {
  let r = fresh(source);
  r = advanceStage(r, { target: "structural", decision: "pass", reviewerId: "ci", reviewerRole: "editor" });
  r = advanceStage(r, { target: "subject", decision: "pass", reviewerId: REVIEWER, reviewerRole: "subject_reviewer" });
  r = advanceStage(r, { target: "mark_scheme", decision: "pass", reviewerId: "ms-reviewer", reviewerRole: "mark_scheme_reviewer" });
  r = advanceStage(r, { target: "exam_style", decision: "pass", reviewerId: "ex-reviewer", reviewerRole: "exam_style_reviewer" });
  r = advanceStage(r, { target: "verified", decision: "pass", reviewerId: EDITOR, reviewerRole: "editor" });
  return publish(r, EDITOR, NOW);
}

describe("stage ordering", () => {
  it("enforces the exact chain — no skipping", () => {
    const r = fresh();
    expect(() =>
      advanceStage(r, { target: "mark_scheme", decision: "pass", reviewerId: REVIEWER, reviewerRole: "mark_scheme_reviewer" }),
    ).toThrow(/Out-of-order/);
  });

  it("walks draft → … → published appending history at each step", () => {
    const published = toPublished();
    expect(published.stage).toBe("published");
    expect(published.history).toHaveLength(6);
    const reviewers = new Set(published.history.map((h) => h.reviewerId));
    expect(reviewers.has(AUTHOR)).toBe(false);
    expect(reviewers.size).toBeGreaterThanOrEqual(4);
  });

  it("a failed review returns the item to Draft with history intact and allows resubmission", () => {
    const afterStructural = advanceStage(fresh(), {
      target: "structural",
      decision: "pass",
      reviewerId: "ci",
      reviewerRole: "editor",
    });
    const failed = advanceStage(afterStructural, {
      target: "subject",
      decision: "fail",
      reviewerId: REVIEWER,
      reviewerRole: "subject_reviewer",
      notes: "wrong AO tags",
    });
    expect(failed.stage).toBe("draft");
    expect(failed.history.at(-1)?.decision).toBe("fail");

    // Resubmit through structural; passing subject puts it back into
    // mark_scheme review. Stage names the last gate PASSED.
    const resubmittedStructural = advanceStage(failed, {
      target: "structural",
      decision: "pass",
      reviewerId: "ci",
      reviewerRole: "editor",
    });
    expect(resubmittedStructural.stage).toBe("subject"); // structural passed → subject gate is now pending
    const resubmittedSubject = advanceStage(resubmittedStructural, {
      target: "subject",
      decision: "pass",
      reviewerId: REVIEWER,
      reviewerRole: "subject_reviewer",
    });
    expect(resubmittedSubject.stage).toBe("mark_scheme"); // subject passed → mark_scheme gate pending
    expect(() =>
      advanceStage(resubmittedSubject, {
        target: "subject",
        decision: "pass",
        reviewerId: REVIEWER,
        reviewerRole: "subject_reviewer",
      }),
    ).toThrow(/pending gate is "mark_scheme"/);
  });

  it("the author can never pass their own human review stage", () => {
    const atStructural = advanceStage(fresh(), { target: "structural", decision: "pass", reviewerId: "ci", reviewerRole: "editor" });
    expect(() =>
      advanceStage(atStructural, { target: "subject", decision: "pass", reviewerId: AUTHOR, reviewerRole: "subject_reviewer" }),
    ).toThrow(/cannot be passed by the author/);
  });
});

describe("publish, retire and periodic re-review", () => {
  it("publishes only from verified and stamps lastPublishedAt", () => {
    const published = toPublished();
    expect(published.lastPublishedAt).toBe(NOW.toISOString());
    expect(dueForReReview(published, NOW)).toBe(false);
  });

  it("comes back for re-review after the interval elapses, keeping count", () => {
    let published = toPublished();
    const later = new Date(NOW.getTime() + 181 * 86_400_000);
    expect(dueForReReview(published, later)).toBe(true);
    published = flagForReReview(published, later);
    expect(published.stage).toBe("subject");
    expect(published.reReviewCount).toBe(1);
    expect(published.history.length).toBe(7);
  });

  it("retiring requires a stated reason and records who decided", () => {
    const published = toPublished();
    expect(() => retire(published, "   ", EDITOR)).toThrow(/reason/);
    const retired = retire(published, "Superseded by rewritten spec coverage", EDITOR, NOW);
    expect(retired.stage).toBe("retired");
    expect(retired.retirement?.by).toBe(EDITOR);
    expect(retired.retirement?.reason).toContain("Superseded");
  });
});

describe("user-reported issues", () => {
  it("quarantines published content on a major issue", () => {
    let published = toPublished();
    published = reportIssue(published, {
      text: "Mark scheme awards marks for the wrong unit",
      severity: "major",
      reportedBy: "student-42",
      now: NOW,
    });
    expect(published.stage).toBe("subject");
    expect(published.issues).toHaveLength(1);
    expect(published.issues[0].resolvedAt).toBeNull();
  });

  it("minor issues are recorded without pulling the content", () => {
    let published = toPublished();
    published = reportIssue(published, { text: "Typo in part (b)", severity: "minor", now: NOW });
    expect(published.stage).toBe("published");
    expect(published.issues).toHaveLength(1);
  });
});

describe("editorial confidence", () => {
  it("verified authored content scores high; generated unreviewed floors low", () => {
    const verified = toPublished("authored");
    const high = editorialConfidence(verified);
    expect(high.tier).toBe("high");

    const generated = fresh("generated");
    const low = editorialConfidence(generated);
    expect(low.tier).toBe("low");
    expect(low.score).toBeLessThanOrEqual(0.45);
    expect(high.score).toBeGreaterThan(low.score + 0.3);
  });

  it("an open major issue caps even verified lineage", () => {
    let verified = toPublished();
    verified = reportIssue(verified, { text: "Wrong formula", severity: "major", now: NOW });
    const conf = editorialConfidence(verified);
    expect(conf.tier).not.toBe("high");
    expect(conf.reasons.join(" ")).toContain("major issue");
  });
});
