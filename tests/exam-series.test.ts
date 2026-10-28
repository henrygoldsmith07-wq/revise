import { describe, expect, it } from "vitest";
import { getSubject } from "@/domain/curriculum";
import {
  AQA_SUMMER_2027_SOURCE,
  OCR_SUMMER_2027_SOURCE,
  PEARSON_SUMMER_2027_SOURCE,
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

describe("examSittingFor: linear boards from their official summer 2027 timetables", () => {
  const dates = (subjectId: string, boardId: string) => sitting(subjectId, "year-13", AUTUMN, boardId)?.papers.map((p) => [p.unit, p.date, p.session]);

  it("Year 13 AQA Biology returns all three papers from the AQA timetable", () => {
    const result = sitting("aqa-alevel-biology", "year-13", AUTUMN, "aqa");
    expect(result?.status).toBe("timetabled");
    expect(result?.kind).toBe("paper");
    expect(result?.seriesYear).toBe(2027);
    expect(result?.firstDate).toBe("2027-06-07");
    expect(result?.papers.map((p) => [p.unit, p.code, p.date, p.session])).toEqual([
      [1, "7402/1", "2027-06-07", "pm"],
      [2, "7402/2", "2027-06-14", "pm"],
      [3, "7402/3", "2027-06-18", "am"],
    ]);
    expect(result?.note).toBe("From the AQA summer 2027 timetable: Paper 1 Mon 7 Jun (pm), Paper 2 Mon 14 Jun (pm), Paper 3 Fri 18 Jun (am).");
    expect(result?.sourceUrl).toBe(AQA_SUMMER_2027_SOURCE);
  });

  it("covers every AQA A level Revise offers", () => {
    expect(dates("aqa-alevel-chemistry", "aqa")).toEqual([[1, "2027-05-28", "am"], [2, "2027-06-10", "am"], [3, "2027-06-17", "am"]]);
    expect(dates("aqa-alevel-physics", "aqa")).toEqual([[1, "2027-05-21", "am"], [2, "2027-05-27", "pm"], [3, "2027-06-08", "am"]]);
    expect(dates("aqa-alevel-maths", "aqa")).toEqual([[1, "2027-05-26", "pm"], [2, "2027-06-09", "pm"], [3, "2027-06-16", "pm"]]);
    expect(dates("aqa-alevel-computer-science", "aqa")).toEqual([[1, "2027-06-07", "pm"], [2, "2027-06-15", "am"]]);
    expect(dates("aqa-alevel-economics", "aqa")).toEqual([[1, "2027-05-10", "am"], [2, "2027-05-17", "pm"], [3, "2027-06-07", "am"]]);
    expect(dates("aqa-alevel-psychology", "aqa")).toEqual([[1, "2027-05-18", "am"], [2, "2027-05-25", "am"], [3, "2027-06-09", "am"]]);
  });

  it("covers Pearson Edexcel and OCR A level sciences and maths", () => {
    expect(sitting("edexcel-alevel-biology", "year-13", AUTUMN, "edexcel")?.sourceUrl).toBe(PEARSON_SUMMER_2027_SOURCE);
    expect(sitting("edexcel-alevel-biology", "year-13", AUTUMN, "edexcel")?.note).toContain("From the Pearson Edexcel summer 2027 timetable");
    expect(dates("edexcel-alevel-biology", "edexcel")).toEqual([[1, "2027-06-07", "pm"], [2, "2027-06-14", "pm"], [3, "2027-06-18", "am"]]);
    expect(dates("edexcel-alevel-chemistry", "edexcel")).toEqual([[1, "2027-05-28", "am"], [2, "2027-06-10", "am"], [3, "2027-06-17", "am"]]);
    expect(dates("edexcel-alevel-physics", "edexcel")).toEqual([[1, "2027-05-21", "am"], [2, "2027-05-27", "pm"], [3, "2027-06-08", "am"]]);
    expect(dates("edexcel-alevel-maths", "edexcel")).toEqual([[1, "2027-05-26", "pm"], [2, "2027-06-09", "pm"], [3, "2027-06-16", "pm"]]);
    expect(sitting("ocr-alevel-physics", "year-13", AUTUMN, "ocr")?.sourceUrl).toBe(OCR_SUMMER_2027_SOURCE);
    expect(dates("ocr-alevel-biology", "ocr")).toEqual([[1, "2027-06-07", "pm"], [2, "2027-06-14", "pm"], [3, "2027-06-18", "am"]]);
    expect(dates("ocr-alevel-chemistry", "ocr")).toEqual([[1, "2027-05-28", "am"], [2, "2027-06-10", "am"], [3, "2027-06-17", "am"]]);
    expect(dates("ocr-alevel-physics", "ocr")).toEqual([[1, "2027-05-21", "am"], [2, "2027-05-27", "pm"], [3, "2027-06-08", "am"]]);
    expect(dates("ocr-alevel-maths", "ocr")).toEqual([[1, "2027-05-26", "pm"], [2, "2027-06-09", "pm"], [3, "2027-06-16", "pm"]]);
  });

  it("every recorded paper number matches a paper on the subject's spec", () => {
    const ids = [
      ["aqa", ["biology", "chemistry", "physics", "maths", "computer-science", "economics", "psychology"]],
      ["edexcel", ["biology", "chemistry", "physics", "maths"]],
      ["ocr", ["biology", "chemistry", "physics", "maths"]],
    ] as const;
    for (const [board, names] of ids) {
      for (const name of names) {
        const subjectId = `${board}-alevel-${name}`;
        const spec = getSubject(subjectId);
        expect(spec, subjectId).toBeDefined();
        const papers = sitting(subjectId, "year-13", AUTUMN, board)!.papers;
        expect(papers.length, subjectId).toBe(spec!.papers.length);
        for (const p of papers) expect(spec!.papers.map((x) => x.id), subjectId).toContain(`${subjectId}.p${p.unit}`);
      }
    }
  });

  it("drops a paper already sat, and returns nothing once the last one is over", () => {
    expect(sitting("aqa-alevel-biology", "year-13", "2027-06-10", "aqa")?.papers.map((p) => p.unit)).toEqual([2, 3]);
    expect(sitting("aqa-alevel-biology", "year-13", "2027-06-19", "aqa")).toBeNull();
  });

  it("Year 12 on a linear board sits in summer 2028, which is not timetabled, so it stays an estimate", () => {
    const y12 = sitting("aqa-alevel-biology", "year-12", AUTUMN, "aqa");
    expect(y12?.status).toBe("estimated");
    expect(y12?.seriesYear).toBe(2028);
    expect(y12?.firstDate).toBe("2028-05-08");
    expect(y12?.note).toContain("summer 2028");
    expect(y12?.sourceUrl).toBeUndefined();
  });

  it("a subject with no recorded timetable falls back to the labelled estimate", () => {
    const unknown = sitting("aqa-alevel-history", "year-13", AUTUMN, "aqa");
    expect(unknown?.status).toBe("estimated");
    expect(unknown?.firstDate).toBe("2027-05-10");
    expect(unknown?.papers).toEqual([]);
    expect(unknown?.note).toMatch(/^Estimated/);
    // A board's dates never leak onto another board's subject id.
    expect(sitting("aqa-alevel-biology", "year-13", AUTUMN, "ocr")?.status).toBe("estimated");
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

  it("a timetabled linear sitting becomes one whole-subject row per paper, so every topic counts to the next paper", () => {
    let n = 0;
    const rows = examRowsForSitting({
      sitting: sitting("ocr-alevel-chemistry", "year-13", AUTUMN, "ocr")!,
      subject: { id: "ocr-alevel-chemistry", name: "Chemistry", paperIds: ["ocr-alevel-chemistry.p1", "ocr-alevel-chemistry.p2", "ocr-alevel-chemistry.p3"] },
      userId: "u",
      newId: () => `id-${++n}`,
    });
    expect(rows.map((r) => [r.label, r.date, r.paperSpecId])).toEqual([
      ["Chemistry Paper 1", "2027-05-28", undefined],
      ["Chemistry Paper 2", "2027-06-10", undefined],
      ["Chemistry Paper 3", "2027-06-17", undefined],
    ]);
  });

  it("an estimate is one whole-subject row whose label says it is estimated", () => {
    const rows = examRowsForSitting({
      sitting: sitting("aqa-alevel-biology", "year-12", AUTUMN, "aqa")!,
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
