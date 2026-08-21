import { describe, expect, it } from "vitest";
import { buildLongitudinalReport, createStudy, recordBaseline, recordDelayed } from "@/domain/learner-outcomes";
import type { LearnerAssessment } from "@/domain/learner-outcomes";

function assessment(awarded: number, max: number, takenAt: string, isUnseen = true): LearnerAssessment {
  return { id: `a-${takenAt}`, anonId: "anon-1", subjectId: "subj", awarded, max, accuracy: awarded / max, takenAt, isUnseen };
}

describe("real learner outcome support", () => {
  it("creates anonymised study without PII", () => {
    const s = createStudy({ id: "study1", subjectId: "subj", anonId: "anon-xyz" });
    expect(s.anonId).toBe("anon-xyz");
    expect(s.phase).toBe("baseline");
    expect((s as unknown as Record<string, unknown>).userId).toBeUndefined();
  });

  it("baseline → intervention → delayed unseen assessment → comparison", () => {
    let s = createStudy({ id: "study1", subjectId: "subj", anonId: "anon-1", now: new Date("2025-05-01T00:00:00.000Z") });
    s = recordBaseline(s, assessment(12, 20, "2025-05-01T00:00:00.000Z", true));
    expect(s.phase).toBe("intervention");
    s = recordDelayed(s, assessment(16, 20, "2025-06-15T00:00:00.000Z", true), 300);
    expect(s.phase).toBe("completed");
    expect(s.delayedAssessment?.awarded).toBe(16);
    const report = buildLongitudinalReport([s]);
    // Only 1 participant -> insufficient
    expect(report.insufficientData).toBe(true);
    expect(report.insufficientReason).toContain("Do not claim improvement");
  });

  it("reports gains only with 5+ participants, otherwise INSUFFICIENT", () => {
    const studies = Array.from({ length: 6 }, (_, i) => {
      let s = createStudy({ id: `s${i}`, subjectId: "subj", anonId: `anon-${i}` });
      s = recordBaseline(s, assessment(10 + i, 20, "2025-05-01T00:00:00.000Z"));
      s = recordDelayed(s, assessment(14 + i, 20, "2025-06-15T00:00:00.000Z", true));
      return s;
    });
    const report = buildLongitudinalReport(studies);
    expect(report.insufficientData).toBe(false);
    expect(report.meanGain).not.toBeNull();
    expect(report.meanGain!).toBeGreaterThan(0);
    expect(report.unseenShare).toBe(1);
  });

  it("privacy: anonId never contains user email or name", () => {
    const s = createStudy({ id: "s1", subjectId: "subj", anonId: "hashed-abc123" });
    expect(s.anonId).not.toContain("@");
    expect(s.anonId).not.toContain("henry");
  });
});
