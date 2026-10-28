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
//   (final) timetable and is recorded below with its source. Nothing else is.
// - A board's provisional timetable would be "provisional" and say so; none is
//   used today because every board below has published its final 2027 one.
// - Anything else is "estimated": the usual start of the summer series, which
//   the plan can pace towards, labelled as an estimate and never as a date.
// - GCSE subjects and an unknown year group get nothing (the field stays blank).
// ---------------------------------------------------------------------------

import { unitPaperSpecId } from "./exam-timetable";
import type { ExamDate, Id, IsoDate } from "./types";
import type { YearGroup } from "./year-group";

export interface TimetabledPaper {
  /** WJEC unit number, or the paper number for a linear board (AQA Paper 2 -> 2). */
  unit: number;
  date: IsoDate;
  session: "am" | "pm";
  /** The board's component code, e.g. "7402/1" (linear boards only). */
  code?: string;
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

/**
 * Linear A levels (all papers sat at the end of Year 13), summer 2027 FINAL
 * timetables, each read off the board's own PDF and checked 28 Oct 2026.
 * Paper numbers match each subject's paper list in src/domain/curriculum.
 */
export interface LinearBoardTimetable {
  boardName: string;
  seriesYear: number;
  status: "timetabled" | "provisional";
  sourceUrl: string;
  checked: IsoDate;
  subjects: Readonly<Record<Id, readonly TimetabledPaper[]>>;
}

/**
 * AQA "Exam timetable May/June 2027 - AS, A-level, Applied General, Level 3
 * Certificates and Level 3 Extended Project" (confirmed timetable, Version 1.2),
 * linked from https://www.aqa.org.uk/exams-administration/dates-and-timetables
 */
export const AQA_SUMMER_2027_SOURCE =
  "https://www.aqa.org.uk/files/f8837da9-1846-4e7f-89a3-fb265c42f2e5/0ada6c345d4c272c8a4a42e48a5986983bfb0d56.pdf";

/**
 * Pearson Edexcel GCE Summer 2027 Examination Timetable - FINAL, linked from
 * https://qualifications.pearson.com/en/support/support-topics/exams/exam-timetables.html
 * Revise's Edexcel Biology is 9BI0 (Biology B); Biology A (Salters-Nuffield, 9BN0)
 * sits in the same three slots.
 */
export const PEARSON_SUMMER_2027_SOURCE =
  "https://qualifications.pearson.com/content/dam/pdf/Support/Examination-timetables/gce-summer-2027-final.pdf";

/**
 * Cambridge OCR AS and A Level, FSMQ and Level 3 Certificate Core Maths, Final
 * Examination Timetable June 2027, linked from
 * https://www.ocr.org.uk/administration/key-dates-and-timetables
 */
export const OCR_SUMMER_2027_SOURCE =
  "https://www.ocr.org.uk/Images/758622-june-2027-final-exam-timetable-as-a-level-core-maths-and-fsmq.pdf";

const paper = (unit: number, code: string, date: IsoDate, session: "am" | "pm"): TimetabledPaper => ({ unit, code, date, session });

const LINEAR_GCE_TIMETABLES: Readonly<Record<Id, readonly LinearBoardTimetable[]>> = {
  aqa: [
    {
      boardName: "AQA",
      seriesYear: 2027,
      status: "timetabled",
      sourceUrl: AQA_SUMMER_2027_SOURCE,
      checked: "2026-10-28",
      subjects: {
        "aqa-alevel-biology": [paper(1, "7402/1", "2027-06-07", "pm"), paper(2, "7402/2", "2027-06-14", "pm"), paper(3, "7402/3", "2027-06-18", "am")],
        "aqa-alevel-chemistry": [paper(1, "7405/1", "2027-05-28", "am"), paper(2, "7405/2", "2027-06-10", "am"), paper(3, "7405/3", "2027-06-17", "am")],
        "aqa-alevel-physics": [paper(1, "7408/1", "2027-05-21", "am"), paper(2, "7408/2", "2027-05-27", "pm"), paper(3, "7408/3", "2027-06-08", "am")],
        "aqa-alevel-maths": [paper(1, "7357/1", "2027-05-26", "pm"), paper(2, "7357/2", "2027-06-09", "pm"), paper(3, "7357/3", "2027-06-16", "pm")],
        "aqa-alevel-computer-science": [paper(1, "7517/1", "2027-06-07", "pm"), paper(2, "7517/2", "2027-06-15", "am")],
        "aqa-alevel-economics": [paper(1, "7136/1", "2027-05-10", "am"), paper(2, "7136/2", "2027-05-17", "pm"), paper(3, "7136/3", "2027-06-07", "am")],
        "aqa-alevel-psychology": [paper(1, "7182/1", "2027-05-18", "am"), paper(2, "7182/2", "2027-05-25", "am"), paper(3, "7182/3", "2027-06-09", "am")],
      },
    },
  ],
  edexcel: [
    {
      boardName: "Pearson Edexcel",
      seriesYear: 2027,
      status: "timetabled",
      sourceUrl: PEARSON_SUMMER_2027_SOURCE,
      checked: "2026-10-28",
      subjects: {
        "edexcel-alevel-biology": [paper(1, "9BI0 01", "2027-06-07", "pm"), paper(2, "9BI0 02", "2027-06-14", "pm"), paper(3, "9BI0 03", "2027-06-18", "am")],
        "edexcel-alevel-chemistry": [paper(1, "9CH0 01", "2027-05-28", "am"), paper(2, "9CH0 02", "2027-06-10", "am"), paper(3, "9CH0 03", "2027-06-17", "am")],
        "edexcel-alevel-physics": [paper(1, "9PH0 01", "2027-05-21", "am"), paper(2, "9PH0 02", "2027-05-27", "pm"), paper(3, "9PH0 03", "2027-06-08", "am")],
        "edexcel-alevel-maths": [paper(1, "9MA0 01", "2027-05-26", "pm"), paper(2, "9MA0 02", "2027-06-09", "pm"), paper(3, "9MA0 03", "2027-06-16", "pm")],
      },
    },
  ],
  ocr: [
    {
      boardName: "OCR",
      seriesYear: 2027,
      status: "timetabled",
      sourceUrl: OCR_SUMMER_2027_SOURCE,
      checked: "2026-10-28",
      subjects: {
        "ocr-alevel-biology": [paper(1, "H420/01", "2027-06-07", "pm"), paper(2, "H420/02", "2027-06-14", "pm"), paper(3, "H420/03", "2027-06-18", "am")],
        "ocr-alevel-chemistry": [paper(1, "H432/01", "2027-05-28", "am"), paper(2, "H432/02", "2027-06-10", "am"), paper(3, "H432/03", "2027-06-17", "am")],
        "ocr-alevel-physics": [paper(1, "H556/01", "2027-05-21", "am"), paper(2, "H556/02", "2027-05-27", "pm"), paper(3, "H556/03", "2027-06-08", "am")],
        "ocr-alevel-maths": [paper(1, "H240/01", "2027-05-26", "pm"), paper(2, "H240/02", "2027-06-09", "pm"), paper(3, "H240/03", "2027-06-16", "pm")],
      },
    },
  ],
};

/** The recorded timetable for a linear-board subject in a series, or undefined (then it is an estimate). */
export function linearTimetableFor(boardId: Id, subjectId: Id, seriesYear: number): { timetable: LinearBoardTimetable; papers: readonly TimetabledPaper[] } | undefined {
  const timetable = LINEAR_GCE_TIMETABLES[boardId]?.find((entry) => entry.seriesYear === seriesYear);
  const papers = timetable?.subjects[subjectId];
  return timetable && papers ? { timetable, papers } : undefined;
}

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
  /** timetabled = the board's final timetable; provisional = its published provisional one; estimated = no timetable. */
  status: "timetabled" | "provisional" | "estimated";
  /** What the board calls each sitting: WJEC "unit", linear boards "paper". */
  kind: "unit" | "paper";
  /** Earliest paper (timetabled) or the usual series start (estimated). The plan paces to this. */
  firstDate: IsoDate;
  /** Each unit or paper, only when timetabled or provisional. */
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
      kind: "unit",
      firstDate: papers[0]!.date,
      papers,
      note: `From the WJEC summer ${seriesYear} timetable: ${papers.map((p) => `${unitLabel} Unit ${p.unit} ${shortDate(p.date)} (${p.session})`).join(", ")}.`,
      sourceUrl: WJEC_SUMMER_2027_SOURCE,
    };
  }

  const linear = unitised ? undefined : linearTimetableFor(boardId, subjectId, seriesYear);
  if (linear) {
    const papers = linear.papers.filter((paper) => paper.date >= today);
    if (!papers.length) return null;
    const { timetable } = linear;
    const prefix = timetable.status === "provisional" ? `From the ${timetable.boardName} provisional summer ${seriesYear} timetable` : `From the ${timetable.boardName} summer ${seriesYear} timetable`;
    return {
      subjectId,
      seriesYear,
      status: timetable.status,
      kind: "paper",
      firstDate: papers[0]!.date,
      papers,
      note: `${prefix}: ${papers.map((p) => `Paper ${p.unit} ${shortDate(p.date)} (${p.session})`).join(", ")}.`,
      sourceUrl: timetable.sourceUrl,
    };
  }

  const firstDate = estimatedSeriesStart(seriesYear);
  if (firstDate < today) return null;
  return {
    subjectId,
    seriesYear,
    status: "estimated",
    kind: unitised ? "unit" : "paper",
    firstDate,
    papers: [],
    note: `Estimated: the summer ${seriesYear} series usually runs mid-May to late June. Change it when your school confirms the date.`,
  };
}

/**
 * The ExamDate rows to save for an auto-filled sitting.
 * - WJEC timetabled: one row per unit paper (paperSpecId "<subject>.u<N>", the
 *   per-unit timetable's own form) when the subject knows that paper.
 * - Linear board timetabled (or provisional): one row per paper, labelled
 *   "<Subject> Paper N", with no paperSpecId. Every topic can come up on any
 *   paper of a linear A level, so each topic counts down to the next paper
 *   still ahead, and the whole-subject rules keep working.
 * - Otherwise, and for an estimate, one whole-subject row on the first date.
 *   An estimate says so in its label, wherever the label is shown later.
 */
export function examRowsForSitting(input: {
  sitting: ExamSitting;
  subject: { id: Id; name: string; paperIds: readonly Id[] };
  userId: Id;
  newId: () => Id;
}): ExamDate[] {
  const { sitting, subject, userId, newId } = input;
  if (sitting.status !== "estimated" && sitting.kind === "paper" && sitting.papers.length) {
    const suffix = sitting.status === "provisional" ? " (provisional)" : "";
    return sitting.papers.map((paper) => ({
      id: newId(),
      userId,
      subjectId: subject.id,
      date: paper.date,
      label: `${subject.name} Paper ${paper.unit}${suffix}`,
    }));
  }
  const perUnit = sitting.status === "timetabled" && sitting.kind === "unit" && sitting.papers.every((p) => subject.paperIds.includes(unitPaperSpecId(subject.id, p.unit)));
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
