// Convert an exported offline reviewer pack back into the return file the
// existing importer accepts, and validate it exactly as `wjec:review:import`
// would — without writing anything.
//
//   node scripts/import-review-pack-html.mjs <review-pack.html> [--out=<dir>]
//
// This never records a decision. Recording stays a separate, explicit step:
//
//   npm run wjec:review:import -- <dir>/review-return.json --dry-run
//   npm run wjec:review:import -- <dir>/review-return.json
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadDomain } from "./lib/load-domain.mjs";

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => {
  const [key, value] = a.slice(2).split("=");
  return [key, value ?? true];
}));
const [packFile] = args.filter((a) => !a.startsWith("--"));
if (!packFile) {
  throw new Error("Usage: node scripts/import-review-pack-html.mjs <review-pack.html> [--out=<directory>]");
}

const d = await loadDomain(`
  export { seedQuestions as questions } from "./src/content";
  export { extractReviewPackReturn } from "./src/domain/review-pack-html";
  export { parseReviewReturn, appendReviewDecisions } from "./src/domain/review-workflow";
`);

const source = resolve(packFile);
const extracted = d.extractReviewPackReturn(await readFile(source, "utf8"));
if (extracted.errors.length) {
  console.error(JSON.stringify({ applied: false, errors: extracted.errors }, null, 2));
  process.exit(1);
}

const parsed = d.parseReviewReturn(extracted.json);
if (parsed.errors.length) {
  console.error(JSON.stringify({ applied: false, errors: parsed.errors }, null, 2));
  process.exit(1);
}

const logPath = resolve("src/content/reviews/wjec-review-audit-log.json");
let log = { formatVersion: 1, events: [] };
try {
  log = JSON.parse(await readFile(logPath, "utf8"));
} catch {
  // No audit log yet: validate against an empty chain.
}

// Same validation as `wjec:review:import`, minus the write.
const result = d.appendReviewDecisions(log, parsed.decisions, d.questions);
if (result.problems.length) {
  console.error(JSON.stringify({ applied: false, problems: result.problems }, null, 2));
  process.exit(1);
}

const outDir = typeof flags.out === "string" ? flags.out : dirname(source);
await mkdir(resolve(outDir), { recursive: true });
const outPath = resolve(outDir, "review-return.json");
await writeFile(outPath, `${extracted.json}\n`, "utf8");

const forward = outPath.replaceAll("\\", "/");
console.log(JSON.stringify({
  applied: false,
  source,
  returnFile: outPath,
  accepted: result.accepted,
  skippedBlankRows: parsed.skipped,
  next: `npm run wjec:review:import -- ${forward} --dry-run`,
  note: "Validated only. Nothing was appended to the review audit log; a maintainer still runs the import command.",
}, null, 2));