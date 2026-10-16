// Owner status for the transfer-pair review batch: which question needs
// which reviewer, without the maintainer holding a reviewer grant (they
// author the questions, so they must not review them).
//
//   npm run wjec:review:pairs [-- physics|maths|biology|chemistry] [--json]
//
// Reads the committed audit log. With NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY set it also reads the portal's runtime events
// (read-only, the same request as wjec:review:pull) and verifies the whole
// chain with combineAuditLog before using it; an unverifiable chain is
// reported and the committed log alone is shown. Nothing is written.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadDomain } from "./lib/load-domain.mjs";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const slug = argv.find((arg) => !arg.startsWith("--")) ?? "physics";
const subjectId = `wjec-alevel-${slug}`;

const d = await loadDomain(`
  export { seedQuestions } from "./src/content";
  export { combineAuditLog } from "./src/lib/reviewer/runtime-ledger";
  export { buildTransferBatch, needsLabel } from "./src/lib/reviewer/batches";
`);
if (!d.seedQuestions.some((question) => question.subjectId === subjectId)) {
  console.error(`Unknown subject "${slug}". Use physics, maths, biology or chemistry.`);
  process.exit(2);
}
const committed = JSON.parse(await readFile(resolve("src/content/reviews/wjec-review-audit-log.json"), "utf8"));

let rows = [];
let source = "committed audit log only (set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to include portal decisions)";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key) {
  for (let from = 0; ; from += 1000) {
    const response = await fetch(`${url}/rest/v1/review_audit_events?select=seq,previous_hash,hash,event&order=seq.asc`, {
      headers: { apikey: key, authorization: `Bearer ${key}`, range: `${from}-${from + 999}` },
    });
    if (!response.ok) { console.error(`Could not read review_audit_events (${response.status}).`); process.exit(1); }
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  source = "committed audit log + portal runtime events";
}
let combined = d.combineAuditLog(committed, rows);
const chainIssues = combined.issues;
if (chainIssues.length && rows.length) {
  source = "committed audit log only: the runtime chain FAILED verification";
  combined = d.combineAuditLog(committed, []);
}

const batch = d.buildTransferBatch(d.seedQuestions, combined.log.events, subjectId, null);
const short = (id) => id.replace(/^cnt:question:/, "");
if (json) {
  console.log(JSON.stringify({ subjectId, source, chainIssues, ...batch }, null, 2));
  process.exit(chainIssues.length ? 1 : 0);
}
console.log(`Transfer pairs · ${subjectId}\nSource: ${source}`);
if (chainIssues.length) console.log(`Chain issues:\n  ${chainIssues.join("\n  ")}`);
console.log(`Pairs usable for proof: ${batch.readyPairs}/${batch.pairs.length} · questions verified: ${batch.verifiedQuestions}/${batch.members.length} · approvals recorded: ${batch.approvalsRecorded}/${batch.approvalsNeeded}\n`);
for (const pair of batch.pairs) {
  console.log(`${pair.ready ? "[ready]" : "[     ]"} ${pair.topicId.replace(`${subjectId}.`, "")}`);
  console.log(`    baseline ${short(pair.baselineQuestionId)}: ${d.needsLabel(pair.baseline)}`);
  console.log(`    transfer ${short(pair.transferQuestionId)}: ${d.needsLabel(pair.transfer)}`);
}
process.exit(chainIssues.length ? 1 : 0);
