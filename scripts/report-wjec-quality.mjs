// Internal flagship quality dashboard (never shown to learners). Combines the
// supply audit (what counts) with the review priorities (what to do next).
// Usage: node scripts/report-wjec-quality.mjs [--json] [--markdown] [--subject=maths]
import { loadDomain } from "./lib/load-domain.mjs";
import { readFile } from "node:fs/promises";

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? true]; }));
const SUBJECTS = { maths: "wjec-alevel-maths", biology: "wjec-alevel-biology", chemistry: "wjec-alevel-chemistry", physics: "wjec-alevel-physics" };
const d = await loadDomain(`
  export { seedQuestions as questions } from "./src/content";
  export { allTopics } from "./src/domain/curriculum";
  export { trustedAssessmentContent as trusted } from "./src/domain/content-trust";
  export { auditFlagshipSupply as audit } from "./src/domain/supply-audit";
  export { buildReviewPriorities } from "./src/domain/review-priority";
  export { reviewStateOf } from "./src/domain/review-workflow";
  export { flagshipReadiness } from "./src/domain/flagship-readiness";
`);
const log = JSON.parse(await readFile("src/content/reviews/wjec-review-audit-log.json", "utf8"));
const topics = d.allTopics();
const gate = { topicIds: new Set(topics.map((t) => t.id)), specPointIds: new Set(topics.flatMap((t) => (t.specPoints ?? []).map((s) => s.id))), specVersionOf: () => "2024-1.0" };
const subjectFilter = flags.subject ? SUBJECTS[flags.subject] : null;
const audits = d.audit({ topics, questions: d.questions }).filter((a) => !subjectFilter || a.subjectId === subjectFilter);
const pri = d.buildReviewPriorities({ topics, questions: d.questions, auditEvents: log.events, gate });
const rowOf = new Map(pri.topics.map((r) => [r.topicId, r]));

const subjects = audits.map((a) => {
  const summary = pri.subjects.find((s) => s.subjectId === a.subjectId);
  const stages = { verified: 0, checked: 0, unverified: 0, reReview: 0 };
  for (const q of d.questions.filter((q) => q.subjectId === a.subjectId)) {
    const st = d.reviewStateOf(q, log.events);
    stages[st.stage]++; if (st.needsReReview) stages.reReview++;
  }
  return {
    subjectId: a.subjectId, label: a.label, summary, stages, rollup: a.rollup,
    readiness: d.flagshipReadiness({ topics, questions: d.questions, auditEvents: log.events, gate, subjectId: a.subjectId }),
    topics: a.topics.map((t) => {
      const r = rowOf.get(t.topicId);
      return {
        topicId: t.topicId, authored: t.questions, specLinked: t.specLinked, trusted: t.trusted, distinctTrusted: t.provableDistinct,
        families: t.trustedFamilies, transfer: t.transfer, data: t.dataAnalysis, delayedReady: t.delayedProofEligible >= 3, shallowGroups: t.shallowGroups.length,
        awaitingReview: r ? r.reviewQueueSize : 0, blockedFromProof: t.provableDistinct < 2, missionProofReady: t.provableDistinct >= 2 && t.transfer >= 1,
        next: r?.next?.questionId ?? null, needsNewAuthoring: r ? r.authoringNeeded : null,
      };
    }),
  };
});

// Where reviewer effort would unlock the most proof. A topic blocked from proof
// is only worth a reviewer's time if there is something to review: "review
// queued" means questions are already in the review queue, "queue for review"
// means questions are authored but have never been through review, and "author
// new" means the bank is empty for that topic. Learners hitting this wall
// record it themselves as a local-only funnel event (proof_blocked_by_supply);
// that never leaves the device, so this ranking is built from the bank alone and
// never from learner behaviour.
const demand = subjects
  .flatMap((s) => s.topics.filter((t) => t.blockedFromProof).map((t) => ({
    subject: s.label,
    topic: t.topicId.split(".").slice(1).join("."),
    authored: t.authored,
    awaitingReview: t.awaitingReview,
    lever: t.awaitingReview > 0 ? "review queued"
      : t.authored > t.trusted ? "queue for review"
      : "author new",
  })))
  .sort((a, b) => b.awaitingReview - a.awaitingReview || b.authored - a.authored);

if (flags.json) process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), demand, subjects }, null, 2)}\n`);
else {
  const md = Boolean(flags.markdown);
  const out = [];
  out.push(md ? "# Flagship trusted-supply dashboard (internal)" : "Flagship trusted-supply dashboard (internal; learners never see these counts)", "");
  for (const s of subjects) out.push(`${s.label}: ${s.readiness.verdict}`);
  const head = ["subject", "trusted", "topics proving", "cold-start", "mission-proof topics", "delayed-proof topics", "blocked from proof", "verified/checked/unverified", "re-review"];
  const rows = subjects.map((s) => [s.label, s.summary.trustedQuestions, `${s.summary.topicsWithProof}/${s.summary.topics}`, s.summary.coldStartReady ? "ready" : `not ready (${s.summary.coldStartTopics}/${s.summary.coldStartTarget} topics)`, s.summary.missionProofTopics, s.summary.delayedProofTopics, s.topics.filter((t) => t.blockedFromProof).length, `${s.stages.verified}/${s.stages.checked}/${s.stages.unverified}`, s.stages.reReview]);
  if (md) out.push(`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`));
  else out.push(head.join(" · "), ...rows.map((r) => r.join(" · ")));
  if (demand.length) {
    out.push("", md ? "## Where review effort unlocks the most proof" : "Where review effort unlocks the most proof (topics blocked from proof, most reviewable first)");
    const dh = ["subject", "topic", "authored", "awaiting review", "lever"];
    const top = demand.slice(0, 12).map((r) => [r.subject, r.topic, r.authored, r.awaitingReview, r.lever]);
    if (md) out.push(`| ${dh.join(" | ")} |`, `|${dh.map(() => "---").join("|")}|`, ...top.map((r) => `| ${r.join(" | ")} |`));
    else out.push(dh.join(" · "), ...top.map((r) => r.join(" · ")));
  }
  for (const s of subjects) {
    out.push("", md ? `## ${s.label}` : s.label);
    const th = ["topic", "authored", "trusted", "distinct", "families", "transfer", "data", "delayed", "shallow groups", "awaiting review", "next review"];
    const tr = s.topics.map((t) => [t.topicId.split(".").slice(1).join("."), t.authored, t.trusted, t.distinctTrusted, t.families, t.transfer, t.data, t.delayedReady ? "yes" : "no", t.shallowGroups, t.awaitingReview, t.next ? t.next.replace(/^cnt:question:/, "") : "—"]);
    if (md) out.push(`| ${th.join(" | ")} |`, `|${th.map(() => "---").join("|")}|`, ...tr.map((r) => `| ${r.join(" | ")} |`));
    else out.push(th.join(" · "), ...tr.map((r) => r.join(" · ")));
  }
  console.log(out.join("\n"));
}
