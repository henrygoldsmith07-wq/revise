import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `
      export {
        seedQuestions as questions,
        isSeedWjecReleaseQuestion as releaseQuestion,
        seedHumanVerificationLedgerIssues as ledgerIssues,
        seedWjecReleaseSetIssues as releaseSetIssues
      } from "./src/content";
      export { allTopics } from "./src/domain/curriculum";
      export { wjecCapabilities as capabilities, wjecPrerequisiteReviewLedgerIssues as prerequisiteLedgerIssues } from "./src/content/capabilities";
      export { FLAGSHIP_SUBJECTS as flagships } from "./src/domain/flagship";
      export {
        flagshipTrustReadinessSet as report,
        flagshipTrustReadiness as readiness,
        buildFlagshipReviewPlan as plan
      } from "./src/domain/flagship-trust";
      export { approvalThroughputReport, loadRuntimeRowsFromPostgres } from "./src/lib/reviewer/review-throughput";
      export { default as committedAuditLog } from "./src/content/reviews/wjec-review-audit-log.json";
      export { default as committedLedger } from "./src/content/reviews/wjec-human-verification.json";
    `,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});

const data = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const topics = data.allTopics();
const rows = data.report({
  topics,
  questions: data.questions,
  releaseQuestion: data.releaseQuestion,
});
const plans = Object.fromEntries(data.flagships.map((flagship) => [
  flagship.subjectId,
  data.plan({
    subjectId: flagship.subjectId,
    topics,
    questions: data.questions,
    limit: 10,
    preferredQuestion: data.releaseQuestion,
  }),
]));
const authoringCeilings = Object.fromEntries(data.flagships.map((flagship) => {
  const ceiling = data.readiness({
    subjectId: flagship.subjectId,
    topics,
    questions: data.questions,
    trustedQuestion: () => true,
    releaseQuestion: () => true,
  });
  return [flagship.subjectId, {
    coreStatements: ceiling.statementsMeetingCoreTrustBar,
    statementsTotal: ceiling.statementsTotal,
    gapStatements: ceiling.statements.filter((row) => !row.meetsCoreTrustBar).length,
    statementSlotDeficit: ceiling.statementReviewSlotDeficit,
    releaseReachableFromCurrentBank: ceiling.releaseReady,
  }];
}));
const staleApprovals = data.ledgerIssues.filter((issue) =>
  issue.kind === "historical-fingerprint" || issue.kind === "unknown-question").length;
const ledgerBlockers = data.ledgerIssues.filter((issue) => issue.blocking);
const releaseSetBlockers = data.releaseSetIssues.filter((issue) => issue.blocking);
const prerequisiteLedgerBlockers = data.prerequisiteLedgerIssues.filter((issue) => issue.blocking);
const prerequisiteTrust = Object.fromEntries(data.flagships.map((flagship) => {
  let total = 0, approved = 0, rejected = 0, missingRationale = 0;
  for (const node of data.capabilities.filter((candidate) => candidate.subjectId === flagship.subjectId)) {
    for (const prerequisiteId of node.prerequisites) {
      total += 1;
      const status = node.prerequisiteReviews?.[prerequisiteId]?.status;
      if (status === "approved") approved += 1;
      if (status === "rejected") rejected += 1;
      if (!node.prerequisiteRationales?.[prerequisiteId]?.trim()) missingRationale += 1;
    }
  }
  return [flagship.subjectId, { total, approved, rejected, pending: total - approved - rejected, missingRationale }];
}));
// Approval throughput reads the runtime review log (reviewer-portal
// decisions in public.review_audit_events) when TEST_DATABASE_URL is set, the
// same gate as the real-Postgres test suites, and the committed ledger
// otherwise. Measurement only; see src/lib/reviewer/review-throughput.ts.
async function readRuntimeRows() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) return { rows: null, unavailableReason: "runtime-not-configured" };
  let client;
  try {
    const { default: pg } = await import("pg");
    client = new pg.Client({ connectionString });
    await client.connect();
    const rows = await data.loadRuntimeRowsFromPostgres((sql, params) => client.query(sql, params));
    return { rows };
  } catch (error) {
    console.error(`Runtime review log unavailable (${error?.code ?? error?.message ?? "unknown error"}); approval throughput falls back to the committed ledger.`);
    return { rows: null, unavailableReason: "runtime-unavailable" };
  } finally {
    await client?.end().catch(() => {});
  }
}
const throughput = data.approvalThroughputReport({
  questions: data.questions,
  subjectIds: data.flagships.map((flagship) => flagship.subjectId),
  nowMs: Date.now(),
  committedAuditLog: data.committedAuditLog,
  committedLedger: data.committedLedger,
  ...(await readRuntimeRows()),
});
const reviewVelocity = throughput.bySubject;
const reviewVelocitySource = throughput.source;
const throughputSourceLine = reviewVelocitySource.kind === "runtime"
  ? `Approval throughput source: runtime review log (committed chain + ${reviewVelocitySource.runtimeEvents} portal event(s), chain verified).`
  : reviewVelocitySource.reason === "runtime-chain-failed"
    ? `Approval throughput source: committed ledger; the runtime review chain FAILED verification (${reviewVelocitySource.issues?.length ?? 0} issue(s)) and was not counted.`
    : reviewVelocitySource.reason === "runtime-unavailable"
      ? "Approval throughput source: committed ledger; the runtime review log could not be read."
      : "Approval throughput source: committed ledger only; portal approvals not yet pulled are not counted (set TEST_DATABASE_URL to read the runtime log).";
const json = process.argv.includes("--json");
const check = process.argv.includes("--check");
const trustBlockers = [...ledgerBlockers, ...prerequisiteLedgerBlockers, ...releaseSetBlockers];

if (json) {
  console.log(JSON.stringify({
    rows,
    plans,
    ledger: { staleApprovals, blockers: ledgerBlockers },
    releaseSet: { blockers: releaseSetBlockers },
    prerequisites: { bySubject: prerequisiteTrust, blockers: prerequisiteLedgerBlockers },
    reviewVelocity,
    reviewVelocitySource,
    authoringCeilings,
  }, null, 2));
} else {
  console.log("WJEC flagship trusted assessment depth");
  console.log("");
  for (const row of rows) {
    const trustedShare = row.statementsTotal
      ? Math.round(row.trustedStatementShare * 1000) / 10
      : 0;
    const coreShare = row.statementsTotal
      ? Math.round(row.coreTrustShare * 1000) / 10
      : 0;
    console.log(
      [
        row.subjectId,
        `approved questions ${row.trustedQuestions}/${row.questionsTotal}`,
        `statements with trusted evidence ${row.statementsWithTrustedQuestions}/${row.statementsTotal} (${trustedShare}%)`,
        `trusted core ${row.statementsMeetingCoreTrustBar}/${row.statementsTotal} (${coreShare}%)`,
        `statement slots remaining ${row.statementReviewSlotDeficit}`,
        `review queue ${row.reviewQueue}`,
        `release approved ${row.trustedReleaseQuestions}/${row.releaseQuestionsTotal}`,
        `release core ${row.releaseStatementsMeetingCoreTrustBar}/${row.statementsTotal}`,
        `release slots remaining ${row.releaseStatementReviewSlotDeficit}`,
        `release ${row.releaseReady ? "ready" : "blocked"}`,
      ].join(" | "),
    );
    const velocity = reviewVelocity[row.subjectId];
    const ceiling = authoringCeilings[row.subjectId];
    const prerequisites = prerequisiteTrust[row.subjectId];
    console.log(`  approval throughput: ${velocity.approved7d} in 7d / ${velocity.approved30d} in 30d`);
    console.log(
      `  authored ceiling: ${ceiling.coreStatements}/${ceiling.statementsTotal} core; ` +
      `${ceiling.gapStatements} statements still need authored depth; ${ceiling.statementSlotDeficit} slots missing`,
    );
    console.log(`  prerequisite graph: ${prerequisites.approved}/${prerequisites.total} approved; ${prerequisites.rejected} rejected; ${prerequisites.pending} pending; ${prerequisites.missingRationale} blocked on missing rationale`);
    const next = plans[row.subjectId] ?? [];
    if (next.length) {
      console.log(`  next review batch: ${next.map((item) => item.questionId).join(", ")}`);
    }
  }
  console.log("");
  console.log("Trusted core = at least four approved questions spanning recall, application and transfer.");
  console.log("Statement slots remaining is a statement-level deficit, not a claim about the minimum number of human reviews; one question may cover multiple statements.");
  console.log("Release ready = every explicit release-set question approved and every statement meets trusted core within that set.");
  console.log("Authored ceiling = release/core depth if every currently eligible bank question were approved; it separates authoring blockers from review blockers.");
  console.log(`Historical/stale ledger attestations: ${staleApprovals}; question-ledger blockers: ${ledgerBlockers.length}; prerequisite-ledger blockers: ${prerequisiteLedgerBlockers.length}; release-set blockers: ${releaseSetBlockers.length}.`);
  console.log("Draft/authored question volume is intentionally excluded.");
  console.log(throughputSourceLine);
}

if (check) {
  if (trustBlockers.length) {
    console.error(`WJEC trust configuration has ${trustBlockers.length} blocking issue(s).`);
    process.exitCode = 1;
  } else if (!json) {
    console.log("WJEC trust configuration: no blocking ledger or release-set issues.");
  }
}
