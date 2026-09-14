import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// No approvals are created here. The output is a review packet, not a review.
const destination = process.argv[2];
if (!destination) throw new Error("Usage: node scripts/export-physics-review.mjs <output-directory>");
const bundle = await build({
  stdin: { contents: `
    export { seedQuestions as questions } from "./src/content";
    export { physicsContentFingerprint, humanVerifiedPhysicsQuestion, REQUIRED_HUMAN_CHECKS } from "./src/domain/physics-content-review";
    export { wjecCapabilities as capabilities } from "./src/content/capabilities";
    export { capabilityEdgeFingerprint } from "./src/domain/capability-graph";
    export { redundantPrerequisiteEdges } from "./src/domain/capability-graph";
    export { wjecPhysics as curriculum } from "./src/domain/curriculum/wjec-physics";
    export { markPart } from "./src/domain/marking";
    export { auditPhysicsAssessmentQuality, physicsQualityQueue, physicsAuthoringBriefs } from "./src/domain/physics-assessment-quality";
    export { auditCapabilityGranularity } from "./src/domain/capability-granularity";
    export { auditPhysicsBank } from "./src/domain/physics-bank-audit";
    export { auditPhysicsPartNumerics } from "./src/domain/physics-numerical-audit";
  `, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false,
});
const data = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const qualityAudit = data.auditPhysicsAssessmentQuality({
  topics: data.curriculum.topics,
  questions: data.questions,
  nodes: data.capabilities,
  // Read the existing attestation state.  The packet creates pending review
  // rows for display, but must not hide a valid approval or manufacture one.
  trustedQuestion: data.humanVerifiedPhysicsQuestion,
});
const qualityQueue = data.physicsQualityQueue(qualityAudit);
const authoringBriefs = data.physicsAuthoringBriefs(qualityAudit);
const granularityFindings = data.auditCapabilityGranularity(data.capabilities, data.questions.filter((question) => question.subjectId === "wjec-alevel-physics"));
const bankAudit = data.auditPhysicsBank(data.questions);
const physicsNodes = data.capabilities.filter((node) => node.subjectId === "wjec-alevel-physics");
const prerequisiteReviews = physicsNodes.flatMap((node) => node.prerequisites.map((prerequisiteId) => {
  const prerequisite = physicsNodes.find((candidate) => candidate.id === prerequisiteId) ?? data.capabilities.find((candidate) => candidate.id === prerequisiteId);
  return {
    targetId: node.id,
    targetLabel: node.label,
    prerequisiteId,
    prerequisiteLabel: prerequisite?.label ?? null,
    rationale: node.prerequisiteRationales?.[prerequisiteId] ?? null,
    edgeFingerprint: data.capabilityEdgeFingerprint(node, prerequisite ?? prerequisiteId),
    review: node.prerequisiteReviews?.[prerequisiteId] ?? { status: "unreviewed" },
  };
}));
const redundantEdges = data.redundantPrerequisiteEdges(data.capabilities, "wjec-alevel-physics");
const rows = data.questions.filter((question) => question.subjectId === "wjec-alevel-physics").map((question) => ({
  question,
  fingerprint: data.physicsContentFingerprint(question),
  review: {
    status: "pending",
    contentFingerprint: data.physicsContentFingerprint(question),
    checks: Object.fromEntries(data.REQUIRED_HUMAN_CHECKS.map((check) => [check, false])),
    notes: "Pending review of this version. Inherited checked/verified labels are not a new human attestation.",
  },
  quality: {
    questionLearning: question.learning ?? null,
    parts: question.parts.map((part) => ({
      partId: part.id,
      familyId: part.learning?.familyId ?? question.learning?.familyId ?? null,
      contextId: part.learning?.contextId ?? question.learning?.contextId ?? null,
      demand: part.learning?.demand ?? question.learning?.demand ?? null,
      reasoningMoves: part.learning?.reasoningMoves ?? question.learning?.reasoningMoves ?? [],
    })),
  },
  automaticMarking: question.parts.map((part) => {
    const marked = data.markPart(part, part.modelAnswer);
    return { partId: part.id, modelAnswerAwarded: marked.awarded, available: part.marks,
      missedPoints: marked.missedPoints,
      note: "Self-consistency check only; this cannot establish marking validity." };
  }),
  numericalAudit: question.parts.map((part) => ({ partId: part.id, ...data.auditPhysicsPartNumerics(part) })),
}));
const lines = [
  "# Physics content review packet",
  "",
  `${rows.length} Physics questions from the live bank. This export creates **no human approvals**. No efficacy results are claimed.`,
  `Quality gate: ${qualityAudit.completeStatements}/${qualityAudit.statements} specification statements meet the two-family/two-context demand check; ${qualityAudit.unreviewedQuestions} questions remain unreviewed. Authoring/review queue: ${qualityQueue.length} items. Release-ready: **${qualityAudit.releaseReady ? "yes" : "no"}**.`,
  `Prerequisite gate: ${prerequisiteReviews.filter((row) => row.review.status === "approved").length}/${prerequisiteReviews.length} dependency edges have an approval; ${redundantEdges.length} edge${redundantEdges.length === 1 ? " is" : "s are"} transitively redundant; every edge remains a diagnosis hypothesis until a subject expert signs the exact fingerprint.`,
  `Bank audit: ${bankAudit.errors} hard error${bankAudit.errors === 1 ? "" : "s"}, ${bankAudit.warnings} warning${bankAudit.warnings === 1 ? "" : "s"}; ${bankAudit.duplicatePairs} duplicate-reasoning pair${bankAudit.duplicatePairs === 1 ? "" : "s"}, ${bankAudit.difficultyMismatches} difficulty mismatch${bankAudit.difficultyMismatches === 1 ? "" : "es"}, ${bankAudit.transferWarnings} transfer-novelty warning${bankAudit.transferWarnings === 1 ? "" : "s"}. Precomputed ${bankAudit.profileCount} profiles and ${bankAudit.estimatedComparisons} within-capability comparisons in ${bankAudit.elapsedMs.toFixed(1)} ms.`,
  `Audit confidence: structural **${bankAudit.confidence.structural}** (${bankAudit.structuralChecked} parts); numerical checks **${bankAudit.confidence.numerical}**, claim coverage **${bankAudit.confidence.numericalCoverage}** (${bankAudit.numericalClaimsVerified}/${bankAudit.numericalClaimsDetected} claims verified = ${bankAudit.numericalCoveragePercent === null ? "n/a" : `${bankAudit.numericalCoveragePercent.toFixed(1)}%`}; ${bankAudit.numericalClaimsParsed} parsed, ${bankAudit.numericalClaimsUnresolved} unresolved, ${bankAudit.numericalClaimErrors} claim errors; ${bankAudit.numericalVerified}/${bankAudit.numericalChecks} equation checks passed, ${bankAudit.numericalErrors} arithmetic errors); dimensional checks **${bankAudit.confidence.dimensional}**, bank coverage **${bankAudit.confidence.dimensionalCoverage}** (${bankAudit.dimensionalVerified}/${bankAudit.dimensionalClaimsDetected} candidates checked = ${bankAudit.dimensionalCoveragePercent === null ? "n/a" : `${bankAudit.dimensionalCoveragePercent.toFixed(1)}%`}; ${bankAudit.dimensionalErrors} errors); scheme↔answer coverage **${bankAudit.confidence.schemeAnswerCoverage}** (${bankAudit.schemeAnswerVerified}/${bankAudit.schemeAnswerChecks} comparisons verified, ${bankAudit.schemeAnswerErrors} mismatches, ${bankAudit.schemeAnswerUnresolved} unresolved). Physics-law checks: ${bankAudit.physicsRuleVerified}/${bankAudit.physicsRuleChecks} passed (${bankAudit.physicsRuleDetected} cues, ${bankAudit.physicsRuleUnresolved} unresolved). ${bankAudit.manualReviewRequired} parts require manual numerical review.`,
  "",
  "Review the prompt, mark scheme, worked solution, internal specification mapping, capability mapping and exam realism separately. Solve before reading the key. Record accepted alternatives, rejected misconceptions and uncertain marking. Use examiner-labelled student answers to validate partial credit.",
  "",
  "The fingerprint identifies the exact content reviewed. If content changes, review again. Do not copy the test-only reviewer identities from automated tests into production.",
  "",
  "Board reference: [WJEC Physics specification, version 3 October 2023](https://www.wjec.co.uk/media/gxbjl243/wjec-gce-physics-spec-from-2015-e-22-09-22.pdf). Internal claim IDs and references require checking against this document; they are not an assertion of official coverage.",
  "",
];
for (const row of rows) {
  lines.push(`## ${row.question.id}`, "", `Source: ${row.question.source ?? "unspecified"}. Fingerprint: ${row.fingerprint}.`, "");
  for (const part of row.question.parts) {
    const automatic = row.automaticMarking.find((result) => result.partId === part.id);
    const metadata = row.quality.parts.find((entry) => entry.partId === part.id);
    const numerical = row.numericalAudit.find((result) => result.partId === part.id);
    lines.push(part.prompt, "", `Marks: ${part.marks}`, "", ...part.markScheme.map((point) => `- ${point}`),
      "", "**Worked solution**", "", part.modelAnswer, "",
      `Automatic model-answer check: ${automatic.modelAnswerAwarded}/${automatic.available}. ${automatic.modelAnswerAwarded === automatic.available ? "Consistency only; still needs human review." : "MARKING DISAGREEMENT: investigate before using as trusted evidence."}`,
      `Deterministic numerical audit: ${numerical?.status ?? "unresolved"}; claims ${numerical?.claimsVerified ?? 0}/${numerical?.claimsDetected ?? 0} verified (${numerical?.claimsParsed ?? 0} parsed, ${numerical?.claimsUnresolved ?? 0} unresolved, ${numerical?.claimErrors ?? 0} errors); equations ${numerical?.arithmeticVerified ?? 0}/${numerical?.arithmeticChecks ?? 0}; dimensions ${numerical?.dimensionalVerified ?? 0}/${numerical?.dimensionalCoverage?.claimsDetected ?? 0} candidates checked; scheme↔answer ${numerical?.schemeAnswerVerified ?? 0}/${numerical?.schemeAnswerChecks ?? 0}; Physics laws ${numerical?.physicsRuleVerified ?? 0}/${numerical?.physicsRuleChecks ?? 0}. ${numerical?.issues.length ? `Issues: ${numerical.issues.map((issue) => `${issue.kind} (${issue.detail})`).join("; ")}` : "No deterministic issue; still requires human subject review."}`,
      "",
      `Internal claims: ${part.specPointIds?.join(", ") || "MAPPING REQUIRED"}`,
      `Capabilities: ${part.capabilityIds?.join(", ") || "MAPPING REQUIRED"}`,
      `Demand: ${metadata?.demand ?? "MAPPING REQUIRED"}; family: ${metadata?.familyId ?? "MAPPING REQUIRED"}; context: ${metadata?.contextId ?? "MAPPING REQUIRED"}; reasoning: ${metadata?.reasoningMoves.join("; ") || "MAPPING REQUIRED"}`, "");
  }
  lines.push("Review: [ ] Question [ ] Marking [ ] Solution [ ] Specification [ ] Capability [ ] Exam realism", "",
    "Reviewer ID / role / qualification / date / decision / corrections: ____________________", "");
}
const out = resolve(destination);
await mkdir(out, { recursive: true });
await writeFile(resolve(out, "physics-review-packet.json"), JSON.stringify(rows, null, 2));
await writeFile(resolve(out, "physics-review-packet.md"), lines.join("\n"));
await writeFile(resolve(out, "physics-capability-graph.json"), JSON.stringify(physicsNodes, null, 2));
await writeFile(resolve(out, "physics-prerequisite-review.json"), JSON.stringify(prerequisiteReviews, null, 2));
await writeFile(resolve(out, "physics-prerequisite-audit.json"), JSON.stringify({ redundantEdges }, null, 2));
await writeFile(resolve(out, "physics-quality-audit.json"), JSON.stringify(qualityAudit, null, 2));
await writeFile(resolve(out, "physics-quality-queue.json"), JSON.stringify(qualityQueue, null, 2));
await writeFile(resolve(out, "physics-authoring-briefs.json"), JSON.stringify(authoringBriefs, null, 2));
await writeFile(resolve(out, "physics-capability-granularity.json"), JSON.stringify(granularityFindings, null, 2));
await writeFile(resolve(out, "physics-bank-audit.json"), JSON.stringify(bankAudit, null, 2));
console.log(JSON.stringify({ questions: rows.length, replacements: rows.filter((row) => row.question.id.startsWith("cnt:question:physics-quality-")).length, approvalsCreated: 0,
  modelAnswerMarkingDisagreements: rows.flatMap((row) => row.automaticMarking).filter((row) => row.modelAnswerAwarded !== row.available).length,
  statements: qualityAudit.statements, completeStatements: qualityAudit.completeStatements, unreviewedQuestions: qualityAudit.unreviewedQuestions, qualityQueueItems: qualityQueue.length, authoringBriefs: authoringBriefs.length, redundantPrerequisiteEdges: redundantEdges.length, overbroadCapabilities: granularityFindings.length,
  bankConsistencyErrors: bankAudit.consistencyErrors, bankErrors: bankAudit.errors, bankWarnings: bankAudit.warnings, bankDuplicatePairs: bankAudit.duplicatePairs, bankDifficultyMismatches: bankAudit.difficultyMismatches, bankTransferWarnings: bankAudit.transferWarnings, bankElapsedMs: bankAudit.elapsedMs,
  numericalClaimsDetected: bankAudit.numericalClaimsDetected, numericalClaimsParsed: bankAudit.numericalClaimsParsed, numericalClaimsVerified: bankAudit.numericalClaimsVerified, numericalClaimsUnresolved: bankAudit.numericalClaimsUnresolved, numericalClaimErrors: bankAudit.numericalClaimErrors, numericalCoveragePercent: bankAudit.numericalCoveragePercent,
  numericalChecks: bankAudit.numericalChecks, numericalVerified: bankAudit.numericalVerified, numericalErrors: bankAudit.numericalErrors, numericalUnresolved: bankAudit.numericalUnresolved,
  dimensionalClaimsDetected: bankAudit.dimensionalClaimsDetected, dimensionalChecks: bankAudit.dimensionalChecks, dimensionalVerified: bankAudit.dimensionalVerified, dimensionalErrors: bankAudit.dimensionalErrors, dimensionalUnresolved: bankAudit.dimensionalUnresolved, dimensionalCoveragePercent: bankAudit.dimensionalCoveragePercent,
  schemeAnswerCandidates: bankAudit.schemeAnswerCandidates, schemeAnswerChecks: bankAudit.schemeAnswerChecks, schemeAnswerVerified: bankAudit.schemeAnswerVerified, schemeAnswerErrors: bankAudit.schemeAnswerErrors, schemeAnswerUnresolved: bankAudit.schemeAnswerUnresolved, schemeAnswerCoveragePercent: bankAudit.schemeAnswerCoveragePercent,
  physicsRuleDetected: bankAudit.physicsRuleDetected, physicsRuleChecks: bankAudit.physicsRuleChecks, physicsRuleVerified: bankAudit.physicsRuleVerified, physicsRuleErrors: bankAudit.physicsRuleErrors, physicsRuleUnresolved: bankAudit.physicsRuleUnresolved, manualReviewRequired: bankAudit.manualReviewRequired, confidence: bankAudit.confidence,
  output: out }));
