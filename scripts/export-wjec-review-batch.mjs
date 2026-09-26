import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const subjectArg = args.find((arg) => !arg.startsWith("--"));
const destinationArg = args.filter((arg) => !arg.startsWith("--"))[1];
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = Math.max(1, Math.min(50, Number(limitArg?.split("=")[1] ?? 10) || 10));

const SUBJECTS = {
  maths: "wjec-alevel-maths",
  biology: "wjec-alevel-biology",
  chemistry: "wjec-alevel-chemistry",
  physics: "wjec-alevel-physics",
};
const subjectId = SUBJECTS[subjectArg];
if (!subjectId || !destinationArg) {
  throw new Error("Usage: node scripts/export-wjec-review-batch.mjs <maths|biology|chemistry|physics> <new-directory> [--limit=10]");
}

const bundle = await build({
  stdin: {
    contents: `
      export {
        seedQuestions as questions,
        seedWjecReleaseQuestionIds as releaseIds,
        isSeedWjecReleaseQuestion as releaseQuestion
      } from "./src/content";
      export { allTopics } from "./src/domain/curriculum";
      export { humanVerifiedWjecQuestion as trusted, physicsContentFingerprint as fingerprint } from "./src/domain/physics-content-review";
      export { buildPhysicsReviewPacketTemplate as packet } from "./src/domain/physics-validation-intake";
      export { buildFlagshipReviewPlan as plan, flagshipTrustReadiness as readiness } from "./src/domain/flagship-trust";
      export { classifyDepth } from "./src/domain/flagship";
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
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`,
);

const out = resolve(destinationArg);
const subjectName = subjectArg;
const dir = resolve(out, subjectName);
await mkdir(resolve(out, ".."), { recursive: true });
await mkdir(out); // Never overwrite a returned batch.
await mkdir(dir);

const topics = data.allTopics().filter((topic) => topic.subjectId === subjectId);
const subjectQuestions = data.questions.filter((question) => question.subjectId === subjectId);
const byId = new Map(subjectQuestions.map((question) => [question.id, question]));
const currentReleaseIds = [...data.releaseIds].filter((id) => byId.has(id));
const pendingReleaseIds = currentReleaseIds.filter((id) => {
  const question = byId.get(id);
  return question && !data.trusted(question);
});

const priorityPlan = data.plan({
  subjectId,
  topics,
  questions: data.questions,
  limit: Math.min(subjectQuestions.length, Math.max(limit * 8, 80)),
  preferredQuestion: data.releaseQuestion,
});

const selectedIds = [];
for (const id of pendingReleaseIds) {
  if (selectedIds.length >= limit) break;
  selectedIds.push(id);
}
for (const item of priorityPlan) {
  if (selectedIds.length >= limit) break;
  if (!selectedIds.includes(item.questionId)) selectedIds.push(item.questionId);
}
const selected = selectedIds.map((id) => byId.get(id)).filter(Boolean);
if (!selected.length) throw new Error(`No untrusted review candidates remain for ${subjectId}`);

const packetRows = data.packet(selected, subjectId);
await writeFile(resolve(dir, "content-review.json"), JSON.stringify({ formatVersion: 1, rows: packetRows }, null, 2));

const selectedSet = new Set(selectedIds);
const proposedReleaseIds = [...new Set([...currentReleaseIds, ...selectedIds])];
const before = data.readiness({
  subjectId,
  topics,
  questions: data.questions,
  releaseQuestion: data.releaseQuestion,
});
const after = data.readiness({
  subjectId,
  topics,
  questions: data.questions,
  trustedQuestion: (question) => data.trusted(question) || selectedSet.has(question.id),
  releaseQuestion: (question) => data.releaseQuestion(question) || selectedSet.has(question.id),
});

const planById = new Map(priorityPlan.map((item) => [item.questionId, item]));
const selections = selected.map((question) => {
  const item = planById.get(question.id);
  return {
    questionId: question.id,
    fingerprint: data.fingerprint(question),
    category: data.classifyDepth(question),
    alreadyInReleaseSet: data.releaseQuestion(question),
    selectionReason: data.releaseQuestion(question) ? "pending-release-candidate" : "marginal-trusted-coverage",
    newStatementCoverage: item?.newStatementCoverage ?? null,
    newCoreCategories: item?.newCoreCategories ?? null,
    progressTowardCoreCount: item?.progressTowardCoreCount ?? null,
  };
});

const report = {
  subjectId,
  generatedAt: new Date().toISOString(),
  batchSize: selected.length,
  selections,
  simulatedIfAllApproved: {
    trustedQuestionsGain: after.trustedQuestions - before.trustedQuestions,
    statementsWithTrustedEvidenceGain: after.statementsWithTrustedQuestions - before.statementsWithTrustedQuestions,
    trustedCoreStatementsGain: after.statementsMeetingCoreTrustBar - before.statementsMeetingCoreTrustBar,
    statementReviewSlotDeficitReduction: before.statementReviewSlotDeficit - after.statementReviewSlotDeficit,
    releaseCoreStatementsGain: after.releaseStatementsMeetingCoreTrustBar - before.releaseStatementsMeetingCoreTrustBar,
    releaseStatementReviewSlotDeficitReduction:
      before.releaseStatementReviewSlotDeficit - after.releaseStatementReviewSlotDeficit,
    releaseCandidatesAfterProposal: proposedReleaseIds.length,
  },
  note: "Simulation assumes qualified human approval of every selected exact fingerprint. It is planning data, not evidence.",
};
await writeFile(resolve(dir, "batch-report.json"), JSON.stringify(report, null, 2));
await writeFile(resolve(dir, "release-set-proposal.json"), JSON.stringify({
  formatVersion: 1,
  subjectId,
  addQuestionIds: selectedIds.filter((id) => !currentReleaseIds.includes(id)),
  resultingQuestionIds: proposedReleaseIds,
  note: "Proposal only. Product/editorial curation must decide whether to merge these ids into src/content/reviews/wjec-release-set.json.",
}, null, 2));

const student = [
  `# WJEC A-level ${subjectName}: review batch`,
  "",
  "Draft assessment content. Independent solving comes before opening the reviewer key.",
  "",
];
const reviewer = [
  `# WJEC A-level ${subjectName}: reviewer key`,
  "",
  "No automated result is a human approval. Review the exact fingerprint and complete all six checks in content-review.json.",
  "",
];
for (const [index, question] of selected.entries()) {
  student.push(`## ${index + 1}. ${question.id}`, "", question.stem, "");
  reviewer.push(
    `## ${index + 1}. ${question.id}`,
    "",
    `Fingerprint: ${data.fingerprint(question)}`,
    `Depth category: ${data.classifyDepth(question)}`,
    "",
    question.stem,
    "",
  );
  for (const part of question.parts) {
    student.push(`${part.label || "Part"} [${part.marks} marks]`, part.prompt, "", "Working and answer:", "", "____________________________________________________________", "");
    reviewer.push(
      `${part.label || "Part"} [${part.marks} marks]`,
      part.prompt,
      "",
      "Mark scheme:",
      ...part.markScheme.map((point, pointIndex) => `${pointIndex + 1}. ${point}`),
      "",
      "Worked solution:",
      part.modelAnswer,
      "",
      `Specification: ${(part.specPointIds ?? []).join(", ") || "unmapped"}`,
      `Capabilities: ${(part.capabilityIds ?? []).join(", ") || "unmapped"}`,
      `Learning claims: ${(part.learningClaims ?? []).join("; ") || "none"}`,
      "",
    );
  }
}
await writeFile(resolve(dir, "student.md"), student.join("\n"));
await writeFile(resolve(dir, "reviewer.md"), reviewer.join("\n"));
await writeFile(resolve(out, "README.md"), [
  "# WJEC focused review batch",
  "",
  `Subject: ${subjectId}. Batch size: ${selected.length}.`,
  "",
  "1. Reviewer independently solves student.md.",
  "2. Reviewer checks reviewer.md and records qualified decisions in content-review.json.",
  `3. Validate/apply with: npm run wjec:review:apply -- "${out.replaceAll("\\", "/")}" --dry-run`,
  "4. Remove --dry-run only after inspecting the validation report.",
  "5. release-set-proposal.json is a product/editorial proposal only; applying review approvals does not automatically expand the release set.",
  "",
  "batch-report.json simulates coverage gain if every selected exact fingerprint receives qualified approval. It is not evidence.",
].join("\n"));

console.log(JSON.stringify({ output: out, subjectId, batchSize: selected.length, report }, null, 2));
