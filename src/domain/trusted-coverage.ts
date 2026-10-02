// ---------------------------------------------------------------------------
// Trusted coverage dashboard rows — one per specification statement.
//
// Built on the existing trust predicate and review ledger; nothing here can
// raise a number by adding unverified or generated content. A statement is
// fully covered only with trusted recall, application and transfer items AND
// enough independent trusted items from different question families that a
// student cannot "prove" mastery by memorising a single question.
// ---------------------------------------------------------------------------

import { questionDepthBySpecPoint, type DepthCategory } from "./flagship";
import { questionFamilies } from "./learning-evidence";
import { humanVerifiedWjecQuestion } from "./physics-content-review";
import type { Id, Question, Subject, Topic, Unit } from "./types";

export const TRUSTED_DEPTH = { minTrusted: 4, minFamilies: 3 } as const;
const CORE: readonly DepthCategory[] = ["recall", "application", "transfer"];

export type StatementReviewStatus = "none-authored" | "unreviewed" | "partly-reviewed" | "fully-reviewed";

export interface CoverageRow {
  statementId: Id;
  ref: string;
  subjectId: Id;
  unit: string;
  paper: string | null;
  topicId: Id;
  topic: string;
  recall: number;
  application: number;
  transfer: number;
  synoptic: number;
  authored: number;
  reviewed: number;
  trustedFamilies: number;
  verification: "unverified" | "checked" | "verified";
  missing: string[];
  reviewStatus: StatementReviewStatus;
  lastChecked: string | null;
  fullyCovered: boolean;
  releaseReady: boolean;
}

export interface CoverageMetrics {
  statements: number;
  anyTrustedPct: number;
  recallPct: number;
  applicationPct: number;
  transferPct: number;
  completePct: number;
}

export interface CoverageInput {
  subject: Subject;
  topics: readonly Topic[];
  units: readonly Unit[];
  questions: readonly Question[];
  trusted?: (question: Question) => boolean;
  /** Questions that belong to the release set; a statement is release-ready only if all its release items are trusted. */
  release?: (question: Question) => boolean;
  /** Unit title → paper id, when known. Absent means the paper stays null. */
  paperForUnit?: (unit: Unit) => string | null;
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

export function buildCoverageRows(input: CoverageInput): CoverageRow[] {
  const trusted = input.trusted ?? humanVerifiedWjecQuestion;
  const release = input.release ?? (() => true);
  const questions = input.questions.filter((q) => q.subjectId === input.subject.id);
  const unitById = new Map(input.units.map((u) => [u.id, u] as const));
  const depth = new Map(questions.map((q) => [q.id, questionDepthBySpecPoint(q)] as const));
  const rows: CoverageRow[] = [];

  for (const topic of input.topics.filter((t) => t.subjectId === input.subject.id)) {
    const unit = unitById.get(topic.unitId);
    for (const point of topic.specPoints ?? []) {
      const mapped = questions.filter((q) => depth.get(q.id)?.has(point.id));
      const good = mapped.filter(trusted);
      const count = (cat: DepthCategory) => good.filter((q) => depth.get(q.id)?.get(point.id)?.has(cat)).length;
      const families = new Set(good.flatMap((q) => questionFamilies(q)));
      const categories = CORE.filter((cat) => count(cat) > 0);
      const missing = [
        ...CORE.filter((cat) => !categories.includes(cat)).map((cat) => `trusted-${cat}`),
        ...(good.length >= TRUSTED_DEPTH.minTrusted ? [] : [`${TRUSTED_DEPTH.minTrusted - good.length}-more-trusted`]),
        ...(families.size >= TRUSTED_DEPTH.minFamilies ? [] : [`${TRUSTED_DEPTH.minFamilies - families.size}-more-families`]),
      ];
      const releaseItems = mapped.filter(release);
      const verification = good.length === 0 ? (mapped.some((q) => q.verification === "checked" || q.verification === "verified") ? "checked" : "unverified")
        : good.length === mapped.length ? "verified" : "checked";
      rows.push({
        statementId: point.id,
        ref: point.ref,
        subjectId: input.subject.id,
        unit: unit?.title ?? topic.unitId,
        paper: unit && input.paperForUnit ? input.paperForUnit(unit) : null,
        topicId: topic.id,
        topic: topic.title,
        recall: count("recall"),
        application: count("application"),
        transfer: count("transfer"),
        synoptic: count("synoptic"),
        authored: mapped.length,
        reviewed: good.length,
        trustedFamilies: families.size,
        verification,
        missing,
        reviewStatus: !mapped.length ? "none-authored" : !good.length ? "unreviewed" : good.length < mapped.length ? "partly-reviewed" : "fully-reviewed",
        lastChecked: input.subject.spec?.lastChecked ?? null,
        fullyCovered: missing.length === 0,
        releaseReady: missing.length === 0 && releaseItems.every(trusted),
      });
    }
  }
  return rows;
}

export function coverageMetrics(rows: readonly CoverageRow[]): CoverageMetrics {
  const n = rows.length;
  return {
    statements: n,
    anyTrustedPct: pct(rows.filter((r) => r.reviewed > 0).length, n),
    recallPct: pct(rows.filter((r) => r.recall > 0).length, n),
    applicationPct: pct(rows.filter((r) => r.application > 0).length, n),
    transferPct: pct(rows.filter((r) => r.transfer > 0).length, n),
    completePct: pct(rows.filter((r) => r.fullyCovered).length, n),
  };
}

/** Header + rows as CSV for reviewers; fields never contain commas or quotes after quoting. */
export function coverageCsv(rows: readonly CoverageRow[]): string {
  const head = ["statement", "subject", "unit", "paper", "topic", "recall", "application", "transfer", "synoptic", "authored", "reviewed", "families", "verification", "missing", "review", "lastChecked", "fullyCovered", "releaseReady"];
  const q = (v: string | number | boolean | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [head.join(","), ...rows.map((r) => [r.ref, r.subjectId, r.unit, r.paper, r.topic, r.recall, r.application, r.transfer, r.synoptic, r.authored, r.reviewed, r.trustedFamilies, r.verification, r.missing.join(" "), r.reviewStatus, r.lastChecked, r.fullyCovered, r.releaseReady].map(q).join(","))].join("\n");
}
