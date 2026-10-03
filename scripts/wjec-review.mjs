// WJEC flagship review workflow. One entry point for the human-review loop:
//   priorities  what to review next, ranked by product capability unlocked
//   queue       export a reviewer pack (side-by-side question / mark scheme / spec / provenance)
//   import      validate an external reviewer's return file and append it to the audit log
//   promote     write ledger entries for questions with a verified (two-reviewer) chain
//   check       release gate: log integrity, content gates, no un-audited trust
//   status      counts by stage
// Nothing here approves content; decisions only come from named humans in return files.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadDomain } from "./lib/load-domain.mjs";

const [command = "priorities", ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(rest.filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? true]; }));
const positional = rest.filter((a) => !a.startsWith("--"));
const SUBJECTS = { maths: "wjec-alevel-maths", biology: "wjec-alevel-biology", chemistry: "wjec-alevel-chemistry", physics: "wjec-alevel-physics" };
const LOG_PATH = resolve("src/content/reviews/wjec-review-audit-log.json");
const LEDGER_PATH = resolve("src/content/reviews/wjec-human-verification.json");

const d = await loadDomain(`
  export { seedQuestions as questions } from "./src/content";
  export { allTopics } from "./src/domain/curriculum";
  export { trustedAssessmentContent as trusted, physicsContentFingerprint as fingerprint } from "./src/domain/content-trust";
  export { buildReviewPriorities, CAPABILITY_LABEL, REQUIRED_TRUSTED_DISTINCT, REQUIRED_TRUSTED_TRANSFER } from "./src/domain/review-priority";
  export * from "./src/domain/review-workflow";
  export { questionGateIssues, blockingGates } from "./src/domain/review-gates";
  export { auditFlagshipSupply, supplyAuditIntegrityIssues, topicQuestionClusters } from "./src/domain/supply-audit";
  export { mergeHumanVerificationLedger, applyHumanVerificationLedger } from "./src/domain/human-verification-ledger";
  export { FLAGSHIP_SUBJECTS } from "./src/domain/flagship";
`);

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = async (path, value) => {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, path);
};
const topics = d.allTopics();
const flagshipIds = new Set(d.FLAGSHIP_SUBJECTS.map((f) => f.subjectId));
const flagQuestions = d.questions.filter((q) => flagshipIds.has(q.subjectId));
const specVersions = new Map();
for (const t of topics) if (t.specVersion) { const m = specVersions.get(t.subjectId) ?? new Map(); m.set(t.specVersion, (m.get(t.specVersion) ?? 0) + 1); specVersions.set(t.subjectId, m); }
const gate = {
  topicIds: new Set(topics.map((t) => t.id)),
  specPointIds: new Set(topics.flatMap((t) => (t.specPoints ?? []).map((s) => s.id))),
  specVersionOf: (subjectId) => [...(specVersions.get(subjectId) ?? new Map())].sort((a, b) => b[1] - a[1])[0]?.[0],
};
const log = await readJson(LOG_PATH);
const subjectFilter = flags.subject ? SUBJECTS[flags.subject] ?? flags.subject : null;
const priorities = (extra = {}) => d.buildReviewPriorities({
  topics, questions: d.questions, auditEvents: log.events, gate,
  ...(flags["exam-date"] ? { examDates: Object.fromEntries([...flagshipIds].map((id) => [id, flags["exam-date"]])) } : {}),
  ...extra,
});
const pad = (v, n) => String(v).padEnd(n);
const short = (id) => id.replace(/^cnt:question:/, "");

if (command === "priorities") {
  const report = priorities();
  const limit = Number(flags.limit ?? 15);
  if (flags.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
  console.log("Review priorities: highest product unlock per review first (source of truth: the supply audit).");
  console.log(`Trusted target per topic: ${d.REQUIRED_TRUSTED_DISTINCT} distinct questions incl. ${d.REQUIRED_TRUSTED_TRANSFER} transfer; ${2} different reviewers verify each question.\n`);
  for (const s of report.subjects.filter((x) => !subjectFilter || x.subjectId === subjectFilter)) {
    console.log(`${s.label}: ${s.trustedQuestions} trusted · ${s.topicsWithProof}/${s.topics} topics can prove · cold-start ${s.coldStartTopics}/${s.coldStartTarget} topics (${s.coldStartReady ? "ready" : "not ready"}) · delayed-proof topics ${s.delayedProofTopics} · ${s.topicsNeedingNewAuthoring} topics need new/revised questions`);
    console.log(`  ${pad("topic", 40)} trusted req | next question to review`.replace("req |", "req  |"));
    for (const row of report.topics.filter((r) => r.subjectId === s.subjectId)) {
      const next = row.next;
      const author = [row.authoringNeeded.distinct ? `${row.authoringNeeded.distinct} distinct` : "", row.authoringNeeded.transfer ? "transfer" : "", row.authoringNeeded.data ? "data" : ""].filter(Boolean).join("+");
      console.log(`  ${pad(row.topicId.split(".").slice(1).join("."), 40)} ${row.trustedDistinct}/${row.requiredDistinct}  t${row.trustedTransfer}  | ${next ? `#${next.rank} ${short(next.questionId)} → ${next.unlocks.map((u) => d.CAPABILITY_LABEL[u]).slice(0, 2).join("; ")}${next.reviewsNeeded === 1 && next.stage === "checked" ? " (1 review left)" : ""}` : "no reviewable question"}${author ? `  ‼ needs new or revised: ${author}${row.blockedByGates ? ` (${row.blockedByGates} authored blocked by content gates)` : ""}` : ""}`);
    }
    console.log("");
  }
  console.log(`Top ${limit} reviews overall${subjectFilter ? ` (${subjectFilter})` : ""}:`);
  for (const item of report.queue.filter((i) => !subjectFilter || i.subjectId === subjectFilter).slice(0, limit)) {
    console.log(`  ${String(item.rank).padStart(3)}. [${item.score}] ${short(item.questionId)} (${item.topicId.replace(/^wjec-alevel-/, "")}) · ${item.unlocks.map((u) => d.CAPABILITY_LABEL[u]).join("; ")}`);
  }
  }
} else if (command === "queue") {
  const [subjectArg, destArg] = positional;
  const subjectId = SUBJECTS[subjectArg];
  if (!subjectId || !destArg) throw new Error("Usage: wjec-review.mjs queue <maths|biology|chemistry|physics> <new-directory> [--limit=10]");
  const limit = Math.max(1, Math.min(50, Number(flags.limit ?? 10)));
  const report = priorities();
  const items = report.queue.filter((i) => i.subjectId === subjectId).slice(0, limit);
  if (!items.length) throw new Error(`No reviewable candidates remain for ${subjectId}`);
  const byId = new Map(d.questions.map((q) => [q.id, q]));
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const out = resolve(destArg);
  await mkdir(dirname(out), { recursive: true });
  await mkdir(out); // never overwrite a returned pack
  const packId = `${subjectArg}-${new Date().toISOString().slice(0, 10)}-${items.length}`;
  const selected = items.map((i) => byId.get(i.questionId));
  await writeJson(resolve(out, "review-return.json"), d.reviewReturnTemplate(packId, selected));
  await writeJson(resolve(out, "queue.json"), { packId, generatedAt: new Date().toISOString(), items });
  const cell = (text) => String(text).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  const lines = [`# ${subjectId}: review pack ${packId}`, "", "Reviewers: fill every field you are qualified to confirm in `review-return.json` (reviewerId, reviewerRole, reviewerQualification, reviewedAt as an ISO instant, the six checks, comments). Leave rows you did not review blank. Each question needs approval from two different reviewers before it counts as trusted.", ""];
  for (const item of items) {
    const q = byId.get(item.questionId);
    const topic = topicById.get(item.topicId);
    const cluster = d.topicQuestionClusters(topic, d.questions).find((c) => c.ids.includes(q.id));
    const specIds = [...new Set([...(q.specPointIds ?? []), ...q.parts.flatMap((p) => p.specPointIds ?? [])])];
    const specs = specIds.map((id) => { const sp = (topic.specPoints ?? []).find((s) => s.id === id); return sp ? `${sp.ref}: ${sp.text}` : id; });
    lines.push(`## ${item.rank}. ${short(q.id)}`, "",
      `- Topic: ${topic.title} · ${q.totalMarks} marks · difficulty ${q.difficulty} · ${q.kind}`,
      `- Why now: ${item.unlocks.map((u) => d.CAPABILITY_LABEL[u]).join("; ")} (score ${item.score}; ${item.reviewsNeeded} review(s) needed)`,
      `- Fingerprint: \`${d.fingerprint(q)}\``,
      `- Provenance: source ${q.source ?? "unknown"}, origin ${q.origin}, spec version ${q.specVersion ?? "none"}, last checked ${q.lastChecked ?? "never"}${q.licensedSource ? `, ${q.licensedSource.citation}` : ""}`,
      `- Specification: ${specs.join(" | ") || "unlinked"}`,
      `- Classification (authored, to be confirmed): ${item.kind === "standard" ? "standard" : item.kind}; transfer ${q.parts.some((p) => p.learning?.demand === "transfer") || q.learning?.demand === "transfer" ? "claimed" : "no"}; data ${item.kind === "data" ? "claimed" : "no"}`,
      `- Reskin cluster: ${cluster && cluster.ids.length > 1 ? `${cluster.ids.length - 1} near-identical question(s) are covered by this review (${cluster.ids.filter((id) => id !== q.id).map(short).join(", ")})` : "none"}`);
    if (item.warnings.length) lines.push(`- Gate warnings: ${item.warnings.join("; ")}`);
    lines.push("", q.stem, "", "| Question part | Mark scheme and worked answer |", "|---|---|");
    for (const p of q.parts) lines.push(`| ${cell(`**${p.label || "Part"}** [${p.marks}] ${p.prompt}`)} | ${cell(`${p.markScheme.map((m, i) => `${i + 1}. ${m}`).join("\n")}\n\n**Worked answer:** ${p.modelAnswer}`)} |`);
    lines.push("");
  }
  await writeFile(resolve(out, "pack.md"), lines.join("\n"));
  console.log(JSON.stringify({ output: out, packId, questions: items.length }, null, 2));
} else if (command === "import") {
  const file = positional[0];
  if (!file) throw new Error("Usage: wjec-review.mjs import <review-return.json> [--dry-run]");
  const parsed = d.parseReviewReturn(await readFile(resolve(file), "utf8"));
  if (parsed.errors.length) { console.error(JSON.stringify({ applied: false, errors: parsed.errors }, null, 2)); process.exit(1); }
  const result = d.appendReviewDecisions(log, parsed.decisions, d.questions);
  if (result.problems.length) { console.error(JSON.stringify({ applied: false, problems: result.problems }, null, 2)); process.exit(1); }
  if (!flags["dry-run"] && result.accepted) await writeJson(LOG_PATH, result.log);
  console.log(JSON.stringify({ applied: !flags["dry-run"] && result.accepted > 0, dryRun: Boolean(flags["dry-run"]), accepted: result.accepted, skippedBlankRows: parsed.skipped, events: result.log.events.length, next: "npm run wjec:review:promote" }, null, 2));
} else if (command === "promote") {
  const entries = d.promotableLedgerEntries(d.questions, log);
  const ledger = await readJson(LEDGER_PATH);
  const merged = d.mergeHumanVerificationLedger(ledger, entries);
  const applied = d.applyHumanVerificationLedger(d.questions, merged);
  const blocking = applied.issues.filter((i) => i.blocking);
  if (blocking.length) { console.error(JSON.stringify({ promoted: false, errors: blocking }, null, 2)); process.exit(1); }
  const before = ledger.entries.length;
  if (!flags["dry-run"] && merged.entries.length !== before) await writeJson(LEDGER_PATH, merged);
  console.log(JSON.stringify({ promoted: !flags["dry-run"], verifiedQuestions: entries.length, ledgerEntriesBefore: before, ledgerEntriesAfter: merged.entries.length }, null, 2));
} else if (command === "status") {
  for (const f of d.FLAGSHIP_SUBJECTS) {
    const states = flagQuestions.filter((q) => q.subjectId === f.subjectId).map((q) => d.reviewStateOf(q, log.events));
    const count = (stage) => states.filter((s) => s.stage === stage).length;
    console.log(`${pad(f.label, 28)} verified ${count("verified")} · checked ${count("checked")} · unverified ${count("unverified")} · needs re-review ${states.filter((s) => s.needsReReview).length}`);
  }
} else if (command === "check") {
  const ledger = await readJson(LEDGER_PATH);
  const result = d.promotionGateIssues(flagQuestions, log, ledger.entries, d.trusted);
  const issues = [...result.issues];
  const trusted = flagQuestions.filter((q) => d.trusted(q));
  for (const q of trusted) for (const issue of d.blockingGates(d.questionGateIssues(q, gate))) issues.push(`${short(q.id)}: trusted but ${issue.code} — ${issue.detail}`);
  const audits = d.auditFlagshipSupply({ topics, questions: d.questions });
  issues.push(...d.supplyAuditIntegrityIssues(audits, d.questions));
  console.log(`Review gates: ${result.verified} verified, ${result.checked} checked (awaiting second reviewer), ${result.needsReReview} need re-review after content changes.`);
  console.log(issues.length ? `FAILED: ${issues.length} problem(s)` : "OK: every trusted question has a verified audit chain and passes the content gates.");
  for (const issue of issues.slice(0, 40)) console.log(`  - ${issue}`);
  if (issues.length) process.exit(1);
} else {
  throw new Error(`Unknown command ${command}`);
}
