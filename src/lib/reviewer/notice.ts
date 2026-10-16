// Pure helpers for the "your decision was recorded" notice (unit-tested in
// tests/reviewer-teacher-journey.test.ts).
//
// After Approve / Request changes the review screen moves straight on to the
// next question, so the confirmation it set ("Approved — waiting on a second
// reviewer") was unmounted before anyone could read it. The outcome now rides
// on the next URL as one whitelisted word and the next page says it. The word
// is display-only: it never changes a state, a count or a rule, and an
// unknown value shows nothing.

export type DecisionNotice = "approved" | "verified" | "changes";

const TEXT: Record<DecisionNotice, string> = {
  approved: "Approval recorded. That question now needs one more approval from a different reviewer before students can rely on it.",
  verified: "Approval recorded. That question now has two independent approvals, so it is verified: students' devices pick it up the next time they come online.",
  changes: "Change request recorded. That question leaves the queue until its author edits it; your comment is in its history.",
};

export function withDecisionNotice(href: string, notice: DecisionNotice): string {
  const [path, query = ""] = href.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("recorded", notice);
  return `${path}?${params.toString()}`;
}

export function decisionNoticeText(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && Object.prototype.hasOwnProperty.call(TEXT, value) ? TEXT[value as DecisionNotice] : null;
}
