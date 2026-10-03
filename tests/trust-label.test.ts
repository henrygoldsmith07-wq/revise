import { describe, expect, it } from "vitest";
import { applyHumanVerification, physicsContentFingerprint, trustedAssessmentContent } from "@/domain/content-trust";
import { TRUST_LABEL, trustLabel, trustNoteFor, trustTier, type TrustTier } from "@/domain/trust-label";
import { MIN_PROVABLE_QUESTIONS } from "@/domain/supply";
import type { Question } from "@/domain/types";

function question(subjectId: string, id = "q"): Question {
  return {
    id, subjectId, topicIds: ["t"], kind: "short", stem: "State the factor theorem for a polynomial.", totalMarks: 1, calculatorAllowed: false, difficulty: 2,
    origin: "seed", createdAt: "2026-01-01T00:00:00.000Z",
    parts: [{ id: `${id}:a`, label: "", prompt: "State it.", marks: 1, markScheme: ["a"], modelAnswer: "m" }],
  } as Question;
}
// Test-only attestation; nothing in the production bank is approved here.
const approve = (q: Question): Question => applyHumanVerification(q, {
  status: "approved", reviewerId: "test-only", reviewerRole: "teacher", reviewerQualification: "Test fixture only",
  reviewedAt: "2026-09-08T00:00:00Z", contentFingerprint: physicsContentFingerprint(q),
  checks: { question: true, marking: true, workedSolution: true, capabilityMapping: true, specificationMapping: true, examRealism: true },
});

describe("trust tiers", () => {
  it("has exactly four tiers with plain-language labels", () => {
    expect(Object.keys(TRUST_LABEL).sort()).toEqual(["insufficient", "reference", "trusted", "unverified"]);
    expect(TRUST_LABEL).toEqual({
      trusted: "Trusted, reviewed material", reference: "Reference material",
      unverified: "Not yet checked", insufficient: "Not enough questions to prove this yet",
    });
  });

  it("calls a flagship question trusted only when the repo predicate agrees", () => {
    const approved = approve(question("wjec-alevel-maths"));
    expect(trustedAssessmentContent(approved)).toBe(true);
    expect(trustTier(approved)).toBe("trusted");
    expect(trustTier(question("wjec-alevel-maths"))).toBe("unverified");
    const edited = { ...approved, stem: "Edited after approval." };
    expect(trustedAssessmentContent(edited)).toBe(false);
    expect(trustTier(edited)).toBe("unverified");
  });

  it("never reports reference-tier content as trusted, even if flagged verified", () => {
    const flagged = { ...question("ocr-gcse-maths"), verification: "verified" as const };
    expect(trustedAssessmentContent(flagged)).toBe(true);
    expect(trustTier(flagged)).toBe("reference");
    expect(trustLabel(flagged)).toBe(TRUST_LABEL.reference);
    expect(trustTier({ subjectId: "ocr-gcse-maths", provable: 10, practiceOnly: 0 })).toBe("reference");
  });

  it("derives topic tiers from provable supply", () => {
    const maths = "wjec-alevel-maths";
    expect(trustTier({ subjectId: maths, provable: MIN_PROVABLE_QUESTIONS, practiceOnly: 4 })).toBe("trusted");
    expect(trustTier({ subjectId: maths, provable: 0, practiceOnly: 5 })).toBe("unverified");
    expect(trustTier({ subjectId: maths, provable: 0, practiceOnly: 0 })).toBe("insufficient");
    expect(trustTier({ subjectId: maths, provable: MIN_PROVABLE_QUESTIONS - 1, practiceOnly: 5 })).toBe("insufficient");
  });
});

describe("trustNoteFor", () => {
  it("stays quiet when trust does not change the decision", () => {
    expect(trustNoteFor(approve(question("wjec-alevel-maths")))).toBeNull();
    expect(trustNoteFor({ subjectId: "wjec-alevel-maths", provable: 3, practiceOnly: 0 }, "proof")).toBeNull();
    expect(trustNoteFor({ subjectId: "wjec-alevel-maths", provable: 0, practiceOnly: 0 }, "practice")).toBeNull();
  });

  it("gives one plain sentence when trust matters", () => {
    const tiers: TrustTier[] = [];
    for (const [input, purpose] of [
      [question("wjec-alevel-maths"), "practice"], [question("wjec-alevel-maths"), "proof"],
      [question("ocr-gcse-maths"), "practice"], [{ subjectId: "wjec-alevel-maths", provable: 1, practiceOnly: 2 }, "proof"],
    ] as const) {
      const note = trustNoteFor(input, purpose);
      expect(note).toMatch(/^[A-Z][^.]*\.$/);
      tiers.push(trustTier(input));
    }
    expect(tiers).toEqual(["unverified", "unverified", "reference", "insufficient"]);
    expect(trustNoteFor(question("wjec-alevel-maths"), "proof")).toContain("cannot prove improvement");
  });
});
