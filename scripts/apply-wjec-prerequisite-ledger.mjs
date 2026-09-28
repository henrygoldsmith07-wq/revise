import { build } from "esbuild";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const directoryArg = argv.find((arg) => arg !== "--dry-run");
if (!directoryArg) throw new Error("Usage: npm run wjec:prerequisite:apply -- <returned-directory> [--dry-run]");
const bundle = await build({ stdin: { contents: `
  export { wjecCapabilities as capabilities } from "./src/content/capabilities";
  export { importPhysicsPrerequisiteReviews as importReviews } from "./src/domain/physics-validation-intake";
  export { buildPrerequisiteReviewLedgerEntry as buildEntry, mergePrerequisiteReviewLedger as mergeLedger, applyPrerequisiteReviewLedger as applyLedger } from "./src/domain/prerequisite-review-ledger";
`, resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", write: false });
const data = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const root = resolve(directoryArg);
const packet = JSON.parse(await readFile(resolve(root, "prerequisite-review.json"), "utf8"));
const subjectId = packet.subjectId;
if (typeof subjectId !== "string" || !subjectId.startsWith("wjec-alevel-")) throw new Error("Returned packet needs a WJEC subjectId.");
const imported = data.importReviews(JSON.stringify(packet), data.capabilities, subjectId);
if (imported.errors.length) {
  console.error(JSON.stringify({ applied: false, errors: imported.errors, warnings: imported.warnings }, null, 2));
  process.exit(1);
}
const byId = new Map(imported.updatedNodes.map((node) => [node.id, node]));
const additions = [];
for (const row of packet.rows ?? []) {
  if (!row?.review || !["approved", "rejected"].includes(row.review.status)) continue;
  const targetId = row.targetId;
  const prerequisiteId = row.prerequisiteId;
  const target = byId.get(targetId);
  const prerequisite = byId.get(prerequisiteId);
  const review = target?.prerequisiteReviews?.[prerequisiteId];
  if (!target || !prerequisite || !review) throw new Error(`Validated edge disappeared: ${targetId}<-${prerequisiteId}`);
  additions.push(data.buildEntry(target, prerequisite, review));
}
const ledgerPath = resolve("src/content/reviews/wjec-prerequisite-verification.json");
const current = JSON.parse(await readFile(ledgerPath, "utf8"));
const merged = data.mergeLedger(current, additions);
const applied = data.applyLedger(data.capabilities, merged);
const blockers = applied.issues.filter((issue) => issue.blocking);
if (blockers.length) {
  console.error(JSON.stringify({ applied: false, errors: blockers }, null, 2));
  process.exit(1);
}
if (additions.length && !dryRun) {
  const temp = resolve(dirname(ledgerPath), ".wjec-prerequisite-verification.json.tmp");
  await writeFile(temp, JSON.stringify(merged, null, 2) + "\n", "utf8");
  await rename(temp, ledgerPath);
}
console.log(JSON.stringify({ applied: true, dryRun, subjectId, decisionsAddedOrRefreshed: additions.length, approvedInPacket: imported.approvedEdges.length, ledgerEntries: merged.entries.length, warnings: imported.warnings }, null, 2));
