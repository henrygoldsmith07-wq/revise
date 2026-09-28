import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const aliases = { maths: "wjec-alevel-maths", biology: "wjec-alevel-biology", chemistry: "wjec-alevel-chemistry", physics: "wjec-alevel-physics" };
const argv = process.argv.slice(2);
const subjectArg = argv.find((arg) => !arg.startsWith("--"));
const outArg = argv.filter((arg) => !arg.startsWith("--"))[1];
const limitArg = argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice(8)) : 20;
if (!subjectArg || !outArg || !Number.isInteger(limit) || limit < 1 || limit > 100) {
  console.error("Usage: npm run wjec:prerequisite:batch -- <subject> <new-directory> [--limit=20]");
  process.exit(1);
}
const subjectId = aliases[subjectArg] ?? subjectArg;
const bundle = await build({ stdin: { contents: `
  export { wjecCapabilities as capabilities } from "./src/content/capabilities";
  export { buildPhysicsPrerequisiteReviewTemplate as buildTemplate } from "./src/domain/physics-validation-intake";
  export { capabilityEdgeFingerprintMatches } from "./src/domain/capability-graph";
`, resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", write: false });
const data = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
if (!data.capabilities.some((node) => node.subjectId === subjectId)) throw new Error(`Unknown WJEC subject: ${subjectId}`);
const byId = new Map(data.capabilities.map((node) => [node.id, node]));
const pending = data.buildTemplate(data.capabilities, subjectId).filter((row) => {
  const target = byId.get(row.targetId);
  const prerequisite = byId.get(row.prerequisiteId);
  const review = target?.prerequisiteReviews?.[row.prerequisiteId];
  return !target || !prerequisite || !["approved", "rejected"].includes(review?.status) || !data.capabilityEdgeFingerprintMatches(review.edgeFingerprint, target, prerequisite);
});
const missingRationale = pending.filter((row) => typeof row.rationale !== "string" || !row.rationale.trim());
const rows = pending.filter((row) => typeof row.rationale === "string" && row.rationale.trim()).slice(0, limit);
const out = resolve(outArg);
await mkdir(resolve(out, ".."), { recursive: true });
await mkdir(out);
await writeFile(resolve(out, "prerequisite-review.json"), JSON.stringify({ formatVersion: 1, subjectId, generatedAt: new Date().toISOString(), rows }, null, 2));
await writeFile(resolve(out, "missing-rationale.json"), JSON.stringify({
  formatVersion: 1,
  subjectId,
  note: "These proposed edges cannot enter human review until an explicit conceptual rationale is authored in the current capability graph. This file is a backlog, not evidence.",
  rows: missingRationale,
}, null, 2));
await writeFile(resolve(out, "README.md"), `# WJEC prerequisite review batch\n\nSubject: ${subjectId}. Reviewable edges: ${rows.length}. Edges blocked on missing rationale: ${missingRationale.length}.\n\nThese edges are hypotheses until a qualified reviewer approves or rejects the exact fingerprint. Review the conceptual dependency, not syllabus order. Fill reviewerId, reviewerRole, reviewerQualification and reviewedAt; keep both fingerprint fields unchanged.\n\nmissing-rationale.json is an authoring backlog only. Add a real conceptual rationale to source before attempting to review those edges.\n\nDry-run before applying:\n\n    npm run wjec:prerequisite:apply -- "${out.replaceAll("\\", "/")}" --dry-run\n`);
console.log(JSON.stringify({ output: out, subjectId, reviewableEdges: rows.length, blockedMissingRationale: missingRationale.length }, null, 2));
