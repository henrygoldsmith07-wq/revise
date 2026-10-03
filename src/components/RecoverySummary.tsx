"use client";

// Marks recovered, as the progress narrative: this week, and where the marks
// came from. Everything is derived from the recovery ledger.

import { useMemo, useState } from "react";
import { getSubject, topicsFor } from "@/domain/curriculum";
import { efficiencyStatement, measureOutcomes, recurrenceStatement, statement } from "@/domain/outcome-measurement";
import { unseenSupplyByTopic } from "@/domain/supply";
import { trustTier, type TrustTier } from "@/domain/trust-label";
import { realWorldEvidence } from "@/domain/evidence-class";
import { recoveryBreakdown, recoveryWindow, weekLines, type BreakdownBy } from "@/domain/marks-progress";
import { useStoreFields } from "@/state/store";
import { useRecoveryEvidence } from "./recovery-evidence";
import { EvidenceClassNote } from "./EvidenceClassNote";
import { Button } from "./ui";

const BY: Array<[BreakdownBy, string]> = [["subject", "Subject"], ["topic", "Topic"], ["paper", "Paper"], ["cause", "Cause"], ["ao", "Skill (AO)"], ["intervention", "Method"]];

/** One compact line for Today. Hidden until some marks have moved. */
export function WeekLine() {
  const ev = useRecoveryEvidence();
  const week = useMemo(() => recoveryWindow(ev.recovery.items, ev.recovery.now, 7), [ev.recovery]);
  if (!ev.recovery.items.length) return null;
  return (
    <p className="text-sm text-ink2" aria-label="Marks recovered this week">
      <span className="font-medium text-ink">This week:</span> {week.empty ? "no marks moved yet." : weekLines(week).join(" · ")}
    </p>
  );
}

export function RecoverySummaryPanel() {
  const ev = useRecoveryEvidence();
  const store = useStoreFields("attempts");
  const [by, setBy] = useState<BreakdownBy>("subject");
  const week = useMemo(() => recoveryWindow(ev.recovery.items, ev.recovery.now, 7), [ev.recovery]);
  const rows = useMemo(
    () => recoveryBreakdown({ items: ev.recovery.items, mistakes: ev.mistakes, attempts: store.attempts, by, label: (k) => (by === "subject" ? getSubject(k)?.name ?? k : by === "topic" ? ev.topicTitle(k) : k) }),
    [ev, store.attempts, by],
  );
  const t = ev.recovery.totals;
  if (!t.previouslyLost) return null;
  return (
    <section aria-label="Marks recovered" className="card p-4 sm:p-5 space-y-3">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Marks recovered</p>
        <p className="text-sm font-semibold text-ink mt-0.5">{t.statement}</p>
        <ul className="mt-1 text-xs text-ink2 space-y-0.5">
          <li>{t.previouslyLost} marks previously lost</li>
          <li>{t.targeted} targeted by revision</li>
          <li>{t.provisional - t.awaitingProof} provisionally recovered</li>
          <li>{t.awaitingProof} awaiting delayed proof</li>
          <li>{t.proven} proven recovered</li>
          <li>{t.regressed} lost again</li>
          <li>{t.open} still open</li>
        </ul>
        <p className="mt-2 text-xs text-ink3"><span className="font-medium text-ink2">This week:</span> {weekLines(week).join(" · ")}</p>
      </div>
      <details>
        <summary className="cursor-pointer select-none text-sm text-ink2">Where these marks came from</summary>
        <div role="group" aria-label="Group by" className="mt-2 flex flex-wrap gap-1.5">
          {BY.map(([key, label]) => <Button key={key} size="sm" variant={by === key ? "primary" : "secondary"} aria-pressed={by === key} onClick={() => setBy(key)}>{label}</Button>)}
        </div>
        <table className="mt-2 w-full text-xs text-ink2">
          <thead><tr className="text-left text-ink3"><th className="py-1 font-medium">&nbsp;</th><th className="font-medium">Lost</th><th className="font-medium">Proven</th><th className="font-medium">Awaiting</th><th className="font-medium">Open</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.key} className="border-t border-line"><td className="py-1 pr-2 text-ink">{r.label}</td><td>{r.lost}</td><td>{r.proven}</td><td>{r.awaitingProof + r.provisional}</td><td>{r.open}</td></tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}

/** How much real learner evidence exists that Revise works, separate from benchmarks. */
export function RealWorldEvidencePanel() {
  const store = useStoreFields("attempts", "interventionOutcomes", "mistakes", "paperOutcomeLog", "questions", "settings");
  const report = useMemo(
    () => realWorldEvidence({ attempts: store.attempts, mistakes: store.mistakes, questions: store.questions, interventionOutcomes: store.interventionOutcomes ?? [], paperOutcomes: store.paperOutcomeLog ?? [] }),
    [store.attempts, store.interventionOutcomes, store.mistakes, store.paperOutcomeLog, store.questions],
  );
  const outcome = useMemo(() => measureOutcomes({ attempts: store.attempts, mistakes: store.mistakes, questions: store.questions }).learners[0]?.overall ?? null, [store.attempts, store.mistakes, store.questions]);
  const coverage = useMemo(() => store.settings.subjectIds.map((subjectId) => {
    const topics = topicsFor(subjectId);
    const supply = unseenSupplyByTopic(new Set(topics.map((t) => t.id)), store.questions, store.attempts);
    const tiers: Record<TrustTier, number> = { trusted: 0, reference: 0, unverified: 0, insufficient: 0 };
    for (const t of topics) tiers[trustTier({ subjectId, provable: supply[t.id]?.provable ?? 0, practiceOnly: supply[t.id]?.practiceOnly ?? 0 })]++;
    return { subjectId, topics: topics.length, tiers };
  }), [store.attempts, store.questions, store.settings.subjectIds]);
  return (
    <details className="card p-4 sm:p-5">
      <summary className="cursor-pointer select-none text-sm font-medium text-ink2">How much real evidence says this works?</summary>
      <div className="mt-3 space-y-2">
        <EvidenceClassNote kind="real-world-evidence" />
        <p className="text-sm text-ink2">{report.statement}</p>
        <ul className="text-xs text-ink2 space-y-0.5">{report.rows.map((r) => <li key={r.key}>{r.label}: {r.count} of {r.needed}</li>)}</ul>
        {outcome && outcome.chains > 0 ? (
          <div className="space-y-1" aria-label="What your own results show">
            <p className="text-sm font-medium text-ink">What your own results show</p>
            <p className="text-sm text-ink2">{statement(outcome).text}</p>
            <p className="text-xs text-ink3">{recurrenceStatement(outcome).text}</p>
            <p className="text-xs text-ink3">{efficiencyStatement(outcome).text}</p>
          </div>
        ) : null}
        <div className="space-y-1" aria-label="Where Revise can prove improvement">
          <p className="text-sm font-medium text-ink">Where Revise can prove improvement</p>
          <ul className="text-xs text-ink2 space-y-0.5">
            {coverage.map((c) => (
              <li key={c.subjectId}>
                {getSubject(c.subjectId)?.name ?? c.subjectId}: {c.tiers.trusted > 0 ? `${c.tiers.trusted} of ${c.topics} topics have enough checked questions` : c.tiers.reference === c.topics ? "reference material, not human-reviewed against the specification" : "no topic has enough checked questions to prove improvement yet"}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
