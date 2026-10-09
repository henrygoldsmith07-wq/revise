// Trusted-question supply audit for the four WJEC flagship subjects.
// Usage: node scripts/audit-question-supply.mjs [--json] [--check] [--needs=N]
// --check fails only on integrity problems (something counted as proof that
// should not be), never on content thinness.
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `
      export { seedQuestions as questions } from "./src/content";
      export { allTopics } from "./src/domain/curriculum";
      export { auditFlagshipSupply as audit, supplyAuditIntegrityIssues as integrity } from "./src/domain/supply-audit";
      export { unseenSupplyByTopic as unseenSupply, MIN_PROVABLE_QUESTIONS } from "./src/domain/supply";
    `,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true, platform: "node", format: "esm", write: false,
});
const data = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

const topics = data.allTopics();
const audits = data.audit({ topics, questions: data.questions });
const issues = data.integrity(audits, data.questions);

// Cross-check against the engine's own supply counts: the audit may only be stricter.
for (const subject of audits) {
  const supply = data.unseenSupply(subject.topics.map((t) => t.topicId), data.questions, []);
  for (const row of subject.topics) {
    const engine = supply[row.topicId]?.provable ?? 0;
    if (row.trusted > engine) issues.push(`${row.subjectId}/${row.topicId}: audit counts ${row.trusted} trusted but supply.ts counts ${engine}`);
  }
}

const needsArg = process.argv.find((a) => a.startsWith("--needs="));
const needsLimit = needsArg ? Number(needsArg.slice(8)) : 5;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ minProvable: data.MIN_PROVABLE_QUESTIONS, audits, integrityIssues: issues }, null, 2));
} else {
  const pad = (v, n) => String(v).padEnd(n);
  const num = (v, n) => String(v).padStart(n);
  console.log(`Trusted question supply (proof needs >=${data.MIN_PROVABLE_QUESTIONS} trusted, distinct questions per topic; only reviewed content counts)`);
  console.log(`${pad("subject", 28)} ${num("topics", 6)} ${num("quest", 6)} ${num("spec", 6)} ${num("trust", 6)} ${num("xfer", 5)} ${num("data", 5)} ${num("dist", 5)} ${num("adist", 5)} ${num("delay", 5)} ${num("shallow", 7)} | enough/thin/none`);
  for (const a of audits) {
    const r = a.rollup;
    console.log(`${pad(a.label, 28)} ${num(r.topics, 6)} ${num(r.questions, 6)} ${num(r.specLinked, 6)} ${num(r.trusted, 6)} ${num(r.transfer, 5)} ${num(r.dataAnalysis, 5)} ${num(r.provableDistinct, 5)} ${num(r.authoredDistinct, 5)} ${num(r.delayedProofEligible, 5)} ${num(r.shallowGroups, 7)} | ${r.byVerdict["enough-for-proof"]}/${r.byVerdict.thin}/${r.byVerdict.insufficient}`);
  }
  console.log("cols: quest=authored, spec=spec-linked, trust=trusted, xfer=trusted transfer, data=trusted data-analysis, dist=distinct trusted (shallow variants and shared families count once), adist=distinct among all authored (trusted or not), delay=delayed-proof eligible, shallow=shallow-variation groups");
  for (const a of audits) {
    console.log(`\nLargest authoring gaps — ${a.label}`);
    for (const n of a.authoringNeeds.slice(0, needsLimit)) {
      console.log(`  ${pad(n.topicId, 44)} need ${n.missingDistinct} more distinct trusted${n.missingTransfer ? " + 1 transfer" : ""}${n.missingData ? " + 1 data" : ""}${n.missingDelayedProof ? " + delayed-proof" : ""} (${n.verdict}; ${n.action})`);
    }
  }
  console.log(issues.length ? `\nIntegrity: ${issues.length} problem(s)` : "\nIntegrity: OK");
  for (const issue of issues.slice(0, 20)) console.log(`  - ${issue}`);
}
if (process.argv.includes("--check") && issues.length) {
  console.error(`Supply audit integrity check failed (${issues.length} problem(s)).`);
  process.exit(1);
}
