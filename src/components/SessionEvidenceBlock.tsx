"use client";

// Session closure: what changed, what is still weak, what evidence this session
// created, and what happens next.

import { useEffect, useMemo } from "react";
import { buildMarkRecovery } from "@/domain/mark-recovery";
import { buildSessionEvidence } from "@/domain/session-evidence";
import { useStoreFields } from "@/state/store";
import type { Attempt } from "@/domain/types";
import { getTopic } from "@/domain/curriculum";
import { LEARNER_STATE_LABEL } from "@/domain/learner-state";
import { ProofCheckBanner } from "./ProofCheckBanner";
import { captureProductEvent } from "@/lib/product-telemetry";
import { Pill } from "./ui";

function Section({ title, lines }: { title: string; lines: string[] }) {
  if (!lines.length) return null;
  return <div><p className="font-semibold text-ink">{title}</p><ul className="mt-0.5 space-y-0.5">{lines.map((l) => <li key={l}>{l}</li>)}</ul></div>;
}

export function SessionEvidenceBlock({ attempts }: { attempts: readonly Attempt[] }) {
  const store = useStoreFields("attempts", "mistakes", "questions", "settings");
  const evidence = useMemo(() => {
    if (!attempts.length) return null;
    const ids = new Set(attempts.map((a) => a.id));
    const subjects = new Set(store.settings.subjectIds);
    const mistakes = store.mistakes.filter((m) => subjects.has(m.subjectId));
    const before = buildMarkRecovery({
      mistakes: mistakes.filter((m) => !m.attemptId || !ids.has(m.attemptId)),
      attempts: store.attempts.filter((a) => !ids.has(a.id)), questions: store.questions,
    }).totals;
    const now = new Date();
    const afterRecovery = buildMarkRecovery({ mistakes, attempts: store.attempts, questions: store.questions, now });
    const waiting = afterRecovery.items.filter((i) => i.state === "awaiting-proof" && i.proofDueAt).map((i) => i.proofDueAt!).sort();
    return buildSessionEvidence({ attempts, before, after: afterRecovery.totals, topicTitle: (id) => getTopic(id)?.title ?? id, now, nextCheckAt: waiting[0] });
  }, [attempts, store.attempts, store.mistakes, store.questions, store.settings.subjectIds]);
  useEffect(() => {
    if (!evidence) return;
    if (evidence.headline.state === "proven") {
      captureProductEvent("proof.succeeded", { count: attempts.length });
      captureProductEvent("mistake.repaired", { count: attempts.length });
    } else if (evidence.headline.state === "regressed") {
      captureProductEvent("proof.failed", { count: attempts.length });
    }
    // Once per session summary mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidence?.headline.state]);
  if (!evidence) return null;
  return (
    <div className="space-y-2 text-xs text-ink2 text-left" aria-label="What this session did">
      <div className="flex flex-wrap items-center gap-2"><Pill tone={evidence.headline.state === "proven" ? "success" : evidence.headline.state === "regressed" || evidence.headline.state === "needs-work" ? "danger" : "review"}>{LEARNER_STATE_LABEL[evidence.headline.state]}</Pill><p className="font-semibold text-ink text-sm">{evidence.headline.text}</p></div>
      {evidence.headline.state === "proven" ? (
        <ProofCheckBanner href="/" state="passed" />
      ) : evidence.headline.state === "regressed" ? (
        <ProofCheckBanner href="/practice?recover=1" state="failed" />
      ) : null}
      <Section title="What changed" lines={evidence.changed} />
      <Section title="Still weak" lines={evidence.stillWeak} />
      <Section title="Evidence created" lines={evidence.evidence.lines} />
      <Section title="What happens next" lines={[evidence.next]} />
      <Section title="Marks recovered so far" lines={evidence.marks} />
    </div>
  );
}
