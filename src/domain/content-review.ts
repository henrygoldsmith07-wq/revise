import type { Id, Question, Topic, VerificationStatus } from "./types";
import { allTopics } from "@/domain/curriculum";
import type { SubjectCoverage } from "./coverage";
import type { ModerationEntry } from "./moderation";
import { entriesWithProvenanceGaps } from "./moderation";

// ---------------------------------------------------------------------------
// Teacher / content-review tooling + curriculum regression checks.
//
// These are the *offline* guard rails a teacher or reviewer runs before
// shipping new content. No network, no AI — just structural audits that must
// stay green in CI. The heavier checks already live in
// `scripts/validate-curriculum.mjs` and `tests/coverage.test.ts`; this module
// exposes them as importable helpers so the review UI can render them live.
// ---------------------------------------------------------------------------

export interface ReviewFlag {
  kind: "unverified"|"no-aos"|"no-specPoints"|"thin-specPoints"|"unmapped-question"|"question-validation"|"stale-check";
  id: Id;
  detail: string;
}

export interface RegressionReport {
  flags: ReviewFlag[];
  staleCount: number;
  unmappedQuestions: Id[];
  thinTopics: Id[];
  ok: boolean;
}

/** Freshness window: a statement not checked within this many days is stale. */
const STALE_DAYS = 365;

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime())/86_400_000);
}

export function regressionReport(input: {
  topics: Topic[];
  questions: Question[];
  coverageBySubject?: Map<Id, SubjectCoverage>;
  today?: string;
}): RegressionReport {
  const today = input.today ?? new Date().toISOString().slice(0,10);
  const flags: ReviewFlag[] = [];
  const questionIds = new Set(input.questions.map((q)=> q.id));
  const topicIds = new Set(input.topics.map((t)=> t.id));
  // Topics
  for (const t of input.topics) {
    if ((t.specPoints?.length ?? 0) === 0) flags.push({ kind: "no-specPoints", id: t.id, detail: `${t.title}: no specPoints` });
    else if ((t.specPoints?.length ?? 0) < 3) flags.push({ kind: "thin-specPoints", id: t.id, detail: `${t.title}: only ${t.specPoints?.length} specPoints (<3)` });
    if (!t.aos?.length) flags.push({ kind: "no-aos", id: t.id, detail: `${t.title}: no AOs` });
    if (t.verification === "unverified") flags.push({ kind: "unverified", id: t.id, detail: `${t.title}: unverified` });
    // Stale: topic or any statement not checked within window
    const last = t.lastChecked ?? t.specPoints?.[0]?.lastChecked ?? null;
    if (last && daysBetween(last, today) > STALE_DAYS) flags.push({ kind: "stale-check", id: t.id, detail: `${t.title}: lastChecked ${last} (>365d)` });
  }
  // Questions: every question should map to specPointIds and AOs at the part level
  const unmapped: Id[] = [];
  for (const q of input.questions) {
    if (q.validation && (q.validation.stage !== "validated" || !q.validation.report.ok)) {
      const reason = q.validation.report.issues[0]?.message ?? `stage is ${q.validation.stage}`;
      flags.push({ kind: "question-validation", id: q.id, detail: `${q.id}: validation incomplete — ${reason}` });
    }
    const hasMapping = (q.specPointIds?.length ?? 0) > 0 || q.parts.some((p)=> (p.specPointIds?.length ?? 0) > 0);
    if (!hasMapping) { unmapped.push(q.id); flags.push({ kind: "unmapped-question", id: q.id, detail: `${q.id}: no specPoint mapping` }); }
    // Dangling topic refs
    for (const tid of q.topicIds) if (!topicIds.has(tid)) flags.push({ kind: "unmapped-question", id: q.id, detail: `${q.id}: unknown topic ${tid}` });
  }
  const thinTopics = input.topics.filter((t)=> (t.specPoints?.length ?? 0) < 3).map((t)=> t.id);
  const staleCount = flags.filter((f)=> f.kind==="stale-check").length;
  return { flags, staleCount, unmappedQuestions: unmapped, thinTopics, ok: flags.length===0 };
}

/** Light teacher-facing summary for a subject. */
export function teacherSummary(input: { subjectLabel: string; coverage: SubjectCoverage; report: RegressionReport }): string[] {
  const lines: string[] = [];
  lines.push(`${input.subjectLabel}: ${input.coverage.statementCoverage}% statement coverage, ${input.coverage.examQuestions} questions.`);
  if (input.report.ok) lines.push("Regression: green — no flags.");
  else lines.push(`Regression: ${input.report.flags.length} flags (${input.report.staleCount} stale, ${input.report.unmappedQuestions.length} unmapped).`);
  for (const f of input.report.flags.slice(0,5)) lines.push(`- [${f.kind}] ${f.detail}`);
  return lines;
}

/** Teacher summary that also surfaces moderation queue + provenance gaps. */
export function teacherSummaryWithModeration(input: {
  subjectLabel: string;
  coverage: SubjectCoverage;
  report: RegressionReport;
  moderationEntries?: ModerationEntry[];
}): string[] {
  const lines = teacherSummary(input);
  const entries = input.moderationEntries;
  if (!entries?.length) return lines;
  const pending = entries.filter((e) => e.status === "pending_review").length;
  const drafts = entries.filter((e) => e.status === "draft").length;
  const gaps = entriesWithProvenanceGaps(entries).length;
  if (pending || drafts || gaps) {
    lines.push(`Moderation: ${pending} pending, ${drafts} drafts${gaps ? `, ${gaps} with provenance gaps` : ""}.`);
    for (const g of entriesWithProvenanceGaps(entries).slice(0, 3)) {
      lines.push(`- [provenance] ${g.entry.contentKind} ${g.entry.contentId} v${g.entry.version}: ${g.check.issues[0] ?? "missing provenance"}`);
    }
  } else {
    lines.push("Moderation: all clear — queue empty, provenance complete.");
  }
  return lines;
}
