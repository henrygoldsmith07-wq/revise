"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { countdownGuidance } from "@/domain/exam-countdown";
import { plannedSessionHref } from "@/domain/study-navigation";
import { buildIcsCalendar } from "@/domain/calendar-export";
import { getSubject, getTopic } from "@/domain/curriculum";
import { formatTime } from "@/domain/planner";
import type { ActivityKind, ExamDate, PlannedSession } from "@/domain/types";
import { addLocalDays, todayLocal, toLocalDateKey } from "@/domain/local-date";
import { useStoreFields, useSubjects } from "@/state/store";
import { Button, ButtonLink, EmptyState, Pill, SectionHeading } from "@/components/ui";
import { useRevisionPlan } from "@/components/recovery-evidence";
import { todayPick, type TodayPick } from "@/domain/today-pick";

// The personalised schedule: the planner's output over the whole remaining
// run-up to each exam. Everything here is derived state — the planner rebuilds
// it whenever availability, exam dates or targets change, and Review
// and Practice tick blocks off as they are finished. This page only reads and
// groups that plan; the one mutation is an explicit rebuild.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  learn: "Learn",
  flashcards: "Cards",
  recall: "Recall",
  practice: "Exam questions",
  paper: "Full paper",
  mistakes: "Mistake repair",
};

function dateKey(d: Date): string {
  return toLocalDateKey(d);
}
function addDays(key: string, days: number): string {
  return addLocalDays(key, days);
}
function dayDiff(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000,
  );
}
/** "12 Oct" — one format for both ends of a week header. */
function dayMonth(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
function humanDate(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export default function SchedulePage() {
  const store = useStoreFields("adaptiveSession", "examDates", "planChangelog", "plannedSessions", "regeneratePlan", "revisionCheckpoint", "settings");
  // Today's one recommendation, read from the same ranked plan and the same
  // choice Today makes (todayPick), so Schedule's "Today" names the same next
  // step instead of only warning that the two can differ.
  const { plan } = useRevisionPlan();
  const pick: TodayLead | null = store.revisionCheckpoint
    ? { kind: "resume" }
    : (() => { const p = todayPick(plan.top, store.adaptiveSession); return p ? { kind: "pick", pick: p } : null; })();
  const subjects = useSubjects();
  const [rebuilding, setRebuilding] = useState(false);
  const autoBuilt = useRef(false);

  const today = todayLocal();
  const sessions = useMemo(
    () => store.plannedSessions.filter((s) => s.date >= today).sort((a, b) => (a.date === b.date ? a.startMinute - b.startMinute : a.date < b.date ? -1 : 1)),
    [store.plannedSessions, today],
  );
  const exams = useMemo(
    () =>
      store.examDates
        .filter((e) => store.settings.subjectIds.includes(e.subjectId) && e.date >= today)
        .sort((a, b) => (a.date === b.date ? a.subjectId.localeCompare(b.subjectId) : a.date < b.date ? -1 : 1)),
    [store.examDates, store.settings.subjectIds, today],
  );

  // A fresh profile has exams but no plan yet (the old Plan screen used to
  // build one on first visit). Build it once so the calendar is never empty
  // when there is something to plan for.
  const weeklyMinutes = store.settings.availability.reduce((a, row) => a + row.minutes, 0);
  const planIsEmpty = sessions.length === 0 && weeklyMinutes > 0;
  useEffect(() => {
    if (planIsEmpty && exams.length > 0 && !autoBuilt.current) {
      autoBuilt.current = true;
      void store.regeneratePlan();
    }
  }, [exams.length, planIsEmpty, store]);

  const pendingCount = sessions.filter((s) => s.status === "pending").length;
  const planEnd = sessions.map((s) => s.date).sort().at(-1);
  const calendarEnd = exams.map((e) => e.date).sort().at(-1) ?? planEnd ?? today;

  async function rebuild() {
    setRebuilding(true);
    try {
      await store.regeneratePlan();
    } finally {
      setRebuilding(false);
    }
  }

  /** Download the plan + exams as an .ics any calendar app can import. */
  function downloadIcs() {
    const ics = buildIcsCalendar({
      sessions,
      exams,
      subjectName: (id) => getSubject(id)?.name ?? id,
    });
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "revise-schedule.ics";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!subjects.length) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Schedule</h1>
          <p className="text-sm text-ink3 mt-0.5">
            Your exam run-up adapts to dates, availability and targets. Rebuild to include your latest answers.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={downloadIcs}>
            Add to calendar
          </Button>
          <Button variant="secondary" size="sm" disabled={rebuilding} onClick={() => void rebuild()}>
            {rebuilding ? "Rebuilding…" : "Rebuild schedule"}
          </Button>
        </div>
      </header>

      {store.planChangelog.length ? (
        <section aria-label="Last rebuild" className="card px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Last rebuild</p>
          <ul className="mt-1.5 space-y-1">
            {store.planChangelog.map((line, i) => (
              <li key={i} className="text-xs text-ink2 leading-snug">
                {line}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {exams.length ? (
        <section aria-label="Exam run-up">
          <SectionHeading
            title="Exam run-up"
            hint="Subjects are weighted by how far below target they are and how close the exam is."
          />
          <ul className="card divide-y divide-line">
            {exams.map((exam) => {
              const subject = getSubject(exam.subjectId);
              const subjectSessions = sessions.filter((s) => s.subjectId === exam.subjectId);
              const done = subjectSessions.filter((s) => s.status === "done").length;
              const subjectTopics = new Set(subjectSessions.map((s) => s.topicId).filter(Boolean)).size;
              const days = dayDiff(today, exam.date);
              const guidance = countdownGuidance(days);
              return (
                <li key={exam.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">
                      {subject?.name ?? exam.subjectId}
                      <span className="ml-2 text-[11px] font-normal text-ink3">{exam.label}</span>
                    </p>
                    <Pill tone={days <= 7 ? "review" : days <= 30 ? "accent" : undefined}>
                      {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days} days`}
                    </Pill>
                  </div>
                  <p className="text-[11px] text-ink3 mt-0.5">
                    {humanDate(exam.date)} · {subjectSessions.length} planned block{subjectSessions.length === 1 ? "" : "s"}
                    {subjectTopics ? ` · ${subjectTopics} topic${subjectTopics === 1 ? "" : "s"}` : ""}
                    {done ? ` · ${done} done` : ""}
                  </p>
                  <p className="text-[11px] text-ink2 mt-1 leading-snug">
                    <span className="font-semibold text-ink">{guidance.label}</span>
                    <span className="text-ink3"> — {guidance.strategy}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {sessions.length === 0 ? (
        <EmptyState
          title={exams.length ? "No schedule yet" : "Nothing scheduled ahead"}
          body={
            weeklyMinutes === 0
              ? "Set your weekly study hours in Settings first — the schedule is built on the time you actually have."
              : exams.length
                ? "Your study hours and exams are set — build the schedule and it lays out the run-up to each exam."
                : "Add exam dates in Settings and the run-up to each one will be scheduled here."
          }
          action={
            weeklyMinutes > 0 && exams.length ? (
              <Button onClick={() => void rebuild()} disabled={rebuilding}>
                {rebuilding ? "Building…" : "Build my schedule"}
              </Button>
            ) : null
          }
        />
      ) : null}

      {sessions.length ? (
        <section aria-label="Planned days">
          <SectionHeading title="Planned days" hint={`${pendingCount} block${pendingCount === 1 ? "" : "s"} to do from ${today === sessions[0]?.date ? "today" : humanDate(sessions[0]?.date ?? today)}`} />
          <CalendarDays sessions={sessions} exams={exams} today={today} calendarEnd={calendarEnd} lead={pick} />
        </section>
      ) : null}

      {pendingCount > 0 ? (
        <p className="text-[11px] text-ink3">
          Cards, active-recall and exam-question blocks tick off when you finish them from the link. Learn and full-paper
          blocks roll forward if a day is missed, so nothing silently disappears.
        </p>
      ) : null}
    </div>
  );
}

/** What Today leads with: a session in progress, or its one recommendation. */
type TodayLead = { kind: "resume" } | { kind: "pick"; pick: TodayPick };

function CalendarDays({
  sessions,
  exams,
  today,
  calendarEnd,
  lead,
}: {
  sessions: PlannedSession[];
  exams: ExamDate[];
  today: string;
  calendarEnd: string;
  lead: TodayLead | null;
}) {
  const byDate = new Map<string, PlannedSession[]>();
  for (const session of sessions) {
    const rows = byDate.get(session.date) ?? [];
    rows.push(session);
    byDate.set(session.date, rows);
  }
  const examByDate = new Map<string, ExamDate[]>();
  for (const exam of exams) {
    const rows = examByDate.get(exam.date) ?? [];
    rows.push(exam);
    examByDate.set(exam.date, rows);
  }

  // Render the dates that matter — blocks or exams — grouped under their week.
  const weeks = new Map<string, { start: string; days: string[] }>();
  for (let offset = 0; offset <= dayDiff(today, calendarEnd); offset++) {
    const key = addDays(today, offset);
    // Today is always shown when Today has something to lead with.
    if (!byDate.has(key) && !examByDate.has(key) && !(key === today && lead)) continue;
    const d = new Date(`${key}T00:00:00Z`);
    const monday = dateKey(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000));
    const week = weeks.get(monday) ?? { start: monday, days: [] };
    week.days.push(key);
    weeks.set(monday, week);
  }

  return (
    <div className="space-y-6">
      {[...weeks.entries()].map(([monday, week]) => {
        const sunday = addDays(monday, 6);
        return (
          <section key={monday} aria-label={`Week of ${humanDate(monday)}`}>
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1.5">
              Week of {dayMonth(monday)} – {dayMonth(sunday)}
            </p>
            <div className="space-y-2">
              {week.days.map((key) => (
                <DayCard key={key} date={key} sessions={byDate.get(key) ?? []} exams={examByDate.get(key) ?? []} today={today} lead={key === today ? lead : null} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DayCard({ date, sessions, exams, today, lead }: { date: string; sessions: PlannedSession[]; exams: ExamDate[]; today: string; lead: TodayLead | null }) {
  const isToday = date === today;
  const pickTopics = new Set(lead?.kind === "pick" ? lead.pick.topicIds : []);
  return (
    <article className="card" aria-label={`${humanDate(date)}${isToday ? " (today)" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-2.5 pb-1">
        <p className="text-xs font-semibold text-ink">
          {isToday ? "Today" : WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()].slice(0, 3)}
        </p>
        <p className="text-[11px] text-ink3">
          {new Date(`${date}T00:00:00Z`).getUTCDate()} {MONTHS[new Date(`${date}T00:00:00Z`).getUTCMonth()]}
        </p>
        {exams.map((exam) => {
          const subject = getSubject(exam.subjectId);
          const days = dayDiff(today, exam.date);
          return (
            <Pill key={exam.id} tone="danger">
              {subject?.name ?? exam.subjectId} · {exam.label}
              {days === 0 ? " — today" : days === 1 ? " — tomorrow" : ` — in ${days} days`}
            </Pill>
          );
        })}
      </div>
      {isToday && lead ? <TodayLeadRow lead={lead} hasBlocks={sessions.some((session) => session.status === "pending")} /> : null}
      <ul className="divide-y divide-line">
        {sessions.map((session) => {
          const topic = session.topicId ? getTopic(session.topicId) : undefined;
          const subject = getSubject(session.subjectId);
          const end = formatTime(session.startMinute + session.minutes);
          const content = (
            <div className="flex items-start justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-[11px] tabular-nums text-ink3 shrink-0">
                    {formatTime(session.startMinute)}–{end}
                  </span>
                  <span className="text-xs font-medium text-ink shrink-0">{subject?.name ?? session.subjectId}</span>
                  <Pill>{ACTIVITY_LABEL[session.activity]}</Pill>
                  {topic ? <span className="text-xs text-ink2 truncate">{topic.title}</span> : null}
                  {isToday && session.topicId && pickTopics.has(session.topicId) && session.status === "pending" ? (
                    <span data-testid="schedule-block-is-pick"><Pill tone="accent">Today&apos;s pick</Pill></span>
                  ) : null}
                </div>
                <p className="text-[11px] text-ink3 mt-0.5 leading-snug">{session.reason}</p>
              </div>
              {session.status === "done" ? (
                <span className="text-[11px] text-success shrink-0">Done</span>
              ) : session.status === "missed" ? (
                <span className="text-[11px] text-ink3 shrink-0">Missed</span>
              ) : session.status === "skipped" ? (
                <span className="text-[11px] text-ink3 shrink-0">Skipped</span>
              ) : null}
            </div>
          );
          return (
            <li key={session.id}>
              {session.status === "pending" ? (
                <Link href={plannedSessionHref(session)} className="block hover:bg-surface2 transition-colors">
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}

/**
 * Today's lead, inside Schedule's Today card: the same next step and Start
 * link the Today screen shows, then what the planned blocks are.
 */
function TodayLeadRow({ lead, hasBlocks }: { lead: TodayLead; hasBlocks: boolean }) {
  if (lead.kind === "resume") {
    return (
      <div className="mx-4 mb-2 rounded-[8px] border border-accent bg-accentsoft px-3 py-2.5" data-testid="schedule-today-pick" data-source="resume">
        <p className="text-sm font-semibold text-ink">Finish the session you started</p>
        <p className="text-[11px] text-ink2 mt-0.5">Your Today screen picks up where you left off.</p>
        <ButtonLink href="/" size="sm" variant="primary" className="mt-2">Resume on Today</ButtonLink>
        {hasBlocks ? <TodayBlocksNote resume /> : null}
      </div>
    );
  }
  const { pick } = lead;
  const subject = getSubject(pick.subjectId)?.name ?? pick.subjectId;
  const topic = pick.topicIds.length === 1 ? getTopic(pick.topicIds[0]!)?.title : undefined;
  return (
    <div className="mx-4 mb-2 rounded-[8px] border border-accent bg-accentsoft px-3 py-2.5" data-testid="schedule-today-pick" data-source={pick.source}>
      <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Do this first · About {Math.max(1, Math.ceil(pick.minutes))} min</p>
      <p className="text-sm font-semibold text-ink mt-0.5">{pick.title}</p>
      <p className="text-xs text-ink2">{topic ? `${subject} · ${topic}` : subject}</p>
      <ButtonLink href={pick.href} size="sm" variant="primary" className="mt-2">Start</ButtonLink>
      {hasBlocks ? <TodayBlocksNote /> : null}
    </div>
  );
}

function TodayBlocksNote({ resume = false }: { resume?: boolean }) {
  return (
    <p className="text-[11px] text-ink3 leading-snug mt-2" data-testid="schedule-today-note">
      {resume ? "Your " : "This is the same next step as your "}
      <Link href="/" className="underline underline-offset-4 text-ink2 hover:text-ink">Today screen</Link>
      {resume ? " shows this first." : ", chosen from your latest answers."} The blocks below are your long-range plan for
      the rest of today.
    </p>
  );
}
