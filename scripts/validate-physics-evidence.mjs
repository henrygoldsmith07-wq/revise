import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const directoryArg = args.find((arg) => !arg.startsWith("-"));
const strict = args.includes("--strict");
if (!directoryArg || directoryArg === "--help" || directoryArg === "-h") {
  console.log("Usage: node scripts/validate-physics-evidence.mjs <intake-directory> [--strict]");
  console.log("Reads real review/evidence exports and writes physics-evidence-report.json. --strict exits 1 until all release gates pass.");
  process.exit(directoryArg ? 0 : 1);
}

const bundle = await build({
  stdin: { contents: `
    export { seedQuestions as questions } from "./src/content";
    export { wjecCapabilities as capabilities } from "./src/content/capabilities";
    export { wjecPhysics } from "./src/domain/curriculum/wjec-physics";
    export { physicsContentReadiness, humanVerifiedPhysicsQuestion } from "./src/domain/physics-content-review";
    export { auditPhysicsAssessmentQuality, physicsQualityQueue } from "./src/domain/physics-assessment-quality";
    export { buildPhysicsPrerequisiteReviewTemplate, importPhysicsReviewPacket, importPhysicsPrerequisiteReviews, importPhysicsMarkingCorpus, importPhysicsPaperManifests, importPhysicsInterventionOutcomes, importPhysicsExperimentEvidence } from "./src/domain/physics-validation-intake";
  `, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false,
});
const data = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const directory = resolve(directoryArg);

async function readOptional(name) {
  try { return await readFile(resolve(directory, name), "utf8"); }
  catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

const reviewRaw = await readOptional("physics-review-packet.json");
const prerequisiteRaw = await readOptional("physics-prerequisite-review.json");
const corpusRaw = await readOptional("physics-answer-corpus.json");
const papersRaw = await readOptional("physics-paper-manifests.json");
const interventionsRaw = await readOptional("physics-intervention-outcomes.json");
const experimentRaw = await readOptional("physics-experiment.json");

const review = reviewRaw
  ? data.importPhysicsReviewPacket(reviewRaw, data.questions)
  : { updatedQuestions: data.questions, approvedQuestionIds: [], pendingQuestionIds: [], missingQuestionIds: data.questions.filter((q) => q.subjectId === "wjec-alevel-physics").map((q) => q.id), errors: [], warnings: ["physics-review-packet.json is missing"], reviewQueue: [] };
const prerequisite = prerequisiteRaw
  ? data.importPhysicsPrerequisiteReviews(prerequisiteRaw, data.capabilities)
  : data.importPhysicsPrerequisiteReviews("[]", data.capabilities);
const marking = corpusRaw
  ? data.importPhysicsMarkingCorpus(corpusRaw, review.updatedQuestions)
  : { records: [], physicsRecords: [], externalRows: 0, independentlyDoubleMarkedRows: 0, adjudicatedRows: 0, caseCoverage: {}, benchmark: null, errors: [], warnings: ["physics-answer-corpus.json is missing"], readyForCalibration: false };
const papers = papersRaw
  ? data.importPhysicsPaperManifests(papersRaw)
  : { manifests: [], trustedManifests: [], errors: [], warnings: ["physics-paper-manifests.json is missing"] };
const interventions = interventionsRaw
  ? data.importPhysicsInterventionOutcomes(interventionsRaw)
  : { outcomes: [], completeChains: 0, incompleteChains: 0, calibratedChains: 0, failedOrPartialChains: 0, errors: [], warnings: ["physics-intervention-outcomes.json is missing"] };
const experiment = experimentRaw
  ? data.importPhysicsExperimentEvidence(experimentRaw)
  : { evidence: null, analysis: null, errors: [], warnings: ["physics-experiment.json is missing"] };

const quality = data.auditPhysicsAssessmentQuality({
  topics: data.wjecPhysics.topics,
  questions: review.updatedQuestions,
  nodes: prerequisite.updatedNodes,
  trustedQuestion: data.humanVerifiedPhysicsQuestion,
});
const queue = data.physicsQualityQueue(quality);
const readiness = data.physicsContentReadiness({
  topics: data.wjecPhysics.topics,
  questions: review.updatedQuestions,
  nodes: prerequisite.updatedNodes,
  markingBenchmark: marking.benchmark ? { usableForCalibration: marking.readyForCalibration } : undefined,
});

const blockers = [];
for (const [name, result] of Object.entries({ marking, papers, interventions, experiment })) {
  if (result.errors.length) blockers.push(`${name}: ${result.errors.length} invalid input rows`);
}
if (review.pendingQuestionIds.length) blockers.push(`content review: ${review.pendingQuestionIds.length} questions await approval`);
if (prerequisite.unresolvedEdges.length) blockers.push(`prerequisite review: ${prerequisite.unresolvedEdges.length} edges remain hypotheses`);
if (!quality.releaseReady) blockers.push("assessment quality: capability demand/family coverage remains incomplete");
if (review.errors.length || review.missingQuestionIds.length) blockers.push(`content review: ${review.errors.length} errors, ${review.missingQuestionIds.length} missing questions`);
if (prerequisite.errors.length || prerequisite.missingEdges.length) blockers.push(`prerequisite review: ${prerequisite.errors.length} errors, ${prerequisite.missingEdges.length} missing edges`);
if (!marking.readyForCalibration) blockers.push("marking benchmark: external double-marked corpus is not calibration-ready");
if (!papers.trustedManifests.length) blockers.push("past papers: no verified WJEC paper manifest");
if (!interventions.calibratedChains) blockers.push("interventions: no complete measured transfer/retention chains");
if (!experiment.analysis?.gates.efficacyClaimReady) blockers.push("efficacy: four-arm delayed unseen marks/hour claim is not ready");

const report = {
  generatedAt: new Date().toISOString(),
  input: {
    directory,
    files: {
      reviewPacket: Boolean(reviewRaw), prerequisiteReview: Boolean(prerequisiteRaw), markingCorpus: Boolean(corpusRaw),
      paperManifests: Boolean(papersRaw), interventionOutcomes: Boolean(interventionsRaw), experiment: Boolean(experimentRaw),
    },
  },
  content: {
    approvedQuestions: review.approvedQuestionIds.length,
    pendingQuestions: review.pendingQuestionIds.length,
    missingQuestions: review.missingQuestionIds.length,
    queueItems: queue.length,
    quality,
    errors: review.errors,
    warnings: review.warnings,
  },
  prerequisites: {
    approvedEdges: prerequisite.approvedEdges.length,
    unresolvedEdges: prerequisite.unresolvedEdges.length,
    missingEdges: prerequisite.missingEdges.length,
    errors: prerequisite.errors,
    warnings: prerequisite.warnings,
  },
  marking: marking.benchmark ? {
    externalRows: marking.externalRows,
    independentlyDoubleMarkedRows: marking.independentlyDoubleMarkedRows,
    adjudicatedRows: marking.adjudicatedRows,
    caseCoverage: marking.caseCoverage,
    benchmark: marking.benchmark,
    readyForCalibration: marking.readyForCalibration,
    errors: marking.errors,
    warnings: marking.warnings,
  } : { readyForCalibration: false, errors: marking.errors, warnings: marking.warnings },
  papers: {
    manifests: papers.manifests.length,
    trustedManifests: papers.trustedManifests.length,
    errors: papers.errors,
    warnings: papers.warnings,
  },
  interventions: {
    outcomes: interventions.outcomes.length,
    completeChains: interventions.completeChains,
    calibratedChains: interventions.calibratedChains,
    incompleteOrFailedChains: interventions.failedOrPartialChains,
    errors: interventions.errors,
    warnings: interventions.warnings,
  },
  experiment: {
    analysis: experiment.analysis,
    errors: experiment.errors,
    warnings: experiment.warnings,
  },
  readiness,
  blockers,
  releaseReady: blockers.length === 0 && readiness.ready,
};
await writeFile(resolve(directory, "physics-evidence-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  output: resolve(directory, "physics-evidence-report.json"),
  releaseReady: report.releaseReady,
  blockers: blockers.length,
  queueItems: queue.length,
  approvedQuestions: review.approvedQuestionIds.length,
  markingRows: marking.physicsRecords.length,
  trustedPapers: papers.trustedManifests.length,
  calibratedChains: interventions.calibratedChains,
  experimentReadiness: experiment.analysis?.readiness ?? "enrolling",
}));
if (strict && !report.releaseReady) process.exitCode = 1;
