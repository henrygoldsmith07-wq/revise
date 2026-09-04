"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { countdownGuidance } from "@/domain/exam-countdown";
import { getSubject, getTopic } from "@/domain/curriculum";
import { formatTime } from "@/domain/planner";
import type { ActivityKind, ExamDate, PlannedSession } from "@/domain/types";
import { useStore, useSubjects } from "@/state/store";
import { Button, EmptyState, Pill, SectionHeading } from "@/components/ui";

// The personalised schedule: the planner's output over the whole remaining
// run-up to each exam. Everything here is derived state — the planner rebuilds
// it whenever availability, exam dates, targets or evidence change, and Review
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
  return d.toISOString().slice(0, 10);
}
function addDays(key: string, days: number): string {
  return dateKey(new Date(new Date(`${key}T00:00:00Z`).getTime() + days * 86_400_000));
}
function dayDiff(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000,
  );
}
function humanDate(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Where a planned block actually runs, so starting it ticks it off on finish. */
function hrefForSession(session: PlannedSession): string {
  const base: Record<ActivityKind, string> = {
    learn: `/lesson?subject=${session.subjectId}`,
    flashcards: "/review",
    recall: `/practice?mode=recall${session.topicId ? `&topic=${encodeURIComponent(session.topicId)}` : ""}`,
    practice: `/practice?topic=${encodeURIComponent(session.topicId ?? session.subjectId)}`,
    paper: "/papers",
    mistakes: "/review?mode=mistakes",
  };
  const href = base[session.activity];
  const marksDone = session.activity === "flashcards" || session.activity === "recall" || session.activity === "practice";
  return marksDone ? `${href}${href.includes("?") ? "&" : "?"}session=${session.id}` : href;
}

export default function SchedulePage() {
  const store = useStore();
  const subjects = useSubjects();
  const [rebuilding, setRebuilding] = useState(false);
  const autoBuilt = useRef(false);

  const today = dateKey(new Date());
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

  if (!subjects.length) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Schedule</h1>
          <p className="text-sm text-ink3 mt-0.5">
            The whole run-up to each exam, rebuilt automatically as dates, availability and evidence change.
          </p>
        </div>
        <Button variant="secondary" size="sm" disabled={rebuilding} onClick={() => void rebuild()}>
          {rebuilding ? "Rebuilding…" : "Rebuild schedule"}
        </Button>
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
          <CalendarDays sessions={sessions} exams={exams} today={today} calendarEnd={calendarEnd} />
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

function CalendarDays({
  sessions,
  exams,
  today,
  calendarEnd,
}: {
  sessions: PlannedSession[];
  exams: ExamDate[];
  today: string;
  calendarEnd: string;
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
    if (!byDate.has(key) && !examByDate.has(key)) continue;
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
        const d = new Date(`${monday}T00:00:00Z`);
        return (
          <section key={monday} aria-label={`Week of ${humanDate(monday)}`}>
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1.5">
              Week of {d.getUTCDate()} {MONTHS[d.getUTCMonth()]} – {sunday}
            </p>
            <div className="space-y-2">
              {week.days.map((key) => (
                <DayCard key={key} date={key} sessions={byDate.get(key) ?? []} exams={examByDate.get(key) ?? []} today={today} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DayCard({ date, sessions, exams, today }: { date: string; sessions: PlannedSession[]; exams: ExamDate[]; today: string }) {
  const isToday = date === today;
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
                <Link href={hrefForSession(session)} className="block hover:bg-surface2 transition-colors">
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
