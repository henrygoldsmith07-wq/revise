import { describe, expect, it } from "vitest";
import { getSubject } from "@/domain/curriculum";
import {
  WJEC_SUMMER_2027_SOURCE,
  estimatedSeriesStart,
  examRowsForSitting,
  examSeriesYear,
  examSittingFor,
  shortDate,
} from "@/domain/exam-series";
import { boardAfterRegionChange, inferBoardForRegion, regionBoardMissing } from "@/domain/school-region";

// ---------------------------------------------------------------------------
// Onboarding works out a student's board and exam dates instead of asking.
// Dates are from the WJEC Summer 2027 FINAL GCE timetable (checked 28 Oct
// 2026); anything not on it is a labelled estimate, never presented as a date.
// ---------------------------------------------------------------------------

const AUTUMN = "2026-10-28";
const BOARDS = ["wjec", "aqa", "edexcel", "ocr"];

function sitting(subjectId: string, yearGroup: "year-12" | "year-13" | undefined, today = AUTUMN, boardId = "wjec", level = "A Level") {
  return examSittingFor({ boardId, subjectId, level, yearGroup, today });
}

describe("examSeriesYear: the academic year runs September to August", () => {
  it("rolls over in September, not January", () => {
    expect(examSeriesYear("2026-08-31")).toBe(2026);
    expect(examSeriesYear("2026-09-01")).toBe(2027);
    expect(examSeriesYear("2026-10-28")).toBe(2027);
    expect(examSeriesYear("2027-01-15")).toBe(2027);
    expect(examSeriesYear("2027-09-02")).toBe(2028);
  });
});

describe("examSittingFor: WJEC from the official summer 2027 timetable", () => {
  it("Year 12 WJEC Biology sits AS Units 1 and 2 (Thu 13 May and Thu 20 May 2027)", () => {
    const result = sitting("wjec-alevel-biology", "year-12");
    expect(result?.status).toBe("timetabled");
    expect(result?.firstDate).toBe("2027-05-13");
    expect(result?.papers.map((p) => [p.unit, p.date])).toEqual([[1, "2027-05-13"], [2, "2027-05-20"]]);
    expect(result?.note).toContain("From the WJEC summer 2027 timetable");
    expect(result?.sourceUrl).toBe(WJEC_SUMMER_2027_SOURCE);
  });

  it("Year 13 WJEC Biology sits A2 Units 3 and 4 instead (Mon 7 June and Mon 14 June 2027)", () => {
    const result = sitting("wjec-alevel-biology", "year-13");
    expect(result?.firstDate).toBe("2027-06-07");
    expect(result?.papers.map((p) => p.unit)).toEqual([3, 4]);
    expect(result?.note).toContain("A2 Unit 3");
  });

  it("covers every WJEC flagship A level with the dates on the timetable", () => {
    expect(sitting("wjec-alevel-chemistry", "year-12")?.papers.map((p) => p.date)).toEqual(["2027-05-11", "2027-05-18"]);
    expect(sitting("wjec-alevel-physics", "year-12")?.papers.map((p) => p.date)).toEqual(["2027-05-13", "2027-05-18"]);
    expect(sitting("wjec-alevel-maths", "year-12")?.papers.map((p) => p.date)).toEqual(["2027-05-12", "2027-05-21"]);
    expect(sitting("wjec-alevel-chemistry", "year-13")?.papers.map((p) => p.date)).toEqual(["2027-05-28", "2027-06-10"]);
    expect(sitting("wjec-alevel-physics", "year-13")?.papers.map((p) => p.date)).toEqual(["2027-05-27", "2027-06-08"]);
    expect(sitting("wjec-alevel-maths", "year-13")?.papers.map((p) => p.date)).toEqual(["2027-05-25", "2027-06-09"]);
  });

  it("'Not sure' and GCSE subjects get nothing, so the field stays blank", () => {
    expect(sitting("wjec-alevel-biology", undefined)).toBeNull();
    expect(sitting("wjec-gcse-biology", "year-12", AUTUMN, "wjec", "GCSE")).toBeNull();
  });

  it("drops a unit already sat, and returns nothing once the series is over", () => {
    expect(sitting("wjec-alevel-biology", "year-12", "2027-05-15")?.papers.map((p) => p.unit)).toEqual([2]);
    expect(sitting("wjec-alevel-biology", "year-12", "2027-07-01")).toBeNull();
  });

  it("after September 2027 the series is 2028, which is not timetabled, so it is a labelled estimate", () => {
    const result = sitting("wjec-alevel-biology", "year-12", "2027-09-10");
    expect(result?.status).toBe("estimated");
    expect(result?.seriesYear).toBe(2028);
    expect(result?.firstDate).toBe("2028-05-08");
    expect(result?.papers).toEqual([]);
    expect(result?.note).toMatch(/^Estimated/);
    expect(result?.sourceUrl).toBeUndefined();
  });
});

describe("examSittingFor: linear boards are estimates", () => {
  it("Year 13 on AQA sits in summer 2027; Year 12 not until summer 2028", () => {
    const y13 = sitting("aqa-alevel-biology", "year-13", AUTUMN, "aqa");
    expect(y13?.status).toBe("estimated");
    expect(y13?.firstDate).toBe("2027-05-10");
    const y12 = sitting("aqa-alevel-biology", "year-12", AUTUMN, "aqa");
    expect(y12?.seriesYear).toBe(2028);
    expect(y12?.note).toContain("summer 2028");
  });
});

describe("estimatedSeriesStart and shortDate", () => {
  it("is the second Monday in May", () => {
    expect(estimatedSeriesStart(2027)).toBe("2027-05-10");
    expect(estimatedSeriesStart(2028)).toBe("2028-05-08");
    expect(estimatedSeriesStart(2029)).toBe("2029-05-14");
  });
  it("formats a date for the note", () => {
    expect(shortDate("2027-05-13")).toBe("Thu 13 May");
  });
});

describe("examRowsForSitting: what onboarding saves", () => {
  it("a timetabled WJEC sitting becomes one row per unit paper the subject knows", () => {
    const biology = getSubject("wjec-alevel-biology")!;
    let n = 0;
    const rows = examRowsForSitting({
      sitting: sitting("wjec-alevel-biology", "year-12")!,
      subject: { id: biology.id, name: biology.name, paperIds: biology.papers.map((p) => p.id) },
      userId: "u",
      newId: () => `id-${++n}`,
    });
    expect(rows.map((r) => [r.paperSpecId, r.date])).toEqual([
      ["wjec-alevel-biology.u1", "2027-05-13"],
      ["wjec-alevel-biology.u2", "2027-05-20"],
    ]);
    expect(rows[0]?.label).toBe(`${biology.name} Unit 1`);
  });

  it("an estimate is one whole-subject row whose label says it is estimated", () => {
    const rows = examRowsForSitting({
      sitting: sitting("aqa-alevel-biology", "year-13", AUTUMN, "aqa")!,
      subject: { id: "aqa-alevel-biology", name: "Biology", paperIds: [] },
      userId: "u",
      newId: () => "x",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.paperSpecId).toBeUndefined();
    expect(rows[0]?.label).toContain("estimated");
  });
});

describe("school region → board", () => {
  it("Wales infers WJEC; England and Other infer nothing", () => {
    expect(inferBoardForRegion("wales", BOARDS)).toBe("wjec");
    expect(inferBoardForRegion("england", BOARDS)).toBeNull();
    expect(inferBoardForRegion("other", BOARDS)).toBeNull();
    expect(inferBoardForRegion(undefined, BOARDS)).toBeNull();
  });

  it("Northern Ireland infers CCEA only when Revise offers it, and says when it does not", () => {
    expect(inferBoardForRegion("northern-ireland", BOARDS)).toBeNull();
    expect(regionBoardMissing("northern-ireland", BOARDS)).toBe(true);
    expect(inferBoardForRegion("northern-ireland", [...BOARDS, "ccea"])).toBe("ccea");
    expect(regionBoardMissing("wales", BOARDS)).toBe(false);
  });

  it("an inferred board follows the region; a hand-picked board is kept", () => {
    expect(boardAfterRegionChange({ region: "wales", currentBoardId: null, currentWasInferred: false, availableBoardIds: BOARDS })).toEqual({ boardId: "wjec", inferred: true });
    expect(boardAfterRegionChange({ region: "england", currentBoardId: "wjec", currentWasInferred: true, availableBoardIds: BOARDS })).toEqual({ boardId: null, inferred: false });
    expect(boardAfterRegionChange({ region: "wales", currentBoardId: "aqa", currentWasInferred: false, availableBoardIds: BOARDS })).toEqual({ boardId: "aqa", inferred: false });
  });
});
