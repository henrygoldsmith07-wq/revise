"use client";

import { useMemo } from "react";
import { allTopics, getSubject, getTopic } from "@/domain/curriculum";
import { evidenceGapReport, type SubjectGapSummary } from "@/domain/marks-value";
import { shortDate, type ProofStatus, type TopicProof } from "@/domain/proof-of-improvement";
import { topicShares } from "@/domain/topic-weight";
import { useStoreFields } from "@/state/store";
import { ButtonLink, Panel, Pill, SectionHeading, StatTile } from "./ui";

const VISIBLE_ROWS = 6;

const STATUS: Record<ProofStatus, { label: string; tone: "success" | "review" | "danger" | "neutral" }> = {
  "proven-gain": { label: "Proven", tone: "success" },
  held: { label: "Held", tone: "success" },
  "no-clear-change": { label: "No clear change", tone: "neutral" },
  declined: { label: "Slipped", tone: "danger" },
  "awaiting-proof": { label: "Awaiting proof", tone: "review" },
  untested: { label: "Not tested", tone: "neutral" },
};

const pct = (value: number | null) => (value === null ? "" : `${Math.round(value * 100)}%`);
const startHref = (topicId: string) => `/adaptive-session?topic=${encodeURIComponent(topicId)}&start=1`;

function detail(row: TopicProof): string {
  if (row.illusory) {
    return `Scores ${pct(row.familiarRate)} on questions you have seen, but ${pct(row.unseenRate)} on new ones.`;
  }
  if (row.before && row.after) {
    return `${pct(row.before.rate)} → ${pct(row.after.rate)} on different questions, ${row.delayDays ?? 0} days apart.`;
  }
  if (row.before) {
    return row.proofDue
      ? `Baseline ${pct(row.before.rate)} from ${row.before.questions} questions. New questions are due now.`
      : `Baseline ${pct(row.before.rate)} from ${row.before.questions} questions. New questions count from ${row.provableFrom ? shortDate(row.provableFrom) : "a few days after you study"}.`;
  }
  return "Needs two unaided answers to different questions to set a baseline.";
}

function gapSummary(summary: SubjectGapSummary): string {
  const name = getSubject(summary.subjectId)?.name ?? summary.subjectId;
  const parts: string[] = [];
  if (summary.unreviewed) parts.push(`${summary.unreviewed} of ${summary.topics} topics have questions awaiting human review (practice only)`);
  if (summary.noQuestions) parts.push(`${summary.noQuestions} have no question yet`);
  if (summary.exhausted) parts.push(`${summary.exhausted} have no unseen questions left`);
  if (summary.fewUnseen) parts.push(`${summary.fewUnseen} are nearly out of unseen questions`);
  return `${name}: ${parts.join("; ")}.`;
}

/** Proof of improvement and the evidence gaps that stop it. Answers "did it work, and where can't we tell?" */
export function ProofPanel() {
  const store = useStoreFields("attempts", "proofLedger", "questions", "settings");
  const ledger = store.proofLedger;
  const gaps = useMemo(() => {
    const topics = allTopics(store.settings.subjectIds);
    return evidenceGapReport({ topics, shares: topicShares(topics), questions: store.questions, attempts: store.attempts });
  }, [store.attempts, store.questions, store.settings.subjectIds]);

  const rows = ledger.topics.filter((row) => row.status !== "untested" || row.illusory);
  const visible = rows.slice(0, VISIBLE_ROWS);
  const hidden = rows.slice(VISIBLE_ROWS);
  const due = ledger.topics.filter((row) => row.proofDue).length;

  const renderRow = (row: TopicProof) => {
    const status = STATUS[row.status];
    const topic = getTopic(row.topicId);
    const act = row.proofDue || row.illusory;
    return (
      <li key={row.topicId} className="py-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">
            {topic?.title ?? row.topicId}
            <span className="ml-2 text-xs font-normal text-ink3">{getSubject(row.subjectId)?.name}</span>
          </p>
          <p className="text-xs text-ink2 mt-0.5">{detail(row)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {row.illusory ? <Pill tone="danger">Looks learned</Pill> : null}
          <Pill tone={status.tone}>{status.label}{row.markPoints ? ` ${row.markPoints > 0 ? "+" : ""}${row.markPoints}` : ""}</Pill>
          {act ? <ButtonLink href={startHref(row.topicId)} size="sm" variant="primary">Prove it</ButtonLink> : null}
        </div>
      </li>
    );
  };

  return (
    <section id="proof" aria-labelledby="proof-heading" className="space-y-4 scroll-mt-20">
      <SectionHeading
        title="Proof of improvement"
        hint="Only counts new questions, answered unaided, days after you studied. Repeats and hinted answers never count."
      />
      <Panel className="space-y-5">
        <h2 id="proof-heading" className="sr-only">Proof of improvement</h2>
        <p className="text-sm text-ink2" role="status">{ledger.headline}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="Proven" value={ledger.proven} sub={ledger.proven ? `about +${ledger.provenMarks} marks` : "topics"} tone={ledger.proven ? "success" : undefined} />
          <StatTile label="Awaiting proof" value={ledger.awaiting} sub={due ? `${due} due now` : "topics"} tone={due ? "review" : undefined} />
          <StatTile label="Slipped" value={ledger.declined} tone={ledger.declined ? "danger" : undefined} sub="topics" />
          <StatTile label="Looks learned" value={ledger.illusory} tone={ledger.illusory ? "danger" : undefined} sub="only on familiar questions" />
        </div>

        {rows.length ? (
          <>
            <ul className="divide-y divide-line">{visible.map(renderRow)}</ul>
            {hidden.length ? (
              <details>
                <summary className="cursor-pointer select-none text-sm font-medium text-ink2">Show {hidden.length} more topic{hidden.length === 1 ? "" : "s"}</summary>
                <ul className="divide-y divide-line">{hidden.map(renderRow)}</ul>
              </details>
            ) : null}
          </>
        ) : null}

        {gaps.bySubject.length ? (
          <div className="rounded-[8px] border border-line px-3 py-3 space-y-2" role="note">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Where the evidence cannot reach yet</p>
            <ul className="space-y-1.5">
              {gaps.bySubject.map((summary) => (
                <li key={summary.subjectId} className="text-xs text-ink2">{gapSummary(summary)}</li>
              ))}
            </ul>
            <p className="text-[11px] text-ink3">These topics can still be revised. Their answers just cannot be counted as proof, so nothing here is presented as confidence.</p>
          </div>
        ) : null}
      </Panel>
    </section>
  );
}
