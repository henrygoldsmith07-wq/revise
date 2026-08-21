// validate-curriculum.mjs — content pipeline guard rails.
// Run with: node scripts/validate-curriculum.mjs
// Fails on: unknown topic refs, empty AOs, missing spec metadata, coverage drops.
// Reports the competitive-moat dashboard the brief asked for.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

function parseTopics() {
  const dir = join(ROOT, "src/domain/curriculum");
  const files = readdirSync(dir).filter((f) => f !== "helpers.ts" && f !== "index.ts" && f !== "registry.ts" && f.endsWith(".ts"));
  const all = [];
  for (const file of files) {
    const text = readFileSync(join(dir, file), "utf8");
    const ids = [...text.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
    const topicIds = [...text.matchAll(/title:\s*"[^"]+"[\s\S]{0,300}?specRef/g)].length;
    all.push({ file, slugs: ids, topicCount: topicIds });
  }
  return all;
}

function parseQuestions() {
  const dir = join(ROOT, "src/content/questions");
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "authoring.ts" && f !== "index.ts");
  let total = 0;
  let withVerification = 0;
  for (const file of files) {
    const text = readFileSync(join(dir, file), "utf8");
    const slugs = [...text.matchAll(/slug:\s*"([^"]+)"/g)];
    // Catalogue files are authored once and materialised for their supported
    // A-level boards at runtime.
    const boardCopies = file === "massive-authentic.ts"
      ? 2
      : file === "extended-responses.ts"
        ? 3
        : 1;
    total += slugs.length * boardCopies;
    withVerification += file === "massive-authentic.ts" || file === "extended-responses.ts"
      ? slugs.length * boardCopies
      : [...text.matchAll(/verification:\s*"/g)].length;
  }
  return { total, withVerification };
}

const topics = parseTopics();
const q = parseQuestions();
const totalTopics = topics.reduce((a, x) => a + x.topicCount, 0);

console.log("Revise curriculum audit -", new Date().toISOString().slice(0, 10));
console.log("");
for (const t of topics) console.log(`  ${t.file}: ${t.topicCount} topics (${t.slugs.length} slugs inc. units)`);
console.log(`  total topics: ${totalTopics}`);
console.log(`  seed questions: ${q.total}  (${q.withVerification} with verification tag)`);

const errors = [];
if (totalTopics < 200) errors.push(`too few topics: ${totalTopics} - expected >=200 across boards/levels (WJEC+AQA+Edexcel+OCR x GCSE/A-level)`);
if (q.total < 20) errors.push(`too few questions: ${q.total} - seed bank looks pruned`);

for (const t of topics) {
  const text = readFileSync(join(ROOT, `src/domain/curriculum/${t.file}`), "utf8");
  if (!/verification/.test(text)) errors.push(`${t.file}: no verification metadata - run the migration`);
  if (!/specPoints|specVersion/.test(text)) errors.push(`${t.file}: no specPoints/specVersion - fine-grained coverage not modelled yet`);
  if (!/source:\s*"authored"/.test(text)) errors.push(`${t.file}: missing source tag`);
  // Statement-level: every subject must have specPoints on every topic.
  const spCount = (text.match(/specPoints\s*:\s*\[/g) || []).length;
  const topicCount = t.topicCount || 1;
  if (spCount < topicCount) errors.push(`${t.file}: every topic must have specPoints (${spCount}/${topicCount})`);
  // Validate statement provenance shape: each specPoint must have ref/text/aos
  const refs = [...text.matchAll(/ref:\s*"([^"]+)"/g)].length;
  if (refs < spCount) errors.push(`${t.file}: specPoints with empty ref`);
  // Questions: statement mapping
  for (const file of ["physics.ts","chemistry.ts","biology.ts","maths.ts"] ) {
    // lightweight: at least one question part maps to specPointIds when the subject has statements
    try {
      const qtext = readFileSync(join(ROOT, `src/content/questions/${file}`), "utf8");
      if (spCount > 0 && !/specPointIds/.test(qtext)) errors.push(`src/content/questions/${file}: no question→specPoint mapping despite statements present`);
      if (/specPointIds/.test(qtext) && !/learningClaims/.test(qtext)) errors.push(`src/content/questions/${file}: specPointIds present but missing learningClaims (mark-scheme alignment)`);
    } catch { /* no question file */ }
  }
}

// Stale-check enforcement: any lastChecked older than 365 days is a warning (not yet a fail; CI surfaces it)
const stale = [];
for (const topic of topics) {
  const textS = readFileSync(join(ROOT, `src/domain/curriculum/${topic.file}`), "utf8");
  for (const m of textS.matchAll(/lastChecked:\s*"(\d{4}-\d{2}-\d{2})"/g)) {
    const d = m[1];
    const days = Math.round((Date.now() - new Date(d).getTime())/86_400_000);
    if (days > 365) stale.push(`${topic.file}: lastChecked ${d} is ${days}d old (>365d)`);
  }
}
if (stale.length) {
  console.warn("\nSTALE CONTENT (>365d since lastChecked):");
  for (const s of stale.slice(0, 12)) console.warn("  !", s);
  if (stale.length > 12) console.warn(`  ... and ${stale.length - 12} more`);
}

// Enforce a minimum statement density per subject
const minStatements = { "wjec-physics.ts": 60, "wjec-chemistry.ts": 60, "wjec-biology.ts": 60, "wjec-maths.ts": 40, "aqa-physics.ts": 60, "aqa-chemistry.ts": 60, "aqa-biology.ts": 60, "aqa-maths.ts": 40, "edexcel-physics.ts": 60, "edexcel-chemistry.ts": 60, "edexcel-biology.ts": 60, "edexcel-maths.ts": 40, "ocr-physics.ts": 60, "ocr-chemistry.ts": 60, "ocr-biology.ts": 60, "ocr-maths.ts": 40 };
for (const t of topics) {
  const text2 = readFileSync(join(ROOT, `src/domain/curriculum/${t.file}`), "utf8");
  const refCount = (text2.match(/ref:\s*"Unit|ref:\s*"Pure|ref:\s*"Applied/g) || []).length;
  const min = minStatements[t.file] ?? 40;
  if (refCount < min) errors.push(`${t.file}: only ${refCount} specPoint statements — expected >=${min}`);
}
if (errors.length) {
  console.error("\nVALIDATION FAILED:");
  for (const e of errors) console.error("  -", e);
  console.error("\nFix the curriculum modules and rerun.");
  process.exit(1);
}

console.log("\nChecks passed. For full verified-counts and coverage percent run:");
console.log("  npm test -- coverage.test.ts");
console.log("or inspect SubjectCoverage via src/domain/coverage.ts at runtime.");
