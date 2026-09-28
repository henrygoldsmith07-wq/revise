import { describe, expect, it } from "vitest";
import { seedHumanVerificationLedgerIssues } from "@/content";
import {
  applyHumanVerificationLedger,
  buildHumanVerificationLedgerEntry,
  humanVerificationLedgerKey,
  mergeHumanVerificationLedger,
  parseHumanVerificationLedger,
} from "@/domain/human-verification-ledger";
import {
  applyHumanVerification,
  humanVerifiedWjecQuestion,
  humanVerificationIssues,
  physicsContentFingerprint,
  validHumanVerification,
} from "@/domain/physics-content-review";
import type { HumanVerificationRecord, Question } from "@/domain/types";

function question(id = "ledger-q"): Question {
  return {
    id,
    subjectId: "wjec-alevel-physics",
    topicIds: ["wjec-alevel-physics.waves"],
    kind: "short",
    stem: "Explain one wave property.",
    parts: [{
      id: `${id}:0`,
      label: "",
      prompt: "Explain one wave property.",
      marks: 2,
      markScheme: ["states a property", "explains it"],
      modelAnswer: "Amplitude is the maximum displacement from equilibrium.",
      aos: ["AO1"],
      specPointIds: ["wjec-alevel-physics.waves.sp-01"],
      learningClaims: ["explain a wave property"],
      capabilityIds: ["phys.waves.sp-01"],
    }],
    totalMarks: 2,
    calculatorAllowed: true,
    difficulty: 1,
    origin: "seed",
    source: "authored",
    licensedSource: null,
    verification: "unverified",
    reviewer: null,
    lastChecked: null,
    specVersion: "test-v1",
    createdAt: "2025-01-01T00:00:00.000Z",
  };
}

function review(q: Question): HumanVerificationRecord {
  return {
    status: "approved",
    reviewerId: "test-reviewer",
    reviewerRole: "teacher",
    reviewerQualification: "Test fixture only",
    reviewedAt: "2026-09-26T18:00:00.000Z",
    contentFingerprint: physicsContentFingerprint(q),
    checks: {
      question: true,
      marking: true,
      workedSolution: true,
      capabilityMapping: true,
      specificationMapping: true,
      examRealism: true,
    },
  };
}

describe("canonical WJEC human-verification contract", () => {
  it("fails closed when any required attestation component is removed", () => {
    const q = question();
    const valid = review(q);
    expect(validHumanVerification(q, valid)).toBe(true);
    const invalid: HumanVerificationRecord[] = [
      { ...valid, status: "pending" },
      { ...valid, reviewerId: undefined },
      { ...valid, reviewerRole: undefined },
      { ...valid, reviewerQualification: undefined },
      { ...valid, reviewedAt: undefined },
      { ...valid, contentFingerprint: "stale" },
      { ...valid, checks: { ...valid.checks, question: false } },
      { ...valid, checks: { ...valid.checks, marking: false } },
      { ...valid, checks: { ...valid.checks, workedSolution: false } },
      { ...valid, checks: { ...valid.checks, capabilityMapping: false } },
      { ...valid, checks: { ...valid.checks, specificationMapping: false } },
      { ...valid, checks: { ...valid.checks, examRealism: false } },
    ];
    for (const row of invalid) {
      expect(validHumanVerification(q, row)).toBe(false);
      expect(humanVerificationIssues(q, row).length).toBeGreaterThan(0);
      expect(humanVerifiedWjecQuestion({ ...q, verification: "verified", humanVerification: row })).toBe(false);
    }
  });

  it("fails closed instead of throwing on malformed runtime reviewer values", () => {
    const q = question();
    const malformed = { ...review(q), reviewerId: 123 } as unknown as HumanVerificationRecord;
    expect(() => humanVerificationIssues(q, malformed)).not.toThrow();
    expect(validHumanVerification(q, malformed)).toBe(false);
    expect(humanVerificationIssues(q, malformed)).toContain("missing-reviewer-id");
  });

  it("rejects date-only and future review timestamps", () => {
    const q = question();
    const valid = review(q);
    expect(humanVerificationIssues(q, { ...valid, reviewedAt: "2026-09-26" })).toContain("invalid-reviewed-at");
    expect(humanVerificationIssues(q, { ...valid, reviewedAt: "2099-01-01T00:00:00Z" })).toContain("invalid-reviewed-at");
    expect(humanVerificationIssues(q, { ...valid, reviewedAt: "2026-09-26T18:00:00.1234567Z" })).not.toContain("invalid-reviewed-at");
  });
});

describe("repository human-verification ledger", () => {
  it("ships with no blocking ledger diagnostics", () => {
    expect(seedHumanVerificationLedgerIssues.filter((issue) => issue.blocking)).toEqual([]);
  });

  it("applies only an exact current fingerprint and makes that question trusted", () => {
    const q = question();
    const approved = applyHumanVerification(q, review(q));
    const entry = buildHumanVerificationLedgerEntry(approved);
    const ledger = mergeHumanVerificationLedger({ formatVersion: 1, entries: [] }, [entry]);
    const result = applyHumanVerificationLedger([q], ledger);
    expect(result.issues.filter((issue) => issue.blocking)).toEqual([]);
    expect(result.appliedKeys).toEqual([humanVerificationLedgerKey(q.id, physicsContentFingerprint(q))]);
    expect(humanVerifiedWjecQuestion(result.questions[0]!)).toBe(true);
  });

  it("keeps an approval as history after the content fingerprint changes", () => {
    const q = question();
    const approved = applyHumanVerification(q, review(q));
    const entry = buildHumanVerificationLedgerEntry(approved);
    const changed = { ...q, stem: "Explain a different wave property." };
    const result = applyHumanVerificationLedger([changed], { formatVersion: 1, entries: [entry] });
    expect(result.appliedKeys).toEqual([]);
    expect(result.historicalKeys).toEqual([humanVerificationLedgerKey(q.id, entry.contentFingerprint)]);
    expect(result.issues.some((issue) => issue.kind === "historical-fingerprint" && !issue.blocking)).toBe(true);
    expect(humanVerifiedWjecQuestion(result.questions[0]!)).toBe(false);
  });

  it("blocks a current ledger entry that bypasses reviewer qualification", () => {
    const q = question();
    const invalid = { ...review(q), reviewerQualification: undefined };
    const result = applyHumanVerificationLedger([q], {
      formatVersion: 1,
      entries: [{
        questionId: q.id,
        subjectId: q.subjectId,
        contentFingerprint: physicsContentFingerprint(q),
        review: invalid,
      }],
    });
    expect(result.appliedKeys).toEqual([]);
    expect(result.issues.some((issue) => issue.kind === "invalid-current-approval" && issue.blocking)).toBe(true);
  });

  it("retains old and new fingerprints as separate audit records", () => {
    const original = question();
    const oldEntry = buildHumanVerificationLedgerEntry(applyHumanVerification(original, review(original)));
    const changed = { ...original, stem: "State and explain one wave property." };
    const newEntry = buildHumanVerificationLedgerEntry(applyHumanVerification(changed, review(changed)));
    const merged = mergeHumanVerificationLedger({ formatVersion: 1, entries: [oldEntry] }, [newEntry]);
    expect(merged.entries).toHaveLength(2);
    expect(new Set(merged.entries.map((entry) => entry.contentFingerprint)).size).toBe(2);
  });

  it("rejects duplicate ledger keys at parse time", () => {
    const q = question();
    const entry = buildHumanVerificationLedgerEntry(applyHumanVerification(q, review(q)));
    const parsed = parseHumanVerificationLedger({ formatVersion: 1, entries: [entry, entry] });
    expect(parsed.issues.some((issue) => issue.kind === "duplicate-entry" && issue.blocking)).toBe(true);
  });

  it("turns malformed reviewer primitive types into a blocking diagnostic instead of throwing", () => {
    const q = question();
    const fingerprint = physicsContentFingerprint(q);
    const malformed = {
      formatVersion: 1,
      entries: [{
        questionId: q.id,
        subjectId: q.subjectId,
        contentFingerprint: fingerprint,
        review: {
          ...review(q),
          reviewerId: 123,
        },
      }],
    };
    expect(() => applyHumanVerificationLedger([q], malformed)).not.toThrow();
    const result = applyHumanVerificationLedger([q], malformed);
    expect(result.appliedKeys).toEqual([]);
    expect(result.issues.some((issue) => issue.kind === "invalid-entry" && issue.blocking)).toBe(true);
  });

  it("keeps legacy v2 attestations as history and never upgrades them silently", () => {
    const q = question();
    const oldFingerprint = "physics-review-v2:deadbeef";
    const oldReview = { ...review(q), contentFingerprint: oldFingerprint };
    const result = applyHumanVerificationLedger([q], {
      formatVersion: 1,
      entries: [{
        questionId: q.id,
        subjectId: q.subjectId,
        contentFingerprint: oldFingerprint,
        review: oldReview,
      }],
    });
    expect(result.appliedKeys).toEqual([]);
    expect(result.historicalKeys).toEqual([humanVerificationLedgerKey(q.id, oldFingerprint)]);
    expect(result.issues.some((issue) => issue.kind === "historical-fingerprint" && !issue.blocking)).toBe(true);
  });

  it("rejects a historical row when its embedded review fingerprint disagrees with the ledger key", () => {
    const q = question();
    const result = applyHumanVerificationLedger([q], {
      formatVersion: 1,
      entries: [{
        questionId: q.id,
        subjectId: q.subjectId,
        contentFingerprint: "physics-review-v2:aaaa",
        review: { ...review(q), contentFingerprint: "physics-review-v2:bbbb" },
      }],
    });
    expect(result.historicalKeys).toEqual([]);
    expect(result.issues.some((issue) => issue.kind === "invalid-entry" && issue.blocking)).toBe(true);
  });
});
