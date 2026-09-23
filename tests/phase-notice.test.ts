import { describe, expect, it } from "vitest";
import {
  currentPhaseBuckets,
  phaseBucketFor,
  techniqueEntryNotices,
  TECHNIQUE_WINDOW_DAYS,
  FINAL_WINDOW_DAYS,
  type PhaseSubject,
} from "../src/domain/phase-notice";

const biology = (days: number | null): PhaseSubject => ({ subjectId: "bio", name: "Biology", days });
const chemistry = (days: number | null): PhaseSubject => ({ subjectId: "chem", name: "Chemistry", days });

describe("phaseBucketFor", () => {
  it("buckets the run-up at the technique and final boundaries", () => {
    expect(phaseBucketFor(null)).toBeNull();
    expect(phaseBucketFor(60)).toBe("early");
    expect(phaseBucketFor(TECHNIQUE_WINDOW_DAYS + 1)).toBe("early");
    expect(phaseBucketFor(TECHNIQUE_WINDOW_DAYS)).toBe("technique");
    expect(phaseBucketFor(FINAL_WINDOW_DAYS + 1)).toBe("technique");
    expect(phaseBucketFor(FINAL_WINDOW_DAYS)).toBe("final");
    expect(phaseBucketFor(0)).toBe("final");
  });
});

describe("techniqueEntryNotices", () => {
  it("announces a subject that crossed into the window since the last evaluation", () => {
    const notices = techniqueEntryNotices([biology(10)], { bio: "early" });
    expect(notices).toHaveLength(1);
    expect(notices[0].subjectId).toBe("bio");
    expect(notices[0].title).toContain("Biology");
    expect(notices[0].title).toContain("timed-paper fortnight");
    expect(notices[0].body).toMatch(/timed papers/i);
  });

  it("counts a subject already inside the window with no prior record as an entry", () => {
    // The transition happened between visits — this is the first honest chance to say so.
    const notices = techniqueEntryNotices([biology(9)], {});
    expect(notices).toHaveLength(1);
  });

  it("does not re-announce a subject whose entry was already announced", () => {
    const notices = techniqueEntryNotices([biology(12), chemistry(30)], { bio: "technique" });
    expect(notices).toHaveLength(0);
  });

  it("ignores subjects still far out or with no exam at all", () => {
    expect(techniqueEntryNotices([biology(45), chemistry(null)], {})).toHaveLength(0);
  });

  it("does not announce final-window subjects (their technique entry was the announcement)", () => {
    expect(techniqueEntryNotices([biology(2)], {})).toHaveLength(0);
  });

  it("re-announces after a date is pushed back out of the window and the subject re-enters", () => {
    // Recorded technique, then pushed to 40 days (early)…
    const during = techniqueEntryNotices([biology(40)], { bio: "technique" });
    expect(during).toHaveLength(0);
    // …and re-enters at 10 days: a fresh transition deserves a fresh notice.
    const reentry = techniqueEntryNotices([biology(10)], { bio: "early" });
    expect(reentry).toHaveLength(1);
  });

  it("announces each newly-entered subject independently", () => {
    const notices = techniqueEntryNotices([biology(10), chemistry(8)], { bio: "technique" });
    expect(notices).toHaveLength(1);
    expect(notices[0].subjectId).toBe("chem");
  });
});

describe("currentPhaseBuckets", () => {
  it("records the bucket for every subject, null for exam-less ones", () => {
    const buckets = currentPhaseBuckets([biology(10), chemistry(60), { subjectId: "phy", name: "Physics", days: null }]);
    expect(buckets).toEqual({ bio: "technique", chem: "early", phy: null });
  });
});
