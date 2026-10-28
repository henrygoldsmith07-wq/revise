import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { availableBoards } from "@/domain/curriculum";
import { examSittingFor } from "@/domain/exam-series";
import { boardAfterRegionChange } from "@/domain/school-region";
import { OnboardingSchoolStep, type OnboardingSchoolStepProps } from "@/components/OnboardingSchoolStep";
import { OnboardingExamDatesStep } from "@/components/OnboardingExamDatesStep";

// ---------------------------------------------------------------------------
// Onboarding step 1 asks year and school, and a school in Wales preselects
// WJEC (changeable). Step 3 arrives with the WJEC summer 2027 dates filled in,
// labelled with their source, in ordinary editable inputs. Rendered with
// react-dom/server, as the rest of the suite does (no DOM test library here).
// ---------------------------------------------------------------------------

const noop = () => {};
const boards = availableBoards();
const boardIds = boards.map((b) => b.id);

function schoolStep(overrides: Partial<OnboardingSchoolStepProps>) {
  const props: OnboardingSchoolStepProps = {
    yearGroup: undefined,
    onYearGroup: noop,
    unit4Option: undefined,
    onUnit4Option: noop,
    region: undefined,
    onRegion: noop,
    boards,
    boardId: null,
    onBoard: noop,
    boardInferred: false,
    regionBoardMissing: false,
    pickingBoard: false,
    onChangeBoard: noop,
    ...overrides,
  };
  return renderToStaticMarkup(createElement(OnboardingSchoolStep, props));
}

describe("step 1: year, school and board", () => {
  it("asks which year and where the school is, with 44px choices", () => {
    const html = schoolStep({});
    expect(html).toContain("Which year are you in?");
    expect(html).toContain("Where&#x27;s your school?");
    for (const label of ["Year 12", "Year 13", "Not sure", "Wales", "England", "Northern Ireland", "Other"]) expect(html).toContain(`>${label}</button>`);
    expect(html).toContain("min-h-[44px]");
    // Before a region is chosen the board grid is there to pick from directly.
    expect(html).toContain("Which exam board are you studying with?");
  });

  it("Wales preselects WJEC and offers 'Not WJEC? Change board' instead of the grid", () => {
    const choice = boardAfterRegionChange({ region: "wales", currentBoardId: null, currentWasInferred: false, availableBoardIds: boardIds });
    expect(choice).toEqual({ boardId: "wjec", inferred: true });
    const html = schoolStep({ region: "wales", yearGroup: "year-12", boardId: choice.boardId, boardInferred: choice.inferred });
    expect(html).toContain("Exam board: <span class=\"font-semibold\">WJEC</span>");
    expect(html).toContain("Not WJEC? Change board");
    expect(html).not.toContain("Which exam board are you studying with?");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Wales<\/button>/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Year 12<\/button>/);
  });

  it("'Change board' brings the grid back with WJEC still chosen", () => {
    const html = schoolStep({ region: "wales", boardId: "wjec", boardInferred: true, pickingBoard: true });
    expect(html).toContain("Which exam board are you studying with?");
    expect(html).not.toContain("Not WJEC? Change board");
  });

  it("England keeps the grid with nothing preselected", () => {
    const choice = boardAfterRegionChange({ region: "england", currentBoardId: null, currentWasInferred: false, availableBoardIds: boardIds });
    expect(choice.boardId).toBeNull();
    const html = schoolStep({ region: "england", boardId: null });
    expect(html).toContain("Which exam board are you studying with?");
    expect(html).not.toMatch(/aria-pressed="true"[^>]*class="relative w-full/);
  });

  it("Northern Ireland says CCEA is not in Revise yet and shows the grid", () => {
    const html = schoolStep({ region: "northern-ireland", regionBoardMissing: true });
    expect(html).toContain("CCEA isn&#x27;t in Revise yet");
    expect(html).toContain("Which exam board are you studying with?");
  });
});

describe("step 3: exam dates arrive filled in and stay editable", () => {
  const today = "2026-10-28";
  const subjects = [
    { id: "wjec-alevel-biology", name: "Biology" },
    { id: "wjec-alevel-physics", name: "Physics" },
  ];

  it("prefills each Year 12 WJEC date from the timetable with its source line", () => {
    const autoFilled = Object.fromEntries(
      subjects.map((s) => [s.id, examSittingFor({ boardId: "wjec", subjectId: s.id, level: "A Level", yearGroup: "year-12", today })!]),
    );
    const values = Object.fromEntries(subjects.map((s) => [s.id, autoFilled[s.id]!.firstDate]));
    const html = renderToStaticMarkup(
      createElement(OnboardingExamDatesStep, { subjects, values, autoFilled, today, onChange: noop, missing: [], invalidCount: 0 }),
    );
    expect(html).toContain('value="2027-05-13"');
    expect(html).toContain("From the WJEC summer 2027 timetable: AS Unit 1 Thu 13 May (am), AS Unit 2 Thu 20 May (am).");
    expect(html).toContain("Filled in 2 dates from the official timetable");
    expect(html).toContain('aria-label="Biology exam date"');
    expect(html).toContain('aria-describedby="exam-note-wjec-alevel-biology"');
    expect(html).toContain("aria-live=\"polite\"");
    // Editable: a plain date input, never read-only or disabled.
    const inputs = html.match(/<input[^>]*>/g) ?? [];
    expect(inputs).toHaveLength(2);
    for (const input of inputs) {
      expect(input).toContain('type="date"');
      expect(input).not.toMatch(/readonly|disabled/i);
    }
  });

  it("a date the student typed over shows their value and no timetable label", () => {
    const html = renderToStaticMarkup(
      createElement(OnboardingExamDatesStep, {
        subjects: subjects.slice(0, 1),
        values: { "wjec-alevel-biology": "2027-05-01" },
        autoFilled: {},
        today,
        onChange: noop,
        missing: [],
        invalidCount: 0,
      }),
    );
    expect(html).toContain('value="2027-05-01"');
    expect(html).not.toContain("From the WJEC");
  });

  it("a Year 13 AQA date comes from the AQA summer 2027 timetable with its source link", () => {
    const sitting = examSittingFor({ boardId: "aqa", subjectId: "aqa-alevel-biology", level: "A Level", yearGroup: "year-13", today })!;
    const html = renderToStaticMarkup(
      createElement(OnboardingExamDatesStep, {
        subjects: [{ id: "aqa-alevel-biology", name: "Biology" }],
        values: { "aqa-alevel-biology": sitting.firstDate },
        autoFilled: { "aqa-alevel-biology": sitting },
        today,
        onChange: noop,
        missing: [],
        invalidCount: 0,
      }),
    );
    expect(html).toContain('value="2027-06-07"');
    expect(html).toContain("From the AQA summer 2027 timetable: Paper 1 Mon 7 Jun (pm), Paper 2 Mon 14 Jun (pm), Paper 3 Fri 18 Jun (am).");
    expect(html).toContain("Filled in 1 date from the official timetable");
    expect(html).toContain('href="https://www.aqa.org.uk/files/');
    expect(html).not.toContain("Estimated");
  });

  it("an estimate says 'Estimated' and never claims a timetable", () => {
    // Year 13 in autumn 2027 sits in summer 2028, which no board has timetabled yet.
    const sitting = examSittingFor({ boardId: "aqa", subjectId: "aqa-alevel-biology", level: "A Level", yearGroup: "year-13", today: "2027-10-01" })!;
    const html = renderToStaticMarkup(
      createElement(OnboardingExamDatesStep, {
        subjects: [{ id: "aqa-alevel-biology", name: "Biology" }],
        values: { "aqa-alevel-biology": sitting.firstDate },
        autoFilled: { "aqa-alevel-biology": sitting },
        today: "2027-10-01",
        onChange: noop,
        missing: [],
        invalidCount: 0,
      }),
    );
    expect(html).toContain("Estimated: the summer 2028 series usually runs mid-May to late June.");
    expect(html).toContain("Filled in 1 estimated date");
    expect(html).not.toContain("official timetable");
  });

  it("Onboarding wires the region, the auto-filled sittings and their save path", () => {
    const flow = readFileSync(resolve(process.cwd(), "src/components/Onboarding.tsx"), "utf8");
    expect(flow).toContain("boardAfterRegionChange(");
    expect(flow).toContain("examSittingFor({ boardId, subjectId: subject.id, level: row.level, yearGroup, today })");
    expect(flow).toContain("examRowsForSitting(");
    // Typing over (or clearing) an auto-filled date makes the student's value win.
    expect(flow).toContain("!(id in examDates)");
  });
});
