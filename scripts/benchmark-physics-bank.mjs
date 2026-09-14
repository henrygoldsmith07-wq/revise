import { build } from "esbuild";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

const started = performance.now();
const bundle = await build({
  stdin: { contents: `
    export { seedQuestions as questions } from "./src/content";
    export { wjecCapabilities as capabilities } from "./src/content/capabilities";
    export { auditPhysicsBank, buildPhysicsBankIndex } from "./src/domain/physics-bank-audit";
    export { selectLearningAction } from "./src/domain/learning-action";
  `, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false,
});
const bundledAt = performance.now();
const data = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const importedAt = performance.now();
const questions = data.questions.filter((question) => question.subjectId === "wjec-alevel-physics");
const capabilities = data.capabilities.filter((node) => node.subjectId === "wjec-alevel-physics");
const topicId = questions[0]?.topicIds[0] ?? "wjec-alevel-physics.kinematics-dynamics";
const now = new Date("2026-09-13T12:00:00.000Z");

const profileStarted = performance.now();
const index = data.buildPhysicsBankIndex(questions);
const profileMs = performance.now() - profileStarted;
const beforeAuditHeap = process.memoryUsage().heapUsed;
const auditStarted = performance.now();
const audit = data.auditPhysicsBank(questions);
const auditMs = performance.now() - auditStarted;
const afterAuditHeap = process.memoryUsage().heapUsed;

function attempt(question, index) {
  return {
    id: `physics-load-attempt-${index}`,
    userId: "physics-load-test",
    questionId: question.id,
    subjectId: question.subjectId,
    topicIds: question.topicIds,
    answers: {},
    marked: [],
    awarded: 0,
    max: question.totalMarks,
    feedback: "load benchmark",
    markedBy: "rubric",
    elapsedMs: 2000,
    mode: "practice",
    createdAt: new Date(now.getTime() - index * 60_000).toISOString(),
  };
}

const shortHistory = questions.slice(0, Math.min(100, questions.length)).map(attempt);
const longHistory = Array.from({ length: 2000 }, (_, index) => attempt(questions[index % questions.length], index));
function rank(attempts) {
  const rankStarted = performance.now();
  const action = data.selectLearningAction({ topicId, nodes: capabilities, questions, attempts, mistakes: [], now });
  return { elapsedMs: performance.now() - rankStarted, actionKind: action?.kind ?? null, actionId: action?.question.id ?? null };
}
const shortRank = rank(shortHistory);
const longRank = rank(longHistory);

const report = {
  subjectId: "wjec-alevel-physics",
  questionCount: questions.length,
  partCount: index.partCount ?? index.entries.length,
  profileCount: index.entries.length,
  startupMs: importedAt - started,
  bundleMs: bundledAt - started,
  profileMs,
  auditMs,
  bankAuditElapsedMs: audit.elapsedMs,
  shortHistoryAttempts: shortHistory.length,
  longHistoryAttempts: longHistory.length,
  shortRankingMs: shortRank.elapsedMs,
  longRankingMs: longRank.elapsedMs,
  shortAction: shortRank.actionKind,
  longAction: longRank.actionKind,
  estimatedComparisons: audit.estimatedComparisons,
  numericalClaimsDetected: audit.numericalClaimsDetected,
  numericalClaimsParsed: audit.numericalClaimsParsed,
  numericalClaimsVerified: audit.numericalClaimsVerified,
  numericalClaimsUnresolved: audit.numericalClaimsUnresolved,
  numericalCoveragePercent: audit.numericalCoveragePercent,
  derivedClaimsDetected: audit.derivedClaimsDetected,
  derivedClaimsParsed: audit.derivedClaimsParsed,
  derivedClaimsVerified: audit.derivedClaimsVerified,
  derivedClaimsUnresolved: audit.derivedClaimsUnresolved,
  derivedCoveragePercent: audit.derivedCoveragePercent,
  dimensionalClaimsDetected: audit.dimensionalClaimsDetected,
  dimensionalChecks: audit.dimensionalChecks,
  dimensionalVerified: audit.dimensionalVerified,
  dimensionalUnresolved: audit.dimensionalUnresolved,
  dimensionalCoveragePercent: audit.dimensionalCoveragePercent,
  symbolicDimensionalChecks: audit.symbolicDimensionalChecks,
  symbolicDimensionalVerified: audit.symbolicDimensionalVerified,
  symbolicDimensionalErrors: audit.symbolicDimensionalErrors,
  symbolicDimensionalUnresolved: audit.symbolicDimensionalUnresolved,
  schemeAnswerChecks: audit.schemeAnswerChecks,
  schemeAnswerVerified: audit.schemeAnswerVerified,
  schemeAnswerCandidates: audit.schemeAnswerCandidates,
  schemeAnswerUnresolved: audit.schemeAnswerUnresolved,
  schemeAnswerMatchedQuantities: audit.schemeAnswerMatchedQuantities,
  schemeAnswerUnmatchedSchemeQuantities: audit.schemeAnswerUnmatchedSchemeQuantities,
  schemeAnswerUnmatchedAnswerQuantities: audit.schemeAnswerUnmatchedAnswerQuantities,
  schemeAnswerAmbiguousPairings: audit.schemeAnswerAmbiguousPairings,
  schemeAnswerCoveragePercent: audit.schemeAnswerCoveragePercent,
  plausibilityChecks: audit.plausibilityChecks,
  plausibilityWarnings: audit.plausibilityWarnings,
  numericalReviewQueueItems: audit.numericalReviewQueue.length,
  numericalReviewQueueCounts: audit.numericalReviewQueueCounts,
  heapUsedBeforeBytes: beforeAuditHeap,
  heapUsedAfterBytes: afterAuditHeap,
  heapDeltaBytes: afterAuditHeap - beforeAuditHeap,
  serializedQuestionBytes: Buffer.byteLength(JSON.stringify(questions)),
};
console.log(JSON.stringify(report));
if (process.argv[2]) await writeFile(resolve(process.argv[2]), JSON.stringify(report, null, 2));
