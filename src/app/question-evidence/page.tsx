"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { allTopics, subjectLabel } from "@/domain/curriculum";
import {
  buildQuestionEvidenceDatabase,
  queryQuestionEvidence,
  type QuestionEvidenceFilter,
  type QuestionEvidenceRecord,
  type QuestionEvidenceSort,
} from "@/domain/question-evidence";
import { todayIso } from "@/domain/scheduling";
import { useStore, useSubjects } from "@/state/store";
import { RichText } from "@/components/RichText";
import { Button, EmptyState, Panel, Pill, ProgressBar, SectionHeading, StatTile } from "@/components/ui";

const FILTERS: Array<{ value: QuestionEvidenceFilter; label: string }> = [
  { value: "all", label: "All questions" },
  { value: "needs-review", label: "Needs review" },
  { value: "unmapped", label: "Unmapped" },
  { value: "mapped", label: "Mapped" },
  { value: "verified", label: "Verified" },
  { value: "attempted", label: "Attempted" },
];

const SORTS: Array<{ value: QuestionEvidenceSort; label: string }> = [
  { value: "attention", label: "Needs attention" },
  { value: "recent", label: "Recently attempted" },
  { value: "marks", label: "Most marks" },
  { value: "question", label: "Question A–Z" },
];

export default function QuestionEvidencePage() {
  const store = useStore();
  const subjects = useSubjects();
  const [query, setQuery] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [filter, setFilter] = useState<QuestionEvidenceFilter>("all");
  const [sort, setSort] = useState<QuestionEvidenceSort>("attention");
  const [pageSize, setPageSize] = useState(50);

  const database = useMemo(
    () =>
      buildQuestionEvidenceDatabase({
        questions: store.questions,
        attempts: store.attempts,
        subjects,
        topics: allTopics(store.settings.subjectIds),
        today: todayIso(),
      }),
    [store.attempts, store.questions, store.settings.subjectIds, subjects],
  );
  const filtered = useMemo(
    () => queryQuestionEvidence(database, { query, subjectId: subjectId || undefined, filter, sort }),
    [database, filter, query, sort, subjectId],
  );
  const records = filtered.slice(0, pageSize);

  function resetPage() {
    setPageSize(50);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Content trust</p>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mt-1">Question Evidence Database</h1>
        <p className="text-sm text-ink3 mt-1 max-w-2xl">
          One searchable record for every exam question: what it tests, which specification statements support it, how
          the mark scheme earns marks, when it was checked, and what your own attempts show.
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Questions" value={database.summary.total} sub="indexed on this device" />
        <StatTile
          label="Complete mappings"
          value={database.summary.complete}
          sub={`${database.summary.partial} partial · ${database.summary.unmapped} unmapped`}
          tone={database.summary.unmapped ? "review" : "success"}
        />
        <StatTile
          label="Needs review"
          value={database.summary.needsReview}
          sub={`${database.summary.verified} verified`}
          tone={database.summary.needsReview ? "review" : "success"}
        />
        <StatTile
          label="Student evidence"
          value={database.summary.attempted}
          sub={`${database.summary.markSchemePoints} mark-scheme points indexed`}
        />
      </div>

      <Panel className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_12rem] items-end">
          <label className="block">
            <span className="text-xs font-semibold text-ink2">Search the evidence database</span>
            <span className="block text-[11px] text-ink3 mb-1">Question text, specification refs, mark-scheme points or learning claims</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetPage();
              }}
              placeholder="Search e.g. photoelectric, AO2, inverse-square…"
              className="field text-sm w-full"
              aria-label="Search the evidence database"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink2">Subject</span>
            <span className="block h-1" />
            <select
              value={subjectId}
              onChange={(event) => {
                setSubjectId(event.target.value);
                resetPage();
              }}
              className="field field-inline text-sm w-full"
              aria-label="Evidence subject"
            >
              <option value="">All subjects</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink2">Show</span>
            <span className="block h-1" />
            <select
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as QuestionEvidenceFilter);
                resetPage();
              }}
              className="field field-inline text-sm w-full"
              aria-label="Evidence status"
            >
              {FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink2">Sort</span>
            <span className="block h-1" />
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as QuestionEvidenceSort);
                resetPage();
              }}
              className="field field-inline text-sm w-full"
              aria-label="Evidence sort"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-ink3" role="status" aria-live="polite">
          Showing {records.length} of {filtered.length} matching question{filtered.length === 1 ? "" : "s"}. The index
          is built locally from your persisted question bank, attempts and specification content.
        </p>
      </Panel>

      {records.length ? (
        <section aria-labelledby="question-evidence-results">
          <SectionHeading
            title="Evidence records"
            hint="Open a record to inspect the mapping, mark-scheme evidence and student history."
          />
          <h2 id="question-evidence-results" className="sr-only">
            Question evidence records
          </h2>
          <div className="card divide-y divide-line overflow-hidden">
            {records.map((record) => (
              <QuestionEvidenceRecordCard key={record.question.id} record={record} />
            ))}
          </div>
          {records.length < filtered.length ? (
            <div className="flex justify-center mt-4">
              <Button onClick={() => setPageSize((size) => size + 50)}>Show 50 more</Button>
            </div>
          ) : null}
        </section>
      ) : (
        <EmptyState
          title="No matching evidence records"
          body={
            query || subjectId || filter !== "all"
              ? "Try a broader search or clear one of the filters. Unmapped questions are useful here: they show exactly where the content pipeline needs attention."
              : "Questions will appear here once the local question bank has finished loading."
          }
          action={
            query || subjectId || filter !== "all" ? (
              <Button
                variant="primary"
                onClick={() => {
                  setQuery("");
                  setSubjectId("");
                  setFilter("all");
                  resetPage();
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

function QuestionEvidenceRecordCard({ record }: { record: QuestionEvidenceRecord }) {
  const question = record.question;
  const percentage = record.attempts.percentage;
  const coverageTone = record.coverage === "complete" ? "success" : record.coverage === "partial" ? "review" : "danger";
  const verificationTone = record.verification === "verified" ? "success" : record.verification === "checked" ? "review" : "danger";

  return (
    <article className="p-4 sm:p-5" aria-labelledby={`question-evidence-${question.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <Pill>{record.subject ? subjectLabel(record.subject.id) : question.subjectId}</Pill>
            <Pill>{question.origin}</Pill>
            <Pill tone={coverageTone}>{record.coverage} mapping</Pill>
            <Pill tone={verificationTone}>{record.verification}</Pill>
          </div>
          <h3 id={`question-evidence-${question.id}`} className="text-sm font-semibold text-ink">
            <RichText>{question.stem}</RichText>
          </h3>
          <p className="text-xs text-ink3 mt-1">
            {record.topics.map((topic) => topic.title).join(" · ") || "No topic mapping"} · {question.totalMarks} marks ·
            difficulty {question.difficulty}/5
          </p>
        </div>
        <Link href={`/practice?question=${encodeURIComponent(question.id)}`}>
          <Button size="sm" variant="primary">
            Practise
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs">
        <EvidenceStat label="Spec statements" value={`${record.specPoints.length}`} detail={record.coverage === "complete" ? "fully mapped" : "needs mapping"} />
        <EvidenceStat label="Mark-scheme points" value={`${record.parts.reduce((total, part) => total + part.markScheme.length, 0)}`} detail={`${record.parts.length} part${record.parts.length === 1 ? "" : "s"}`} />
        <EvidenceStat
          label="Attempts"
          value={`${record.attempts.count}`}
          detail={percentage === null ? "not attempted" : `${Math.round(percentage * 100)}% awarded`}
        />
        <EvidenceStat label="Last checked" value={record.lastChecked ?? "—"} detail={record.source ?? "source not recorded"} />
      </div>

      {record.flags.length ? (
        <div className="flex flex-wrap gap-1.5 mt-3" aria-label="Evidence flags">
          {record.flags.map((flag) => (
            <Pill key={flag} tone="review">
              {flagLabel(flag)}
            </Pill>
          ))}
        </div>
      ) : (
        <p className="text-xs text-success mt-3">Evidence record complete: mapped, checked and mark-scheme aligned.</p>
      )}

      <details className="mt-4 border-t border-line pt-3">
        <summary className="text-xs font-semibold text-ink2 cursor-pointer">Inspect evidence and history</summary>
        <div className="mt-4 space-y-5">
          <section aria-labelledby={`spec-evidence-${question.id}`}>
            <h4 id={`spec-evidence-${question.id}`} className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">
              Specification evidence
            </h4>
            {record.specPoints.length ? (
              <ul className="mt-2 space-y-2">
                {record.specPoints.map((point) => (
                  <li key={point.id} className="flex gap-2 text-xs">
                    <span className="font-mono text-ink3 shrink-0">{point.ref}</span>
                    <span className="text-ink2 flex-1">{point.text}</span>
                    <span className="text-ink3 shrink-0">{point.aos.join(", ") || "AO unclassified"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-review mt-2">No specification statement is linked to this question yet.</p>
            )}
          </section>

          <section aria-labelledby={`marking-evidence-${question.id}`}>
            <h4 id={`marking-evidence-${question.id}`} className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">
              Mark-scheme evidence
            </h4>
            <div className="mt-2 space-y-3">
              {record.parts.map((part) => (
                <div key={part.id} className="border-t border-line pt-2 first:border-t-0 first:pt-0">
                  <p className="text-xs font-semibold text-ink2">
                    {part.label || "Answer"} · {part.marks} mark{part.marks === 1 ? "" : "s"}
                  </p>
                  <RichText className="text-xs text-ink2 mt-1">{part.prompt}</RichText>
                  {part.learningClaims.length ? (
                    <ul className="mt-1.5 space-y-1">
                      {part.learningClaims.map((claim, index) => (
                        <li key={`${part.id}:claim:${index}`} className="text-xs text-success">
                          Earns: {claim}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <details className="mt-1.5">
                    <summary className="text-[11px] text-ink3 cursor-pointer">Show mark-scheme points and model answer</summary>
                    <ul className="mt-1 space-y-1">
                      {part.markScheme.map((point, index) => (
                        <li key={`${part.id}:mark:${index}`} className="text-xs text-ink2">
                          {point}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-ink3 mt-2 whitespace-pre-wrap">{part.modelAnswer}</p>
                  </details>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby={`student-evidence-${question.id}`}>
            <h4 id={`student-evidence-${question.id}`} className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">
              Student evidence
            </h4>
            {record.attempts.count ? (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-ink2">
                  <span>
                    {record.attempts.count} attempt{record.attempts.count === 1 ? "" : "s"} · marked by {record.attempts.latestMarkedBy}
                  </span>
                  <span className="tabular-nums">
                    {record.attempts.awarded}/{record.attempts.max} marks
                  </span>
                </div>
                <ProgressBar value={record.attempts.percentage ?? 0} label="Observed mark rate" tone={(record.attempts.percentage ?? 0) >= 0.8 ? "success" : (record.attempts.percentage ?? 0) >= 0.5 ? "review" : "danger"} />
                {record.attempts.latestFeedback ? <p className="text-xs text-ink3 mt-2">Latest feedback: {record.attempts.latestFeedback}</p> : null}
              </div>
            ) : (
              <p className="text-xs text-ink3 mt-2">No marked attempt yet. Practise the question to add personal evidence.</p>
            )}
          </section>
        </div>
      </details>
    </article>
  );
}

function EvidenceStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-ink3 font-semibold">{label}</p>
      <p className="text-sm font-semibold text-ink tabular-nums truncate" title={value}>
        {value}
      </p>
      <p className="text-[11px] text-ink3 truncate">{detail}</p>
    </div>
  );
}

function flagLabel(flag: string): string {
  return flag
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
