import { describe, expect, it } from "vitest";
import { ingestAuthenticatedPhysicsPaper, ingestPaperPayload } from "@/domain/ingest";
import { verifiedPhysicsPaperProvenance } from "@/domain/physics-content-review";

const base = {
  topics: ["kinematics-dynamics"],
  stem: "A verified paper question tests a measured acceleration.",
  parts: [{ prompt: "Calculate the acceleration.", marks: 1, scheme: ["a = 2 m s^-2"], answer: "a = 2 m s^-2", specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-03"] }],
};

describe("authenticated WJEC Physics paper ingestion", () => {
  it("keeps ordinary extraction pending and accepts only a verified manifest", () => {
    const pending = ingestPaperPayload({ subjectId: "wjec-alevel-physics", questions: [base] })[0]!;
    expect(verifiedPhysicsPaperProvenance(pending)).toBe(false);
    const verified = ingestAuthenticatedPhysicsPaper({
      subjectId: "wjec-alevel-physics",
      paperProvenance: {
        board: "WJEC", specification: "A200QS", paperId: "paper-2026-1", sourceUrl: "https://www.wjec.co.uk/test-only/paper.pdf",
        sourceDigest: "sha256:test-only", status: "verified", verifiedBy: "teacher-1", verifiedAt: "2026-09-08T00:00:00Z",
      },
      questions: [{ ...base, paperQuestionNumber: "1(a)" }],
    })[0]!;
    expect(verified.paperId).toBe("paper-2026-1");
    expect(verified.paperQuestionNumber).toBe("1(a)");
    expect(verifiedPhysicsPaperProvenance(verified)).toBe(true);
  });

  it("refuses an unverified or non-WJEC manifest", () => {
    expect(() => ingestAuthenticatedPhysicsPaper({
      subjectId: "wjec-alevel-physics",
      paperProvenance: {
        board: "WJEC", specification: "A200QS", paperId: "paper", sourceUrl: "https://example.com/paper.pdf",
        sourceDigest: "sha256:test", status: "pending", verifiedBy: "teacher", verifiedAt: "2026-09-08T00:00:00Z",
      },
      questions: [base],
    })).toThrow(/provenance must be verified/);
  });
});
