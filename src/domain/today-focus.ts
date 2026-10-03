// What Today shows for the single best next step: six plain answers and one
// button. Pure projection of a ranked action, so the layout cannot drift into
// showing scores, weights or any engine term.

import type { RevisionAction } from "./revision-engine";

export interface TodayFocus {
  title: string;
  subject: string;
  duration: string;
  why: string;
  stake: string;
  after: string;
  examLine: string;
  cta: { href: string; label: string };
  skippable: boolean;
}

export function describeFocus(action: RevisionAction, subject: string): TodayFocus {
  const d = action.daysToExam;
  return {
    title: action.title,
    subject,
    duration: `About ${Math.max(1, Math.ceil(action.minutes))} min`,
    why: action.explanation.why,
    stake: action.explanation.stake,
    after: action.explanation.after,
    examLine: d === null ? "No exam date set" : d === 0 ? "Exam today" : `Exam in ${d} day${d === 1 ? "" : "s"}`,
    cta: action.route,
    skippable: action.type === "quick-check",
  };
}
