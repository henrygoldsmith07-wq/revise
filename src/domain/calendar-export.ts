// Calendar export — the plan operating in the student's life, not just in the
// app. Builds an RFC 5545 (.ics) calendar from the same planned sessions and
// exam dates the Schedule screen renders, so Google/Apple/Outlook can remind
// the learner without Revise running a push service. Times are floating
// (no time zone): the plan is generated in the student's local day, and every
// calendar app imports floating times as local — which is what a study
// timetable means.

import type { ActivityKind, ExamDate, IsoDate, PlannedSession } from "./types";

const CRLF = "\r\n";
const PRODID = "-//Revise//Schedule export 1//EN";

const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  learn: "Learn",
  flashcards: "Flashcards",
  recall: "Active recall",
  practice: "Exam questions",
  paper: "Past paper",
  mistakes: "Mistake repair",
};

/** Escape text values per RFC 5545 §3.3.11. */
export function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Floating local datetime in basic format, e.g. 20261005T143000. */
export function icsDateTime(date: IsoDate, startMinute: number): string {
  const hours = Math.floor(startMinute / 60);
  const minutes = startMinute % 60;
  return `${date.replace(/-/g, "")}T${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}00`;
}

/** The ISO date exactly n days after the given date. */
export function isoDatePlusDays(date: IsoDate, days: number): IsoDate {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** Fold a content line at 75 octets per RFC 5545 §3.1 (continuation = CRLF + space). */
export function foldIcsLine(line: string): string {
  const folded: string[] = [];
  let rest = line;
  let first = true;
  while (Buffer.byteLength(rest, "utf8") > 75) {
    let cut = first ? 75 : 74;
    while (cut > 1 && Buffer.byteLength(rest.slice(0, cut), "utf8") > (first ? 75 : 74)) cut -= 1;
    folded.push(rest.slice(0, cut));
    rest = rest.slice(cut);
    first = false;
  }
  folded.push(rest);
  return folded.join(CRLF + " ");
}

/**
 * The .ics text for the current plan: pending sessions as timed events and
 * every future exam as an all-day event. Completed, skipped and missed
 * sessions stay out — the exported calendar is the run-up ahead, not a diary
 * of what already happened.
 */
export function buildIcsCalendar(input: {
  sessions: readonly PlannedSession[];
  exams: readonly ExamDate[];
  subjectName: (subjectId: string) => string;
  calendarName?: string;
}): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(input.calendarName ?? "Revise schedule")}`,
  ];

  for (const session of input.sessions) {
    if (session.status !== "pending") continue;
    const subject = input.subjectName(session.subjectId);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${encodeURIComponent(session.id)}@revise.app`,
      "DTSTAMP:19700101T000000Z",
      `DTSTART:${icsDateTime(session.date, session.startMinute)}`,
      `DTEND:${icsDateTime(session.date, session.startMinute + session.minutes)}`,
      `SUMMARY:${icsEscape(`${subject} — ${ACTIVITY_LABELS[session.activity]}`)}`,
      `DESCRIPTION:${icsEscape(session.reason)}`,
      "END:VEVENT",
    );
  }

  for (const exam of input.exams) {
    const subject = input.subjectName(exam.subjectId);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${encodeURIComponent(exam.id)}-exam@revise.app`,
      "DTSTAMP:19700101T000000Z",
      `DTSTART;VALUE=DATE:${exam.date.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${isoDatePlusDays(exam.date, 1).replace(/-/g, "")}`,
      `SUMMARY:${icsEscape(`${subject} exam`)}`,
      `DESCRIPTION:${icsEscape(exam.label)}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join(CRLF);
}
