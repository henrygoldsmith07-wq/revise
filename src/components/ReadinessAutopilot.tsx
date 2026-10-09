"use client";

// Readiness autopilot summary: if the exam were today, where would I stand?
// What is strong / weak / unproven / at risk / next — with drill-down from
// overall → subject → paper → topic → specific weakness.
//
// All numbers are observed (open marks, checked answers, proof states).
// Nothing here is a grade forecast.

import Link from "next/link";
import { useMemo } from "react";
import { getSubject, getTopic } from "@/domain/curriculum";
import { buildMarksIntelligence } from "@/domain/readiness-intelligence";
import { todayLocal } from "@/domain/local-date";
import { useStoreFields } from "@/state/store";
import { ButtonLink, Panel, Pill } from "./ui";

export function ReadinessAutopilot() {
  const store = useStoreFields(
    "attempts",
    "mistakes",
    "questions",
    "settings",
    "examDates",
    "applicationMastery",
    "recallMastery",
    "examReadinessSummary",
  );

  const intel = useMemo(
    () =>
      buildMarksIntelligence({
        mistakes: store.mistakes,
        attempts: store.attempts,
        questions: store.questions,
        subjectIds: store.settings.subjectIds,
        topicTitle: (id) => getTopic(id)?.title ?? id,
        recallMastery: store.recallMastery,
        applicationMastery: store.applicationMastery,
        timedAttempts: store.attempts.filter((a) => a.mode === "paper").length,
      }),
    [
      store.mistakes,
      store.attempts,
      store.questions,
      store.settings.subjectIds,
      store.recallMastery,
      store.applicationMastery,
    ],
  );

  const summary = store.examReadinessSummary;
  const weakest = summary.weakestSubjectId
    ? getSubject(summary.weakestSubjectId)
    : null;
  const nearestExam = [...store.examDates]
    .filter((e) => store.settings.subjectIds.includes(e.subjectId))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const examDays = nearestExam
    ? Math.max(
        0,
        Math.round(
          (Date.parse(`${nearestExam.date}T00:00:00Z`) - Date.parse(`${todayLocal()}T00:00:00Z`)) / 86_400_000,
        ),
      )
    : null;

  return (
    <Panel className="space-y-4 border-accent">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">
            Readiness · if the exam were today
          </p>
          <h2 className="mt-1 text-lg font-semibold text-ink">
            {intel.totalMarks === null
              ? "Not enough evidence yet"
              : intel.totalMarks === 0
                ? "No open lost marks"
                : `${intel.totalMarks} marks currently at risk`}
          </h2>
          <p className="mt-1 text-sm text-ink2 max-w-2xl" role="status">
            {intel.headline}
            {examDays !== null
              ? ` Nearest exam ${examDays === 0 ? "is today" : `is in ${examDays} day${examDays === 1 ? "" : "s"}`}.`
              : " No exam date set, so urgency is not a factor."}
          </p>
        </div>
        <Pill tone={summary.status === "ready" ? "success" : summary.status === "at-risk" ? "danger" : "review"}>
          {summary.status === "ready"
            ? "Ready"
            : summary.status === "at-risk"
              ? "At risk"
              : summary.status === "nearly-ready"
                ? "Nearly ready"
                : "Building evidence"}
        </Pill>
      </div>

      {intel.categories.length ? (
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="What is at risk">
          {intel.categories.map((c) => (
            <li
              key={c.key}
              className="rounded-xl border border-line bg-surface2/50 px-3 py-2.5"
            >
              <p className="text-xs font-semibold text-ink">
                {c.label}{" "}
                <span className="font-normal text-ink3">
                  · {c.marks > 0 ? `${c.marks} marks` : "clear"}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-ink2">{c.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {intel.opportunities.length ? (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">
            Highest-value opportunities
          </p>
          <ol className="mt-2 space-y-2">
            {intel.opportunities.map((o) => (
              <li
                key={o.topicId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {o.title}{" "}
                    <span className="text-xs font-normal text-ink3">
                      {getSubject(o.subjectId)?.name} · {o.marks} marks
                    </span>
                  </p>
                  <p className="text-xs text-ink2">{o.reason}</p>
                </div>
                <ButtonLink href={o.href} size="sm" variant="secondary" className="shrink-0">
                  Practise
                </ButtonLink>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink3">
        <Link href="/library" className="hover:text-ink hover:underline">
          Subjects: where am I weak? →
        </Link>
        <Link href="/papers" className="hover:text-ink hover:underline">
          Papers: where did marks go? →
        </Link>
        <Link href="#proof" className="hover:text-ink hover:underline">
          Proof: familiar vs unseen →
        </Link>
        {weakest ? (
          <Link
            href={`/practice?subject=${encodeURIComponent(weakest.id)}`}
            className="hover:text-ink hover:underline"
          >
            Practise {weakest.name} →
          </Link>
        ) : null}
      </div>
    </Panel>
  );
}
