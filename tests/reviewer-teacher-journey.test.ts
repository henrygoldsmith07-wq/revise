import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reviewerTally } from "@/components/reviewer/DecisionNotice";
import { decisionNoticeText, withDecisionNotice } from "@/lib/reviewer/notice";
import { isReviewerPath, reviewerReturnPath, signInLinkProblem } from "@/lib/reviewer/return-path";

// The teacher's route into the reviewer portal (eighteenth pass). Before it, a
// teacher opening an invite link in a fresh browser was shown the student
// onboarding (and got a learner profile in IndexedDB) instead of the portal.
// e2e/reviewer-first-visit.spec.ts checks the real page; these pin the pieces.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("reviewer portal renders outside the student shell", () => {
  it("matches the portal by exact segment, never the student /review route", () => {
    expect(isReviewerPath("/reviewer")).toBe(true);
    expect(isReviewerPath("/reviewer/pairs")).toBe(true);
    expect(isReviewerPath("/reviewer/review/cnt%3Aquestion%3Ax")).toBe(true);
    expect(isReviewerPath("/review")).toBe(false);
    expect(isReviewerPath("/reviewers")).toBe(false);
    expect(isReviewerPath("/")).toBe(false);
    expect(isReviewerPath(null)).toBe(false);
    // The sign-in return path uses the same rule.
    expect(reviewerReturnPath("/review", "")).toBe("/reviewer");
    expect(reviewerReturnPath("/reviewer/pairs", "?subject=physics&code=abc")).toBe("/reviewer/pairs?subject=physics");
  });

  it("wraps only non-portal routes in AccountBoundary + AppShell", () => {
    const layout = read("src/app/layout.tsx");
    const shell = read("src/components/RouteShell.tsx");
    expect(layout).toContain("<RouteShell>{children}</RouteShell>");
    expect(layout).not.toContain("<AccountBoundary>");
    expect(shell).toContain("if (isReviewerPath(pathname)) return <ShortcutProvider>{children}</ShortcutProvider>;");
    expect(shell).toMatch(/<AccountBoundary>\s*<ShortcutProvider>\s*<AppShell>\{children\}<\/AppShell>/);
  });

  it("keeps the teacher's session fresh without the student client", () => {
    expect(read("src/app/(reviewer)/layout.tsx")).toContain("<ReviewerSessionKeeper />");
    expect(read("src/components/reviewer/ReviewerSessionKeeper.tsx")).toContain("getSupabase();");
  });

  it("still re-checks the session and grant on every portal page and the decision API", () => {
    for (const path of [
      "src/app/(reviewer)/reviewer/page.tsx",
      "src/app/(reviewer)/reviewer/pairs/page.tsx",
      "src/app/(reviewer)/reviewer/review/[questionId]/page.tsx",
    ]) {
      expect(read(path)).toContain('if (context.status !== "ok") return <ReviewerGate');
    }
    const route = read("src/app/api/reviewer/decisions/route.ts");
    expect(route).toContain('if (context.status === "signed-out") return NextResponse.json({ error: "Sign in to review." }, { status: 401 });');
    expect(route).toContain('if (context.status === "not-reviewer")');
  });
});

describe("sign-in link problems are named, not silent", () => {
  it("reads an expired or used link from the query or the hash", () => {
    expect(signInLinkProblem("?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired", "")).toBe("expired");
    expect(signInLinkProblem("?subject=physics", "#error=access_denied&error_code=otp_expired")).toBe("expired");
  });

  it("treats a code that did not become a session as a different browser", () => {
    expect(signInLinkProblem("?subject=physics&code=4f2c", "")).toBe("other-browser");
  });

  it("reports other errors generically and nothing for an ordinary visit", () => {
    expect(signInLinkProblem("?error=server_error&error_description=x", "")).toBe("failed");
    expect(signInLinkProblem("?subject=physics", "")).toBeNull();
    expect(signInLinkProblem("", "")).toBeNull();
  });
});

describe("a recorded decision is confirmed on the next page", () => {
  it("adds one whitelisted word to the next URL, keeping its query", () => {
    expect(withDecisionNotice("/reviewer/review/q1?subject=physics&batch=pairs", "approved")).toBe("/reviewer/review/q1?subject=physics&batch=pairs&recorded=approved");
    expect(withDecisionNotice("/reviewer?subject=maths", "changes")).toBe("/reviewer?subject=maths&recorded=changes");
    expect(withDecisionNotice("/reviewer/pairs?subject=physics&recorded=changes", "verified")).toBe("/reviewer/pairs?subject=physics&recorded=verified");
  });

  it("says what happens next, and shows nothing for an unknown value", () => {
    expect(decisionNoticeText("approved")).toMatch(/one more approval from a different reviewer/);
    expect(decisionNoticeText("verified")).toMatch(/two independent approvals/);
    expect(decisionNoticeText("changes")).toMatch(/until its author edits it/);
    expect(decisionNoticeText("toString")).toBeNull();
    expect(decisionNoticeText("<script>")).toBeNull();
    expect(decisionNoticeText(undefined)).toBeNull();
    expect(decisionNoticeText(["verified", "x"])).toMatch(/verified/);
  });

  it("the decision bar pushes the notice only after the server recorded it", () => {
    const form = read("src/components/reviewer/ReviewDecisionForm.tsx");
    const ok = form.indexOf("if (!response.ok)");
    const push = form.indexOf("router.push(withDecisionNotice(");
    expect(ok).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(ok);
    expect(form).toContain('body.stage === "verified" ? "verified" : "approved"');
  });

  it("tallies only this reviewer's own decisions", () => {
    const events = [
      { reviewerId: "teacher-a", decision: "approve" },
      { reviewerId: "teacher-b", decision: "approve" },
      { reviewerId: "teacher-a", decision: "revise" },
      { reviewerId: "teacher-a", decision: "approve" },
    ];
    expect(reviewerTally(events, "teacher-a")).toEqual({ decisions: 3, approvals: 2 });
    expect(reviewerTally(events, "teacher-c")).toEqual({ decisions: 0, approvals: 0 });
  });
});
