// Developer export: pull the reviewer portal's runtime audit events back into
// the committed, hash-chained audit log.
//
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run wjec:review:pull [-- --dry-run]
//
// Reads public.review_audit_events with the service role (read-only), joins it
// onto src/content/reviews/wjec-review-audit-log.json with the same
// combineAuditLog the server uses, and verifies the whole chain with the
// domain's auditLogIssues. Only a fully verified chain is written. Then run
//   npm run wjec:review:promote && npm run wjec:review:gates
// to regenerate the committed ledger from it, exactly as for CLI imports.
// Nothing here approves content or edits a decision.
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadDomain } from "./lib/load-domain.mjs";

const dryRun = process.argv.includes("--dry-run");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role, never committed).");
  process.exit(2);
}

const d = await loadDomain(`export { combineAuditLog } from "./src/lib/reviewer/runtime-ledger";`);
const LOG_PATH = resolve("src/content/reviews/wjec-review-audit-log.json");
const committed = JSON.parse(await readFile(LOG_PATH, "utf8"));

const rows = [];
for (let from = 0; ; from += 1000) {
  const response = await fetch(`${url}/rest/v1/review_audit_events?select=seq,previous_hash,hash,event&order=seq.asc`, {
    headers: { apikey: key, authorization: `Bearer ${key}`, range: `${from}-${from + 999}` },
  });
  if (!response.ok) {
    console.error(`Could not read review_audit_events (${response.status}).`);
    process.exit(1);
  }
  const page = await response.json();
  rows.push(...page);
  if (page.length < 1000) break;
}

const combined = d.combineAuditLog(committed, rows);
if (combined.issues.length) {
  console.error(JSON.stringify({ ok: false, issues: combined.issues }, null, 2));
  process.exit(1);
}
if (!dryRun && combined.runtimeOnly > 0) {
  const tmp = `${LOG_PATH}.tmp`;
  await writeFile(tmp, `${JSON.stringify(combined.log, null, 2)}\n`, "utf8");
  await rename(tmp, LOG_PATH);
}
console.log(JSON.stringify({
  ok: true,
  dryRun,
  committedEvents: committed.events.length,
  runtimeEventsAdded: combined.runtimeOnly,
  totalEvents: combined.log.events.length,
  next: combined.runtimeOnly > 0 ? "npm run wjec:review:promote && npm run wjec:review:gates, then commit both review files" : "nothing to pull",
}, null, 2));
