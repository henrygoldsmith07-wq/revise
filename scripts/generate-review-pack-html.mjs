// Offline reviewer pack generator.
//
// Reads a pack directory written by `npm run wjec:review:queue` (or
// `npm run wjec:campaign`) and renders ONE self-contained HTML file a reviewer
// can open with no terminal and no network.
//
//   node scripts/generate-review-pack-html.mjs <pack-directory> [--out=<name>]
//
// Nothing here approves content: it renders what the queue already chose and
// the exact fingerprints the importer will check.
import { readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, resolve } from "node:path";
import { loadDomain } from "./lib/load-domain.mjs";

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => {
  const [key, value] = a.slice(2).split("=");
  return [key, value ?? true];
}));
const [packDir] = args.filter((a) => !a.startsWith("--"));
if (!packDir) {
  throw new Error("Usage: node scripts/generate-review-pack-html.mjs <pack-directory> [--out=review-pack.html]");
}

const d = await loadDomain(`
  export { seedQuestions as questions } from "./src/content";
  export { allTopics } from "./src/domain/curriculum";
  export { physicsContentFingerprint as fingerprint, REQUIRED_HUMAN_CHECKS } from "./src/domain/content-trust";
  export { CAPABILITY_LABEL } from "./src/domain/review-priority";
  export { approversOnCurrentContent } from "./src/domain/review-workflow";
  export { topicQuestionClusters, isDataAnalysis } from "./src/domain/supply-audit";
  export { hasActualTransfer, hasDataRepresentation, questionGateIssues } from "./src/domain/review-gates";
  export { FLAGSHIP_SUBJECTS } from "./src/domain/flagship";
  export { buildReviewPackHtml } from "./src/domain/review-pack-html";
`);

const root = resolve(packDir);
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const queue = await readJson(resolve(root, "queue.json"));
const returnFile = await readJson(resolve(root, "review-return.json"));
if (!Array.isArray(queue?.items) || !queue.items.length) throw new Error(`${root}/queue.json has no review items`);
if (!Array.isArray(returnFile?.decisions)) throw new Error(`${root}/review-return.json is not a review return file`);

// The fingerprints the queue recorded are what the importer will check; never
// silently substitute a different one.
const expected = new Map(returnFile.decisions.map((row) => [row.questionId, row.contentFingerprint]));

let auditEvents = [];
try {
  await access(resolve("src/content/reviews/wjec-review-audit-log.json"), constants.R_OK);
  auditEvents = (await readJson(resolve("src/content/reviews/wjec-review-audit-log.json"))).events ?? [];
} catch {
  auditEvents = [];
}

const topics = d.allTopics();
const topicById = new Map(topics.map((topic) => [topic.id, topic]));
const questions = d.questions;
const byId = new Map(questions.map((question) => [question.id, question]));
const subjectIds = new Set(queue.items.map((item) => item.subjectId).filter(Boolean));
const specVersions = new Map();
for (const topic of topics) {
  if (!topic.specVersion) continue;
  const counts = specVersions.get(topic.subjectId) ?? new Map();
  counts.set(topic.specVersion, (counts.get(topic.specVersion) ?? 0) + 1);
  specVersions.set(topic.subjectId, counts);
}
const gate = {
  topicIds: new Set(topics.map((topic) => topic.id)),
  specPointIds: new Set(topics.flatMap((topic) => (topic.specPoints ?? []).map((spec) => spec.id))),
  specVersionOf: (subjectId) => [...(specVersions.get(subjectId) ?? new Map())].sort((a, b) => b[1] - a[1])[0]?.[0],
};

const short = (id) => String(id).replace(/^cnt:question:/, "");
const labelFor = (subjectId) =>
  d.FLAGSHIP_SUBJECTS.find((f) => f.subjectId === subjectId)?.label ?? subjectId ?? "WJEC";

const items = [];
for (const item of queue.items) {
  const question = byId.get(item.questionId);
  if (!question) throw new Error(`Queued question ${item.questionId} is not in the current bank; regenerate the pack`);
  const fingerprint = d.fingerprint(question);
  const queued = expected.get(question.id);
  if (queued && queued !== fingerprint) {
    throw new Error(`Fingerprint for ${question.id} changed since this pack was queued; re-run the queue command`);
  }
  const topicIds = question.topicIds?.length ? question.topicIds : [item.topicId].filter(Boolean);
  const topicsForQuestion = topicIds.map((id) => topicById.get(id)).filter(Boolean);
  const primary = topicsForQuestion[0];
  const specIds = [...new Set([
    ...(question.specPointIds ?? []),
    ...question.parts.flatMap((part) => part.specPointIds ?? []),
  ])];
  const cluster = primary
    ? d.topicQuestionClusters(primary, questions).find((entry) => entry.ids.includes(question.id))
    : null;
  const siblings = cluster ? cluster.ids.filter((id) => id !== question.id).map(short) : [];
  const gateWarnings = d.questionGateIssues(question, gate).map((issue) => `${issue.severage}: ${issue.detail}`);
  const transferClaimed = d.hasActualTransfer(question);
  const dataClaimed = d.isDataAnalysis(question) && d.hasDataRepresentation(question);

  items.push({
    questionId: question.id,
    fingerprint,
    rank: Number(item.rank ?? items.length + 1),
    topicId: primary?.id ?? "",
    topicTitle: topicsForQuestion.map((t) => t.title).join(" · ") || question.topicIds.join(", "),
    subjectId: question.subjectId,
    stem: question.stem,
    totalMarks: question.totalMarks,
    difficulty: question.difficulty,
    kind: question.kind ?? item.kind ?? "standard",
    parts: question.parts.map((part) => ({
      label: part.label || "Part",
      prompt: part.prompt,
      marks: part.marks,
      markScheme: part.markScheme ?? [],
      modelAnswer: part.modelAnswer ?? "",
      specPointRefs: (part.specPointIds ?? []).map((id) => {
        const spec = topicsForQuestion.flatMap((t) => t.specPoints ?? []).find((s) => s.id === id);
        return spec ? `${spec.ref}: ${spec.text}` : id;
      }),
    })),
    specPoints: topicsForQuestion.flatMap((t) => (t.specPoints ?? []).filter((s) => specIds.includes(s.id)))
      .map((spec) => ({ ref: spec.ref, text: spec.text })),
    provenance: {
      source: question.source ?? "unknown",
      origin: question.origin ?? "unknown",
      specVersion: question.specVersion ?? null,
      lastChecked: question.lastChecked ?? null,
    },
    unlocks: (item.unlocks ?? []).map((unlock) => d.CAPABILITY_LABEL[unlock] ?? unlock),
    gateWarnings,
    reskinWarning: siblings.length
      ? `${siblings.length} near-identical sibling question(s) in this topic (${siblings.join(", ")}). Approval never extends to them; they need their own review.`
      : null,
    transferClaimed,
    dataClaimed,
    alreadyApprovedBy: d.approversOnCurrentContent(question, auditEvents),
  });
}

const subjectId = items[0]?.subjectId ?? [...subjectIds][0] ?? "";
const packId = queue.packId ?? returnFile.packId ?? basename(root);
const outName = typeof flags.out === "string" ? flags.out : "review-pack.html";
const html = d.buildReviewPackHtml({
  packId,
  subjectId,
  subjectLabel: labelFor(subjectId),
  generatedAt: queue.generatedAt ?? returnFile.generatedAt ?? new Date().toISOString(),
  questions: items,
});

const outPath = resolve(root, outName);
await writeFile(outPath, html, "utf8");

console.log(JSON.stringify({
  pack: outPath,
  packId,
  subject: subjectId,
  questions: items.length,
  gateWarnings: items.reduce((sum, item) => sum + item.gateWarnings.length, 0),
  note: "Offline reviewer pack. Opening it sends nothing anywhere; the exported return file still has to pass wjec:review:import.",
}, null, 2));