import { describe, expect, it } from "vitest";
import { physicsContentFingerprint, humanVerifiedWjecQuestion, applyHumanVerification, REQUIRED_HUMAN_CHECKS } from "@/domain/physics-content-review";
import { contentLifecycleStatus, summariseLifecycle, findLedgerAnomalies } from "@/domain/content-lifecycle";
import { trustedSnapshotAttempt } from "@/state/trusted-evidence";
import type { Question } from "@/domain/types";

function baseQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q-lifecycle-1",
    subjectId: "wjec-alevel-maths",
    topicIds: ["t1"],
    kind: "structured",
    stem: "Explain why the mean exceeds the median for skewed data.",
    parts: [{
      id: "p1",
      label: "a",
      prompt: "Explain the skew effect.",
      marks: 2,
      markScheme: ["Identifies tail pull", "Links to mean sensitivity"],
      modelAnswer: "The tail pulls the mean while the median stays central.",
      specPointIds: ["sp1"],
      capabilityIds: ["cap1"],
    }],
    totalMarks: 2,
    calculatorAllowed: false,
    difficulty: 3,
    origin: "seed",
    source: "authored",
    verification: "unverified",
    specPointIds: ["sp1"],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Question;
}

function approvedRecord(question: Question) {
  return {
    status: "approved" as const,
    reviewerId: "examiner-1",
    reviewerRole: "examiner" as const,
    reviewerQualification: "WJEC examiner",
    reviewedAt: "2026-02-01T00:00:00.000Z",
    contentFingerprint: physicsContentFingerprint(question),
    checks: { question: true, marking: true, workedSolution: true, capabilityMapping: true, specificationMapping: true, examRealism: true },
  };
}

describe("content lifecycle", () => {
  it("marks unreviewed authored content as blocked with reasons", () => {
    const status = contentLifecycleStatus(baseQuestion());
    expect(status.state).toBe("blocked");
    expect(status.blockedReasons).toContain("unreviewed");
    expect(status.missingChecks.length).toBe(REQUIRED_HUMAN_CHECKS.length);
  });

  it("promotes a fully attested question to verified", () => {
    const draft = baseQuestion();
    const verified = applyHumanVerification(draft, approvedRecord(draft));
    expect(humanVerifiedWjecQuestion(verified)).toBe(true);
    expect(contentLifecycleStatus(verified).state).toBe("verified");
  });

  it("fails closed when difficulty or AO coverage changes after approval", () => {
    const draft = baseQuestion();
    const verified = applyHumanVerification(draft, approvedRecord(draft));
    const remapped = { ...verified, difficulty: 5 as const };
    expect(humanVerifiedWjecQuestion(remapped)).toBe(false);
    expect(contentLifecycleStatus(remapped).blockedReasons).toContain("stale-fingerprint");
    const aoRemapped = { ...verified, aos: ["AO3" as const] };
    // AO change alters the fingerprint payload; trust must not survive silently.
    expect(physicsContentFingerprint(aoRemapped as Question)).not.toBe(physicsContentFingerprint(verified));
  });

  it("never fabricates approval from an incomplete record", () => {
    const draft = baseQuestion();
    const partial = applyHumanVerification(draft, { ...approvedRecord(draft), checks: { ...approvedRecord(draft).checks, marking: false } });
    expect(humanVerifiedWjecQuestion(partial)).toBe(false);
    expect(partial.verification).toBe("unverified");
  });

  it("summarises what is authored, reviewed, blocked and next", () => {
    const draft = baseQuestion({ id: "q-a" });
    const verified = applyHumanVerification(baseQuestion({ id: "q-b" }), approvedRecord(baseQuestion({ id: "q-b" })));
    const summary = summariseLifecycle([draft, verified], "wjec-alevel-maths");
    expect(summary.verified).toBe(1);
    expect(summary.blocked).toBe(1);
    expect(summary.nextBatch[0]?.questionId).toBe("q-a");
    expect(summary.blockedByReason["unreviewed"]).toBe(1);
  });

  it("detects orphaned and stale ledger entries without trusting them", () => {
    const draft = baseQuestion();
    const anomalies = findLedgerAnomalies({
      questions: [draft],
      approvals: [
        { questionId: "missing-q", contentFingerprint: "physics-review-v3:dead" },
        { questionId: draft.id, contentFingerprint: "physics-review-v3:stale" },
      ],
    });
    expect(anomalies.map((a) => a.kind).sort()).toEqual(["orphaned-approval", "stale-fingerprint"]);
  });
});

describe("trusted evidence orphans", () => {
  it("does not trust orphaned attempts for any reviewed WJEC subject", () => {
    for (const subjectId of ["wjec-alevel-physics", "wjec-alevel-maths", "wjec-alevel-biology", "wjec-alevel-chemistry"]) {
      const attempt = {
        id: "a1", userId: "u1", questionId: "missing", subjectId, topicIds: ["t1"],
        answers: {}, awarded: 2, max: 2, marked: true, markedBy: "rubric" as const,
        mode: "practice" as const, createdAt: "2026-03-01T00:00:00.000Z",
      };
      expect(trustedSnapshotAttempt(attempt as never, [], [])).toBe(false);
    }
  });

  it("still trusts orphaned attempts for non-reviewed subjects when well-formed", () => {
    const attempt = {
      id: "a1", userId: "u1", questionId: "missing", subjectId: "aqa-gcse-maths", topicIds: ["t1"],
      answers: {}, awarded: 1, max: 2, marked: true, markedBy: "rubric" as const,
      mode: "practice" as const, createdAt: "2026-03-01T00:00:00.000Z",
    };
    expect(trustedSnapshotAttempt(attempt as never, [], [])).toBe(true);
  });
});
