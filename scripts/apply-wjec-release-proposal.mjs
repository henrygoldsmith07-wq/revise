import { build } from "esbuild";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const proposalArg = args.find((arg) => !arg.startsWith("--"));
if (!proposalArg) {
  throw new Error("Usage: node scripts/apply-wjec-release-proposal.mjs <release-set-proposal.json> [--dry-run]");
}

const RELEASE_PATH = resolve("src/content/reviews/wjec-release-set.json");
const proposalPath = resolve(proposalArg);
const proposal = JSON.parse(await readFile(proposalPath, "utf8"));
const current = JSON.parse(await readFile(RELEASE_PATH, "utf8"));

const bundle = await build({
  stdin: {
    contents: [
      'export { seedQuestions as questions } from "./src/content";',
      'export { allTopics } from "./src/domain/curriculum";',
      'export { resolveWjecReleaseSet } from "./src/domain/wjec-release-set";',
      'export { flagshipTrustReadiness } from "./src/domain/flagship-trust";',
    ].join("\n"),
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const data = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"),
);

function nonBlank(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function stringArray(value) {
  return Array.isArray(value) && value.every(nonBlank);
}
function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

if (!proposal || typeof proposal !== "object" || proposal.formatVersion !== 1 ||
    !nonBlank(proposal.subjectId) || !stringArray(proposal.addQuestionIds) || !stringArray(proposal.resultingQuestionIds)) {
  throw new Error("Proposal must be version 1 with subjectId, addQuestionIds and resultingQuestionIds stale-state protection.");
}
if (!current?.subjects || !Array.isArray(current.subjects[proposal.subjectId])) {
  throw new Error("Proposal subject is not present in the current WJEC release manifest.");
}
if (new Set(proposal.addQuestionIds).size !== proposal.addQuestionIds.length) {
  throw new Error("Proposal contains duplicate addQuestionIds.");
}

const currentIds = current.subjects[proposal.subjectId];
const resultingIds = [...new Set([...currentIds, ...proposal.addQuestionIds])];
if (!sameArray(proposal.resultingQuestionIds, resultingIds)) {
  throw new Error("Proposal is stale: resultingQuestionIds no longer matches the current release set plus additions.");
}

const next = {
  ...current,
  subjects: {
    ...current.subjects,
    [proposal.subjectId]: resultingIds,
  },
};
const validation = data.resolveWjecReleaseSet(data.questions, next);
const blockers = validation.issues.filter((issue) => issue.blocking);
if (blockers.length) {
  throw new Error("Release proposal failed validation: " + blockers.map((issue) => issue.detail).join("; "));
}

const topics = data.allTopics();
const beforeIds = new Set(currentIds);
const afterIds = new Set(resultingIds);
const before = data.flagshipTrustReadiness({
  subjectId: proposal.subjectId,
  topics,
  questions: data.questions,
  trustedQuestion: (question) => beforeIds.has(question.id),
  releaseQuestion: (question) => beforeIds.has(question.id),
});
const after = data.flagshipTrustReadiness({
  subjectId: proposal.subjectId,
  topics,
  questions: data.questions,
  trustedQuestion: (question) => afterIds.has(question.id),
  releaseQuestion: (question) => afterIds.has(question.id),
});

if (!dryRun) {
  const tempPath = RELEASE_PATH + ".tmp";
  await writeFile(tempPath, JSON.stringify(next, null, 2) + "\n");
  await rename(tempPath, RELEASE_PATH);
}

console.log(JSON.stringify({
  applied: !dryRun,
  dryRun,
  subjectId: proposal.subjectId,
  additionsRequested: proposal.addQuestionIds.length,
  additionsNew: resultingIds.length - currentIds.length,
  releaseQuestionsBefore: currentIds.length,
  releaseQuestionsAfter: resultingIds.length,
  simulatedIfEverySelectedQuestionWereApproved: {
    coreStatementsBefore: before.releaseStatementsMeetingCoreTrustBar,
    coreStatementsAfter: after.releaseStatementsMeetingCoreTrustBar,
    statementSlotDeficitBefore: before.releaseStatementReviewSlotDeficit,
    statementSlotDeficitAfter: after.releaseStatementReviewSlotDeficit,
  },
  note: "Release selection is editorial scope only. This command never creates or modifies human approvals.",
}, null, 2));
