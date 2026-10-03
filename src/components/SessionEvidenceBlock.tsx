"use client";

// Session closure: what changed, what is still weak, what evidence this session
// created, and what happens next.

import { useMemo } from "react";
import { buildMarkRecovery } from "@/domain/mark-recovery";
import { buildSessionEvidence } from "@/domain/session-evidence";
import { useStoreFields } from "@/state/store";
import type { Attempt } from "@/domain/types";
import { getTopic } from "@/domain/curriculum";

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
    const after = buildMarkRecovery({ mistakes, attempts: store.attempts, questions: store.questions }).totals;
    return buildSessionEvidence({ attempts, before, after, topicTitle: (id) => getTopic(id)?.title ?? id });
  }, [attempts, store.attempts, store.mistakes, store.questions, store.settings.subjectIds]);
  if (!evidence) return null;
  return (
    <div className="space-y-2 text-xs text-ink2 text-left" aria-label="What this session did">
      <Section title="What changed" lines={evidence.changed} />
      <Section title="Still weak" lines={evidence.stillWeak} />
      <Section title="Evidence created" lines={evidence.evidence.lines} />
      <Section title="What happens next" lines={[evidence.next]} />
    </div>
  );
}
