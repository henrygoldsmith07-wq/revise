"use client";

import { useEffect, useMemo, useState } from "react";
import { allTopics, getSubject, unitsFor } from "@/domain/curriculum";
import { reviewQueue } from "@/domain/coverage-queue";
import { FLAGSHIP_SUBJECTS } from "@/domain/flagship";
import { buildSpecificationMap } from "@/domain/specification-evidence";
import { buildCoverageRows, coverageCsv, coverageMetrics } from "@/domain/trusted-coverage";
import { Button, Panel, Pill, SectionHeading, StatTile } from "@/components/ui";
import { useStoreFields } from "@/state/store";
import type { Question } from "@/domain/types";

type Filter = "all" | "gaps" | "unreviewed" | "none-authored";

export default function TrustedCoveragePage() {
  const store = useStoreFields("questions", "attempts");
  const [subjectId, setSubjectId] = useState<string>(FLAGSHIP_SUBJECTS[0]!.subjectId);
  const [filter, setFilter] = useState<Filter>("gaps");
  const [release, setRelease] = useState<((q: Question) => boolean) | null>(null);

  // The release set lives in the large content bundle; load it only on this reviewer page.
  useEffect(() => {
    let live = true;
    void import("@/content").then((mod) => { if (live) setRelease(() => mod.isSeedWjecReleaseQuestion); });
    return () => { live = false; };
  }, []);

  const subject = getSubject(subjectId);
  const topics = useMemo(() => allTopics(), []);
  const data = useMemo(() => {
    if (!subject) return null;
    const evidence = buildSpecificationMap({ subjectId: subject.id, attempts: store.attempts, questions: store.questions });
    const studentEvidence = new Map(evidence.units.flatMap((unit) => unit.topics.flatMap((topic) => topic.points.map((point) => [point.specPointId, point.status] as const))));
    const rows = buildCoverageRows({
      subject, topics, units: unitsFor(subject.id), questions: store.questions, studentEvidence,
      ...(release ? { release } : {}),
      paperForUnit: (unit) => {
        const n = /\bUnit (\d+)\b/.exec(unit.title)?.[1];
        return n ? subject.papers.find((p) => p.id.endsWith(`.u${n}`))?.name ?? null : null;
      },
    });
    const queue = reviewQueue({ subjectId, topics, questions: store.questions, limit: 15, ...(release ? { preferredQuestion: release } : {}) });
    return { rows, metrics: coverageMetrics(rows), queue };
  }, [subject, subjectId, topics, store.questions, store.attempts, release]);

  if (!subject || !data) return null;
  const shown = data.rows.filter((row) => filter === "all" ? true : filter === "gaps" ? !row.fullyCovered : row.reviewStatus === filter);
  const download = () => {
    const url = URL.createObjectURL(new Blob([coverageCsv(data.rows)], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${subjectId}-trusted-coverage.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };
  const { metrics } = data;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Reviewers and developers</p>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mt-1">Trusted coverage</h1>
        <p className="text-sm text-ink3 mt-1 max-w-3xl">
          Counts only questions that have passed human verification. Authored, generated or unreviewed items add nothing here. A statement is fully covered with trusted recall, application and transfer items, at least four trusted items in total, and at least three question families.
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Subject">
        {FLAGSHIP_SUBJECTS.map((flagship) => (
          <Button key={flagship.subjectId} size="sm" variant={flagship.subjectId === subjectId ? "primary" : "secondary"} onClick={() => setSubjectId(flagship.subjectId)}>
            {getSubject(flagship.subjectId)?.name ?? flagship.subjectId}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatTile label="Any trusted question" value={`${metrics.anyTrustedPct}%`} sub={`${metrics.statements} statements`} />
        <StatTile label="Trusted recall" value={`${metrics.recallPct}%`} />
        <StatTile label="Trusted application" value={`${metrics.applicationPct}%`} />
        <StatTile label="Trusted transfer" value={`${metrics.transferPct}%`} />
        <StatTile label="Full trusted depth" value={`${metrics.completePct}%`} />
      </div>

      <section aria-labelledby="queue-heading" className="space-y-3">
        <SectionHeading title="Verify next" hint="Ordered by how much new trusted coverage each review unlocks, assuming earlier ones in the list are approved." />
        <h2 id="queue-heading" className="sr-only">Verify next</h2>
        <Panel>
          {data.queue.length ? (
            <ol className="space-y-2 text-sm">
              {data.queue.map((item, index) => (
                <li key={item.questionId} className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="tabular-nums text-ink3 w-6">{index + 1}.</span>
                  <code className="text-xs text-ink break-all">{item.questionId}</code>
                  <Pill>{item.category}</Pill>
                  <span className="text-xs text-ink2">{item.gain}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-ink3">Nothing is waiting for review that would add coverage.</p>
          )}
          <p className="text-xs text-ink3 mt-3">Approve through the review ledger (<code>npm run wjec:review:batch</code> then <code>wjec:review:apply</code>); this page never approves anything.</p>
        </Panel>
      </section>

      <section aria-labelledby="statements-heading" className="space-y-3">
        <SectionHeading
          title="Statements"
          hint={`${shown.length} of ${data.rows.length} shown`}
          action={<Button size="sm" variant="secondary" onClick={download}>Download CSV</Button>}
        />
        <h2 id="statements-heading" className="sr-only">Statements</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter statements">
          {([["gaps", "Not fully covered"], ["unreviewed", "Authored, unreviewed"], ["none-authored", "No questions"], ["all", "All"]] as const).map(([id, label]) => (
            <Button key={id} size="sm" variant={filter === id ? "primary" : "secondary"} onClick={() => setFilter(id)}>{label}</Button>
          ))}
        </div>
        <div className="overflow-x-auto card">
          <table className="w-full text-xs">
            <thead className="text-left text-ink3">
              <tr>
                {["Statement", "Unit / paper", "Topic", "Recall", "Appl.", "Hard appl.", "Transfer", "Misconc.", "Synoptic", "Authored", "Reviewed", "Families", "Verification", "Student evidence", "Review", "Missing", "Checked", "Release"].map((h) => (
                  <th key={h} scope="col" className="px-2 py-2 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 400).map((row) => (
                <tr key={row.statementId} className="border-t border-line align-top">
                  <th scope="row" className="px-2 py-1.5 font-medium whitespace-nowrap text-left">{row.ref}</th>
                  <td className="px-2 py-1.5">{row.unit}{row.paper ? ` · ${row.paper}` : ""}</td>
                  <td className="px-2 py-1.5">{row.topic}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.recall}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.application}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.hardApplication}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.transfer}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.misconception}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.synoptic}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.authored}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.reviewed}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.trustedFamilies}</td>
                  <td className="px-2 py-1.5">{row.verification}</td>
                  <td className="px-2 py-1.5">{row.studentEvidence.replace(/-/g, " ")}</td>
                  <td className="px-2 py-1.5">{row.reviewStatus.replace(/-/g, " ")}</td>
                  <td className="px-2 py-1.5">{row.missing.length ? row.missing.join(", ") : "none"}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{row.lastChecked ?? "unknown"}</td>
                  <td className="px-2 py-1.5">{row.releaseReady ? "ready" : "blocked"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown.length > 400 ? <p className="text-xs text-ink3">First 400 shown; download the CSV for all rows.</p> : null}
      </section>
    </div>
  );
}
