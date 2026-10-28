// ---------------------------------------------------------------------------
// Which exam sitting is next for a student, from their year group, board and
// subject, so onboarding can fill in exam dates instead of asking for them.
//
// WJEC A level is unitised: Year 12 sits the AS units (1 and 2) and Year 13
// the A2 units (3 and 4), both in the summer series that ends the current
// academic year (September to August). AQA, Pearson Edexcel and OCR A levels
// are linear: every paper is sat at the end of Year 13, so a Year 12 student's
// sitting is the following summer.
//
// Honesty rules:
// - A date is "timetabled" only when it was read off the board's official
//   timetable and is recorded below with its source. Nothing else is.
// - Anything else is "estimated": the usual start of the summer series, which
//   the plan can pace towards, labelled as an estimate and never as a date.
// - GCSE subjects and an unknown year group get nothing (the field stays blank).
// ---------------------------------------------------------------------------

import { unitPaperSpecId } from "./exam-timetable";
import type { ExamDate, Id, IsoDate } from "./types";
import type { YearGroup } from "./year-group";

export interface TimetabledPaper {
  unit: number;
  date: IsoDate;
  session: "am" | "pm";
}

/**
 * WJEC (Wales) GCE AS/A level, Summer 2027 FINAL examination timetable.
 * Source: https://www.wjec.co.uk/media/nwjexxw0/summer-2027-wales-and-eduqas-asplusa-level-final-version.pdf
 * linked from https://www.wjec.co.uk/en/home/administration/key-dates-and-timetables/
 * Checked 28 Oct 2026 against the PDF's page images (blue "WALES" rows only, not Eduqas).
 * Paper codes: Biology 2400U10/2400U20 (AS), 1400U30/1400U40 (A2); Chemistry 2410/1410;
 * Physics 2420/1420; Mathematics 2300/1300. Contingency day: Wednesday 23 June 2027.
 */
export const WJEC_SUMMER_2027_SOURCE =
  "https://www.wjec.co.uk/media/nwjexxw0/summer-2027-wales-and-eduqas-asplusa-level-final-version.pdf";

const WJEC_GCE_TIMETABLE: Readonly<Record<number, Readonly<Record<Id, readonly TimetabledPaper[]>>>> = {
  2027: {
    "wjec-alevel-biology": [
      { unit: 1, date: "2027-05-13", session: "am" },
      { unit: 2, date: "2027-05-20", session: "am" },
      { unit: 3, date: "2027-06-07", session: "pm" },
      { unit: 4, date: "2027-06-14", session: "pm" },
    ],
    "wjec-alevel-chemistry": [
      { unit: 1, date: "2027-05-11", session: "am" },
      { unit: 2, date: "2027-05-18", session: "am" },
      { unit: 3, date: "2027-05-28", session: "am" },
      { unit: 4, date: "2027-06-10", session: "am" },
    ],
    "wjec-alevel-physics": [
      { unit: 1, date: "2027-05-13", session: "pm" },
      { unit: 2, date: "2027-05-18", session: "pm" },
      { unit: 3, date: "2027-05-27", session: "pm" },
      { unit: 4, date: "2027-06-08", session: "am" },
    ],
    "wjec-alevel-maths": [
      { unit: 1, date: "2027-05-12", session: "am" },
      { unit: 2, date: "2027-05-21", session: "pm" },
      { unit: 3, date: "2027-05-25", session: "am" },
      { unit: 4, date: "2027-06-09", session: "pm" },
    ],
  },
};

/** The summer series that ends the academic year `today` falls in (September starts the next one). */
export function examSeriesYear(today: IsoDate): number {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return month >= 9 ? year + 1 : year;
}

/**
 * The usual first day of a summer series: the second Monday in May (Monday
 * 10 May in 2027, when the WJEC GCE timetable above starts). Only ever used
 * as a labelled estimate.
 */
export function estimatedSeriesStart(seriesYear: number): IsoDate {
  const firstOfMay = new Date(Date.UTC(seriesYear, 4, 1));
  const toMonday = (8 - firstOfMay.getUTCDay()) % 7;
  const day = 1 + toMonday + 7;
  return `${seriesYear}-05-${String(day).padStart(2, "0")}`;
}

export interface ExamSitting {
  subjectId: Id;
  seriesYear: number;
  status: "timetabled" | "estimated";
  /** Earliest paper (timetabled) or the usual series start (estimated). The plan paces to this. */
  firstDate: IsoDate;
  /** Each unit paper, only when timetabled. */
  papers: readonly TimetabledPaper[];
  /** Short line shown beside the date. */
  note: string;
  sourceUrl?: string;
}

const UNITISED_BOARDS = new Set(["wjec"]);

/** The next sitting for one subject, or null when Revise cannot say (GCSE, unknown year, already sat). */
export function examSittingFor(input: {
  boardId: Id;
  subjectId: Id;
  level: string;
  yearGroup: YearGroup | undefined;
  today: IsoDate;
}): ExamSitting | null {
  const { boardId, subjectId, level, yearGroup, today } = input;
  if (!yearGroup || level !== "A Level") return null;
  const series = examSeriesYear(today);
  const unitised = UNITISED_BOARDS.has(boardId);
  const seriesYear = unitised || yearGroup === "year-13" ? series : series + 1;
  const units = unitised ? (yearGroup === "year-12" ? [1, 2] : [3, 4]) : [];

  const timetabled = unitised ? WJEC_GCE_TIMETABLE[seriesYear]?.[subjectId] : undefined;
  if (timetabled) {
    const papers = timetabled.filter((paper) => units.includes(paper.unit) && paper.date >= today);
    if (!papers.length) return null;
    const unitLabel = yearGroup === "year-12" ? "AS" : "A2";
    return {
      subjectId,
      seriesYear,
      status: "timetabled",
      firstDate: papers[0]!.date,
      papers,
      note: `From the WJEC summer ${seriesYear} timetable: ${papers.map((p) => `${unitLabel} Unit ${p.unit} ${shortDate(p.date)} (${p.session})`).join(", ")}.`,
      sourceUrl: WJEC_SUMMER_2027_SOURCE,
    };
  }

  const firstDate = estimatedSeriesStart(seriesYear);
  if (firstDate < today) return null;
  return {
    subjectId,
    seriesYear,
    status: "estimated",
    firstDate,
    papers: [],
    note: `Estimated: the summer ${seriesYear} series usually runs mid-May to late June. Change it when your school confirms the date.`,
  };
}

/**
 * The ExamDate rows to save for an auto-filled sitting. A timetabled sitting
 * becomes one row per unit paper (paperSpecId "<subject>.u<N>", the per-unit
 * timetable's own form) when the subject knows that paper; otherwise, and for
 * an estimate, one whole-subject row on the first date. An estimate says so
 * in its label, wherever the label is shown later.
 */
export function examRowsForSitting(input: {
  sitting: ExamSitting;
  subject: { id: Id; name: string; paperIds: readonly Id[] };
  userId: Id;
  newId: () => Id;
}): ExamDate[] {
  const { sitting, subject, userId, newId } = input;
  const perUnit = sitting.status === "timetabled" && sitting.papers.every((p) => subject.paperIds.includes(unitPaperSpecId(subject.id, p.unit)));
  if (perUnit && sitting.papers.length) {
    return sitting.papers.map((paper) => ({
      id: newId(),
      userId,
      subjectId: subject.id,
      paperSpecId: unitPaperSpecId(subject.id, paper.unit),
      date: paper.date,
      label: `${subject.name} Unit ${paper.unit}`,
    }));
  }
  return [
    {
      id: newId(),
      userId,
      subjectId: subject.id,
      date: sitting.firstDate,
      label: sitting.status === "estimated" ? `${subject.name} exams (estimated start)` : `${subject.name} exam`,
    },
  ];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2027-05-13" -> "Thu 13 May". */
export function shortDate(date: IsoDate): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[parsed.getUTCDay()]} ${parsed.getUTCDate()} ${MONTHS[parsed.getUTCMonth()]}`;
}
