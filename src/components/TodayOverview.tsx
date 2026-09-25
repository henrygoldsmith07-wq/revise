"use client";

import Link from "next/link";
import { getBoard, getQualification, getSubject } from "@/domain/curriculum";
import type { ActivityKind, ExamDate, PlannedSession, Subject } from "@/domain/types";
import { useStore } from "@/state/store";
import { ButtonLink } from "./ui";
import { ForwardIcon, LessonsIcon, PlanIcon, PracticeIcon, ReviewIcon } from "./icons";

const SUBJECT_COLOURS = ["green", "purple", "pink", "blue"] as const;

const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  learn: "Learn",
  flashcards: "Review cards",
  recall: "Active recall",
  practice: "Exam questions",
  paper: "Past paper",
  mistakes: "Mistake repair",
};

function subjectLabel(subject: Subject): string {
  const qualification = getQualification(subject.qualificationId);
  const board = qualification ? getBoard(qualification.boardId) : undefined;
  return [board?.name ?? qualification?.name, qualification?.level].filter(Boolean).join(" · ");
}

function humanDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(date + "T00:00:00Z"),
  );
}

function daysUntil(today: string, date: string): number {
  return Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);
}

function RevisionPlanner({ exam, nextBlock, today }: { exam?: ExamDate; nextBlock?: PlannedSession; today: string }) {
  const days = exam ? daysUntil(today, exam.date) : null;
  const examSubject = exam ? getSubject(exam.subjectId) : undefined;
  const blockSubject = nextBlock ? getSubject(nextBlock.subjectId) : undefined;

  return (
    <section aria-label="Revision planner" className="card p-4 sm:p-5">
      <div className="flex items-center gap-2 text-ink2">
        <PlanIcon size={18} aria-hidden />
        <h2 className="text-base font-semibold text-ink">Revision planner</h2>
      </div>

      {exam ? (
        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink3">Next exam</p>
          <p className="mt-1 text-lg font-semibold text-ink">{examSubject?.name ?? exam.label}</p>
          <p className="mt-1 text-sm text-ink2">
            {humanDate(exam.date)} · {days === 0 ? "today" : days === 1 ? "tomorrow" : "in " + days + " days"}
          </p>
          {nextBlock ? (
            <div className="mt-4 rounded-xl bg-surface2 px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink3">Next planned block</p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {blockSubject?.name ?? nextBlock.subjectId} · {ACTIVITY_LABEL[nextBlock.activity]}
              </p>
              <p className="mt-0.5 text-xs text-ink3">
                {nextBlock.date === today ? "Today" : humanDate(nextBlock.date)} · {nextBlock.minutes} min
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink3">Your exam date is set. Open your schedule to map out the study blocks.</p>
          )}
          <ButtonLink href="/schedule" variant="primary" size="sm" className="mt-4 w-full">
            View revision plan <ForwardIcon size={15} aria-hidden />
          </ButtonLink>
        </div>
      ) : (
        <div className="mt-5 flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-speaksoft text-speak" aria-hidden="true">
            <PlanIcon size={23} />
          </span>
          <p className="mt-3 text-base font-semibold text-ink">Plan your way to exam day</p>
          <p className="mt-1 text-sm text-ink3">Add your exam dates and study time to build a day-by-day plan.</p>
          <ButtonLink href="/settings" variant="primary" size="sm" className="mt-4 w-full">
            Set up my plan <ForwardIcon size={15} aria-hidden />
          </ButtonLink>
        </div>
      )}
    </section>
  );
}

export function TodayOverview() {
  const { settings, examDates, plannedSessions, lessonProgress, reviewLogs, attempts } = useStore();
  const subjects = settings.subjectIds
    .map((id) => getSubject(id))
    .filter((subject): subject is Subject => Boolean(subject));
  const today = new Date().toISOString().slice(0, 10);
  const exam = examDates
    .filter((entry) => settings.subjectIds.includes(entry.subjectId) && entry.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const nextBlock = plannedSessions
    .filter((entry) => entry.status === "pending" && entry.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute)[0];
  const steps = [
    {
      href: "/lesson",
      title: "Explore a lesson",
      detail: "Build the idea, then check it.",
      done: Object.values(lessonProgress.completed).some(Boolean),
      Icon: LessonsIcon,
    },
    {
      href: "/review",
      title: "Review your cards",
      detail: "Bring back what you have learned.",
      done: reviewLogs.length > 0,
      Icon: ReviewIcon,
    },
    {
      href: "/practice",
      title: "Try an exam question",
      detail: "Get marked feedback on an answer.",
      done: attempts.length > 0,
      Icon: PracticeIcon,
    },
  ];
  const completed = steps.filter((step) => step.done).length;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start">
      <section aria-label="My subjects" className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">My subjects</h2>
          <Link href="/settings" className="text-xs font-medium text-ink2 underline-offset-4 hover:text-ink hover:underline">
            Change subjects
          </Link>
        </div>
        {subjects.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {subjects.map((subject, index) => (
              <Link
                key={subject.id}
                href={"/library?subject=" + encodeURIComponent(subject.id)}
                className={"today-subject-card today-subject-card--" + SUBJECT_COLOURS[index % SUBJECT_COLOURS.length]}
                aria-label={"Open " + subject.name}
              >
                <span className="relative z-10 text-[11px] font-semibold text-white/80">{subjectLabel(subject)}</span>
                <strong className="relative z-10 mt-1 block text-lg font-semibold leading-tight text-white">{subject.name}</strong>
                <span className="relative z-10 mt-auto inline-flex w-fit items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink">
                  Open <ForwardIcon size={14} aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card p-5 text-sm text-ink3">
            Choose your subjects in Settings to keep them within easy reach here.
          </div>
        )}
      </section>

      <div className="space-y-5">
        <RevisionPlanner exam={exam} nextBlock={nextBlock} today={today} />
        <section aria-label="Getting started">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-ink">Getting started</h2>
            <span className="text-xs tabular-nums text-ink3">{completed}/3 done</span>
          </div>
          <ol className="card divide-y divide-line overflow-hidden">
            {steps.map(({ href, title, detail, done, Icon }) => (
              <li key={href}>
                <Link href={href} className="flex items-center gap-3 px-3.5 py-3.5 transition-colors hover:bg-surface2">
                  <Icon size={18} aria-hidden className="shrink-0 text-ink3" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{title}</span>
                    <span className="block text-xs text-ink3">{detail}</span>
                  </span>
                  <span className={"shrink-0 text-xs font-semibold " + (done ? "text-success" : "text-ink3")}>
                    {done ? "Done" : "0/1"}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
