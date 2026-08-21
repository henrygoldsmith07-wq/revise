"use client";

import { useMemo } from "react";
import { seedCardsForTopic } from "@/content/seed-cards";
import { seedQuestions } from "@/content";
import { allSubjects, allTopics, topicsFor } from "@/domain/curriculum";
import { coverageForSubject } from "@/domain/coverage";
import { SPEC_MANIFEST } from "@/domain/spec";
import { specificationCoverageAudit } from "@/domain/specification-audit";
import { validateWorkedSolutions } from "@/domain/working-analysis";
import { Panel, Pill, ProgressBar, SectionHeading } from "./ui";

export function CoverageCard({ subjectId }: { subjectId?: string }) {
  const { rows, audit, workedSolution } = useMemo(() => {
    const subjects = subjectId ? allSubjects().filter((s) => s.id === subjectId) : allSubjects();
    const subjectIds = new Set(subjects.map((subject) => subject.id));
    const topics = subjects.flatMap((subject) => topicsFor(subject.id));
    const questions = seedQuestions.filter((q) => subjects.some((subject) => subject.id === q.subjectId));
    const cards = topics.flatMap((topic) => seedCardsForTopic(topic, "coverage"));
    const rows = subjects.map((subject) => {
      const subjectTopics = topicsFor(subject.id);
      const subjectQuestions = seedQuestions.filter((q) => q.subjectId === subject.id);
      const cardsPerTopic = new Map<string, number>(
        subjectTopics.map((t) => [t.id, seedCardsForTopic(t, "coverage").length]),
      );
      const cov = coverageForSubject(subjectTopics, subjectQuestions, cardsPerTopic);
      const spec = SPEC_MANIFEST.find((s) => s.subjectId === subject.id);
      return { subject, cov, spec };
    });
    return {
      rows,
      audit: specificationCoverageAudit({
        subjects,
        topics,
        questions,
        cards,
        manifest: SPEC_MANIFEST.filter((entry) => subjectIds.has(entry.subjectId)),
      }),
      workedSolution: validateWorkedSolutions(questions),
    };
  }, [subjectId]);

  if (!rows.length) return null;

  const auditTone = audit.status === "pass" ? "success" : audit.status === "review" ? "review" : "danger";
  const auditLabel = audit.status === "pass" ? "Audit passed" : audit.status === "review" ? "Review needed" : "Audit failed";
  const visibleIssues = audit.issues.slice(0, 5);
  const workedSolutionTone = workedSolution.status === "pass" ? "success" : workedSolution.status === "review" ? "review" : "danger";
  const workedSolutionLabel = workedSolution.status === "pass" ? "Validation passed" : workedSolution.status === "review" ? "Review needed" : "Validation failed";
  const visibleWorkedSolutionIssues = workedSolution.issues.slice(0, 5);

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Specification coverage audit"
        hint="Checks the manifest denominator, statement provenance, freshness, retrieval links and exam-question mappings."
      />
      <Panel>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-ink">{auditLabel}</p>
            <p className="text-xs text-ink3 mt-0.5">
              {audit.totals.authoredStatements}/{audit.totals.manifestStatements || "—"} manifest statements authored
            </p>
          </div>
          <Pill tone={auditTone}>{audit.totals.errors} errors · {audit.totals.warnings} warnings</Pill>
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="card p-2">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Verified</p>
            <p className="text-sm font-semibold tabular-nums">{audit.totals.verifiedStatements}</p>
          </div>
          <div className="card p-2">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">With cards</p>
            <p className="text-sm font-semibold tabular-nums">{audit.totals.statementsWithCards}</p>
          </div>
          <div className="card p-2">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">With questions</p>
            <p className="text-sm font-semibold tabular-nums">{audit.totals.statementsWithQuestions}</p>
          </div>
          <div className="card p-2">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Un-authored</p>
            <p className="text-sm font-semibold tabular-nums">{audit.totals.missingManifestStatements}</p>
          </div>
        </div>
        {visibleIssues.length ? (
          <div className="mt-3 pt-3 border-t border-line">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1.5">Highest-priority findings</p>
            <ul className="space-y-1">
              {visibleIssues.map((issue, index) => (
                <li key={`${issue.subjectId}:${issue.kind}:${issue.id}:${index}`} className="flex items-start gap-2 text-xs">
                  <Pill tone={issue.severity === "error" ? "danger" : "review"}>{issue.severity}</Pill>
                  <span className="text-ink2">{issue.detail}</span>
                </li>
              ))}
            </ul>
            {audit.issues.length > visibleIssues.length ? (
              <p className="text-[11px] text-ink3 mt-2">+ {audit.issues.length - visibleIssues.length} more findings in the audit report.</p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-ink3 mt-3">All tracked statements have valid metadata and linked learning content.</p>
        )}
      </Panel>

      <SectionHeading
        title="Worked solution validation"
        hint="Checks authored model answers against every mark-scheme point, including numerical results."
      />
      <Panel>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-ink">{workedSolutionLabel}</p>
            <p className="text-xs text-ink3 mt-0.5">
              {workedSolution.passedParts}/{workedSolution.partCount} question parts pass the answer-key checks
            </p>
          </div>
          <Pill tone={workedSolutionTone}>{workedSolution.errors} errors · {workedSolution.warnings} warnings</Pill>
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="card p-2">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Questions</p>
            <p className="text-sm font-semibold tabular-nums">{workedSolution.questionCount}</p>
          </div>
          <div className="card p-2">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Parts</p>
            <p className="text-sm font-semibold tabular-nums">{workedSolution.partCount}</p>
          </div>
          <div className="card p-2">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Passing</p>
            <p className="text-sm font-semibold tabular-nums">{workedSolution.passedParts}</p>
          </div>
          <div className="card p-2">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Findings</p>
            <p className="text-sm font-semibold tabular-nums">{workedSolution.issues.length}</p>
          </div>
        </div>
        {visibleWorkedSolutionIssues.length ? (
          <div className="mt-3 pt-3 border-t border-line">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1.5">Highest-priority findings</p>
            <ul className="space-y-1">
              {visibleWorkedSolutionIssues.map((issue, index) => (
                <li key={`${issue.questionId}:${issue.partId}:${issue.kind}:${index}`} className="flex items-start gap-2 text-xs">
                  <Pill tone={issue.severity === "error" ? "danger" : "review"}>{issue.severity}</Pill>
                  <span className="text-ink2">
                    <span className="font-semibold">{issue.questionId} · {issue.partId}</span> {issue.detail}
                  </span>
                </li>
              ))}
            </ul>
            {workedSolution.issues.length > visibleWorkedSolutionIssues.length ? (
              <p className="text-[11px] text-ink3 mt-2">+ {workedSolution.issues.length - visibleWorkedSolutionIssues.length} more findings in the validation report.</p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-ink3 mt-3">Every authored model answer covers its mark-scheme points.</p>
        )}
      </Panel>

      <SectionHeading
        title="Specification coverage"
        hint="Statement-level, measurable. Each specPoint is one examinable claim with its own provenance. This is the moat."
      />
      <div className="grid gap-3">
        {rows.map(({ subject, cov, spec }) => {
          // honest denominator: use specPoint count when available, spec manifest otherwise, topics as last fallback
          const showStatements = cov.specPointsTotal > 0;
          const headline = showStatements
            ? `${cov.specPointsVerified}/${cov.specPointsTotal} statements verified · ${cov.statementCoverage}%`
            : `${cov.coveragePercent}% topic coverage`;
          const tone = showStatements
            ? cov.statementCoverage >= 85 ? "success" : cov.statementCoverage >= 50 ? "review" : undefined
            : cov.coveragePercent >= 90 ? "success" : cov.coveragePercent >= 70 ? "review" : undefined;
          const progress = showStatements ? cov.statementCoverage / 100 : cov.coveragePercent / 100;
          const totalStatements = spec?.statementsTotal ?? cov.specPointsTotal;
          return (
          <Panel key={subject.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-ink">
                {subject.name}{" "}
                <span className="font-normal text-ink3">
                  · {subject.specCode ?? subject.id} · {spec?.version ?? cov.specVersion ?? "—"}
                </span>
              </p>
              <Pill tone={tone}>
                {headline}
              </Pill>
            </div>

            <div className="mt-3">
              <ProgressBar value={progress} tone={progress >= 0.8 ? "success" : "accent"} />
            </div>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <div className="card p-2">
                <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Topics</p>
                <p className="text-sm font-semibold tabular-nums">
                  {cov.topicsCovered}/{cov.topicsTotal}
                </p>
              </div>
              <div className="card p-2">
                <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Statements</p>
                <p className="text-sm font-semibold tabular-nums">{cov.specPointsTotal || "—"}</p>
                <p className="text-[11px] text-ink3">of {totalStatements || "—"} spec</p>
              </div>
              <div className="card p-2">
                <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Retrieval items</p>
                <p className="text-sm font-semibold tabular-nums">{cov.retrievalItems}</p>
                <p className="text-[11px] text-ink3">{cov.specPointsLearnable} statements with cards</p>
              </div>
              <div className="card p-2">
                <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Exam questions</p>
                <p className="text-sm font-semibold tabular-nums">{cov.examQuestions}</p>
                <p className="text-[11px] text-ink3">{cov.specPointsAssessable} statements assessed</p>
              </div>
              <div className="card p-2">
                <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Last checked</p>
                <p className="text-sm font-semibold tabular-nums">{cov.lastChecked ?? spec?.lastChecked ?? "—"}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Pill>Topics: checked {cov.byVerification.checked ?? 0} · verified {cov.byVerification.verified ?? 0}/{cov.topicsTotal}</Pill>
              <Pill>Statements: checked {cov.byStatementVerification?.checked ?? 0} · verified {cov.specPointsVerified}/{cov.specPointsTotal}</Pill>
              {spec?.statementsTotal ? (
                <Pill tone="accent">
                  Spec {cov.specPointsTotal}/{spec.statementsTotal} statements authored
                </Pill>
              ) : null}
            </div>

            {cov.gaps.filter(g => g.kind === "no-spec-points").length ? (
              <p className="text-[11px] text-ink3 mt-2">
                {cov.gaps.filter((g) => g.kind === "no-spec-points").length} topics still need fine-grained spec points ·{" "}
                {cov.gaps.filter((g) => g.kind === "statement-no-questions").length} statements without an exam question yet
              </p>
            ) : cov.specPointsTotal ? (
              <p className="text-[11px] text-ink3 mt-2">
                {cov.specPointsVerified} verified statements; {cov.specPointsLearnable} have retrieval coverage, {cov.specPointsAssessable} have exam-question coverage.
              </p>
            ) : null}

            <p className="text-[11px] text-ink3 mt-2">
              {subject.name}: {spec ? `spec ${spec.specCode} v${spec.version}` : "no manifest"} · last checked{" "}
              {spec?.lastChecked ?? cov.lastChecked ?? "—"}
            </p>
          </Panel>
        )})}
      </div>

      <p className="text-[11px] text-ink3">
        Statement coverage uses stable specPoint IDs; the audit above also compares authored statements with the full manifest denominator. Run{" "}
        <code className="px-1 py-0.5 rounded bg-surface2">node scripts/validate-curriculum.mjs</code> in CI to block a
        coverage regression. Full totals: {allTopics().length} topics across {allSubjects().length} subjects.
      </p>
    </div>
  );
}
