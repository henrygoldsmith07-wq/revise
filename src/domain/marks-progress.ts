// ---------------------------------------------------------------------------
// Marks recovered as a progress narrative: what moved this week, and where the
// marks came from. Derived from the recovery ledger, so it never counts an
// activity as a recovery. No XP, no completion percentages.
// ---------------------------------------------------------------------------

import type { MistakeRecovery } from "./mark-recovery";
import { ROOT_CAUSE_LABEL, rootCauseOf } from "./mistake-patterns";
import type { Attempt, Mistake } from "./types";

const DAY = 86_400_000;
const round = (n: number) => Math.round(n * 10) / 10;

export interface WeekSummary {
  days: number;
  /** Marks revision touched in the window. */
  targeted: number;
  /** Marks with a first success in the window that is not proof yet. */
  provisional: number;
  /** Marks independently proven in the window. */
  proven: number;
  /** Marks lost again in the window. */
  regressed: number;
  empty: boolean;
}

export function recoveryWindow(items: readonly MistakeRecovery[], now: Date, days = 7): WeekSummary {
  const from = now.getTime() - days * DAY;
  const inside = (iso?: string) => iso !== undefined && Date.parse(iso) > from && Date.parse(iso) <= now.getTime();
  const sum = (pick: (i: MistakeRecovery) => boolean) => round(items.filter(pick).reduce((s, i) => s + i.marks, 0));
  const week = {
    days,
    targeted: sum((i) => inside(i.targetedAt)),
    provisional: sum((i) => inside(i.firstSuccessAt) && i.state !== "regressed"),
    proven: sum((i) => i.state === "proven" && inside(i.provenAt)),
    regressed: sum((i) => i.state === "regressed" && inside(i.regressedAt)),
  };
  return { ...week, empty: week.targeted + week.provisional + week.proven + week.regressed === 0 };
}

export type BreakdownBy = "subject" | "paper" | "topic" | "cause" | "ao" | "intervention";

export interface BreakdownRow {
  key: string;
  label: string;
  lost: number;
  provisional: number;
  awaitingProof: number;
  proven: number;
  regressed: number;
  open: number;
}

export function recoveryBreakdown(input: {
  items: readonly MistakeRecovery[];
  mistakes: readonly Mistake[];
  attempts: readonly Attempt[];
  by: BreakdownBy;
  label?: (key: string) => string;
}): BreakdownRow[] {
  const mistakeById = new Map(input.mistakes.map((m) => [m.id, m] as const));
  const attemptById = new Map(input.attempts.map((a) => [a.id, a] as const));
  const keyOf = (i: MistakeRecovery): string => {
    const m = mistakeById.get(i.mistakeId);
    switch (input.by) {
      case "subject": return i.subjectId;
      case "paper": return i.paperId ?? "none";
      case "topic": return i.topicId;
      case "cause": return m ? rootCauseOf(m) : "unclassified";
      case "ao": return m?.ao ?? "none";
      case "intervention": return (i.firstSuccessAttemptId ? attemptById.get(i.firstSuccessAttemptId)?.mission?.intervention : null) ?? "none";
    }
  };
  const groups = new Map<string, MistakeRecovery[]>();
  for (const i of input.items) groups.set(keyOf(i), [...(groups.get(keyOf(i)) ?? []), i]);
  const none = input.by === "paper" ? "Not from a paper" : input.by === "ao" ? "No assessment objective recorded" : input.by === "intervention" ? "Not attributed to a method" : "Other";
  const labelOf = (key: string) => key === "none" ? none : input.label?.(key) ?? (input.by === "cause" ? ROOT_CAUSE_LABEL[key as keyof typeof ROOT_CAUSE_LABEL] ?? key : key);
  const sum = (rows: MistakeRecovery[], ...states: MistakeRecovery["state"][]) => round(rows.filter((r) => states.includes(r.state)).reduce((s, r) => s + r.marks, 0));
  return [...groups].map(([key, rows]): BreakdownRow => ({
    key, label: labelOf(key), lost: round(rows.reduce((s, r) => s + r.marks, 0)),
    provisional: sum(rows, "provisional"), awaitingProof: sum(rows, "awaiting-proof"), proven: sum(rows, "proven"), regressed: sum(rows, "regressed"),
    open: sum(rows, "open", "targeted", "regressed"),
  })).sort((a, b) => b.lost - a.lost || a.key.localeCompare(b.key));
}

export function weekLines(w: WeekSummary): string[] {
  if (w.empty) return [`Nothing moved in the last ${w.days} days.`];
  const mk = (n: number) => `${n} mark${n === 1 ? "" : "s"}`;
  return [
    `${mk(w.targeted)} targeted`,
    `${mk(w.provisional)} provisionally recovered`,
    `${mk(w.proven)} independently proven`,
    ...(w.regressed > 0 ? [`${mk(w.regressed)} regressed`] : []),
  ];
}
