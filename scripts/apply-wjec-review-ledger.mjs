import { build } from "esbuild";
import { access, readFile, rename, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const directoryArg = args.find((arg) => arg !== "--dry-run");
if (!directoryArg) {
  throw new Error("Usage: node scripts/apply-wjec-review-ledger.mjs <returned-review-directory> [--dry-run]");
}

const bundle = await build({
  stdin: {
    contents: `
      export { seedQuestions as questions } from "./src/content";
      export { importPhysicsReviewPacket as importPacket } from "./src/domain/physics-validation-intake";
      export {
        applyHumanVerificationLedger as applyLedger,
        buildHumanVerificationLedgerEntry as buildEntry,
        humanVerificationLedgerKey as entryKey,
        mergeHumanVerificationLedger as mergeLedger
      } from "./src/domain/human-verification-ledger";
      export { appendReviewDecisions, promotableLedgerEntries } from "./src/domain/review-workflow";
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

const root = resolve(directoryArg);
const ledgerPath = resolve("src/content/reviews/wjec-human-verification.json");
const packetCandidates = [
  { subjectId: "wjec-alevel-maths", label: "maths", paths: ["maths/content-review.json"] },
  { subjectId: "wjec-alevel-biology", label: "biology", paths: ["biology/content-review.json"] },
  { subjectId: "wjec-alevel-chemistry", label: "chemistry", paths: ["chemistry/content-review.json"] },
  { subjectId: "wjec-alevel-physics", label: "physics", paths: ["physics-review-packet.json", "physics/content-review.json"] },
];

async function firstExisting(paths) {
  for (const path of paths) {
    const fullPath = resolve(root, path);
    try {
      await access(fullPath, constants.R_OK);
      return fullPath;
    } catch {
      // Try the next supported packet location.
    }
  }
  return null;
}

// Returned packets feed the same audit log as the review queue: a ledger entry
// only exists once two different reviewers approved the exact content.
const decisions = [];
const reports = [];
const blockingErrors = [];

for (const candidate of packetCandidates) {
  const packetPath = await firstExisting(candidate.paths);
  if (!packetPath) continue;
  const raw = await readFile(packetPath, "utf8");
  const imported = data.importPacket(raw, data.questions, candidate.subjectId, { allowPartial: true });
  reports.push({
    subjectId: candidate.subjectId,
    packetPath,
    approved: imported.approvedQuestionIds.length,
    pending: imported.pendingQuestionIds.length,
    missing: imported.missingQuestionIds.length,
    warnings: imported.warnings,
    errors: imported.errors,
  });
  if (imported.errors.length) {
    blockingErrors.push(...imported.errors.map((error) => `${candidate.label}: ${error}`));
    continue;
  }
  for (const questionId of imported.approvedQuestionIds) {
    const question = imported.updatedQuestions.find((row) => row.id === questionId);
    if (!question) {
      blockingErrors.push(`${candidate.label}: approved question ${questionId} disappeared after import`);
      continue;
    }
    const review = question.humanVerification;
    decisions.push({
      questionId, contentFingerprint: review.contentFingerprint, decision: "approve", reviewerId: review.reviewerId,
      reviewerRole: review.reviewerRole, reviewerQualification: review.reviewerQualification, reviewedAt: review.reviewedAt,
      checks: review.checks, comments: review.notes ?? "",
    });
  }
}

if (!reports.length) {
  throw new Error("No supported returned review packet was found in the supplied directory.");
}

if (blockingErrors.length) {
  console.error(JSON.stringify({ applied: false, reports, errors: blockingErrors }, null, 2));
  process.exit(1);
}

const auditPath = resolve(dirname(ledgerPath), "wjec-review-audit-log.json");
const auditLog = JSON.parse(await readFile(auditPath, "utf8"));
const appended = data.appendReviewDecisions(auditLog, decisions, data.questions);
if (appended.problems.length) {
  console.error(JSON.stringify({ applied: false, reports, errors: appended.problems }, null, 2));
  process.exit(1);
}
const additions = data.promotableLedgerEntries(data.questions, appended.log);
const currentLedger = JSON.parse(await readFile(ledgerPath, "utf8"));
const merged = data.mergeLedger(currentLedger, additions);
const applied = data.applyLedger(data.questions, merged);
const ledgerErrors = applied.issues.filter((issue) => issue.blocking);
if (ledgerErrors.length) {
  console.error(JSON.stringify({ applied: false, reports, errors: ledgerErrors }, null, 2));
  process.exit(1);
}

if (!dryRun && appended.accepted) {
  const tempAudit = resolve(dirname(ledgerPath), ".wjec-review-audit-log.json.tmp");
  await writeFile(tempAudit, `${JSON.stringify(appended.log, null, 2)}\n`, "utf8");
  await rename(tempAudit, auditPath);
}
if (additions.length && !dryRun) {
  const tempPath = resolve(dirname(ledgerPath), ".wjec-human-verification.json.tmp");
  await writeFile(tempPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  await rename(tempPath, ledgerPath);
}

console.log(JSON.stringify({
  applied: true,
  dryRun,
  ledgerPath,
  decisionsRecorded: appended.accepted,
  verifiedQuestions: additions.length,
  note: "An approval is recorded in the audit log; a question is trusted only after two different reviewers approve the same content.",
  ledgerEntries: merged.entries.length,
  historicalEntries: applied.historicalKeys.length,
  reports,
}, null, 2));
