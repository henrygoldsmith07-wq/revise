"use client";

import Link from "next/link";
import { getBoard, getQualification, getSubject } from "@/domain/curriculum";
import type { ActivityKind, ExamDate, PlannedSession, Subject } from "@/domain/types";
import { useStore } from "@/state/store";
import { ButtonLink } from "./ui";
import { CreditedIcon, ForwardIcon, LessonsIcon, LibraryIcon, PlanIcon, PracticeIcon, ReviewIcon } from "./icons";

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
    <section aria-label="Revision planner" className="today-planner card p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-speaksoft text-speak" aria-hidden="true">
          <PlanIcon size={20} />
        </span>
        <h2 className="text-base font-semibold text-ink">Revision planner</h2>
      </div>

      {exam ? (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink3">Next exam</p>
          <p className="mt-1 text-lg font-semibold text-ink">{examSubject?.name ?? exam.label}</p>
          <p className="mt-1 text-sm text-ink2">
            {humanDate(exam.date)} · {days === 0 ? "Today" : days === 1 ? "Tomorrow" : "In " + days + " days"}
          </p>
          {nextBlock ? (
            <div className="mt-4 rounded-xl bg-surface2 px-4 py-3">
              <p className="text-xs font-semibold text-ink2">Up next in your plan</p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {blockSubject?.name ?? nextBlock.subjectId} · {ACTIVITY_LABEL[nextBlock.activity]}
              </p>
              <p className="mt-1 text-sm text-ink2">
                {nextBlock.date === today ? "Today" : humanDate(nextBlock.date)} · {nextBlock.minutes} min
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-ink2">Your exam date is saved. Add study time to see a manageable plan.</p>
          )}
          <ButtonLink href="/schedule" variant="primary" size="sm" className="mt-5 w-full">
            View my plan <ForwardIcon size={15} aria-hidden />
          </ButtonLink>
        </div>
      ) : (
        <div className="mt-5">
          <h3 className="text-lg font-semibold text-ink">Make a plan that fits your week</h3>
          <p className="mt-2 text-sm leading-6 text-ink2">Add an exam date and the time you can study. We&apos;ll help break it into smaller steps.</p>
          <ButtonLink href="/settings" variant="primary" size="sm" className="mt-5 w-full">
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
      detail: "Learn an idea and check it as you go.",
      done: Object.values(lessonProgress.completed).some(Boolean),
      Icon: LessonsIcon,
    },
    {
      href: "/review",
      title: "Review your cards",
      detail: "See what you can remember.",
      done: reviewLogs.length > 0,
      Icon: ReviewIcon,
    },
    {
      href: "/practice",
      title: "Try an exam question",
      detail: "Get feedback on your answer.",
      done: attempts.length > 0,
      Icon: PracticeIcon,
    },
  ];
  const completed = steps.filter((step) => step.done).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start">
      <section aria-label="My subjects" className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">My subjects</h2>
          <Link href="/settings" className="text-sm font-medium text-ink2 underline-offset-4 hover:text-ink hover:underline">
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
                aria-label={"Explore " + subject.name + " topics"}
              >
                <span className="relative z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-white" aria-hidden="true">
                  <LibraryIcon size={19} />
                </span>
                <span className="relative z-10 mt-3 text-xs font-semibold text-white/85">{subjectLabel(subject)}</span>
                <strong className="relative z-10 mt-1 block text-xl font-semibold leading-tight text-white">{subject.name}</strong>
                <span className="relative z-10 mt-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-ink">
                  Explore topics <ForwardIcon size={15} aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card p-5">
            <p className="text-sm leading-6 text-ink2">Choose your subjects to keep them within easy reach here.</p>
            <Link href="/settings" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-speak underline-offset-4 hover:underline">
              Choose subjects <ForwardIcon size={15} aria-hidden />
            </Link>
          </div>
        )}
      </section>

      <div className="space-y-6">
        <RevisionPlanner exam={exam} nextBlock={nextBlock} today={today} />
        <section aria-label="Ways to get started">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink">Ways to get started</h2>
            <span className="text-sm tabular-nums text-ink2">{completed} of 3 tried</span>
          </div>
          <ol className="card divide-y divide-line overflow-hidden">
            {steps.map(({ href, title, detail, done, Icon }) => (
              <li key={href}>
                <Link href={href} className="today-step-link flex items-center gap-3 px-4 py-4 transition-colors hover:bg-surface2">
                  <span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-xl " + (done ? "bg-successsoft text-success" : "bg-surface2 text-ink2")} aria-hidden="true">
                    {done ? <CreditedIcon size={18} /> : <Icon size={18} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{title}</span>
                    <span className="mt-0.5 block text-sm leading-5 text-ink2">{detail}</span>
                  </span>
                  {done ? (
                    <span className="shrink-0 text-xs font-semibold text-success">Tried</span>
                  ) : (
                    <ForwardIcon size={17} aria-hidden className="shrink-0 text-ink3" />
                  )}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
