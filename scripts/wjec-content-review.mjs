import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [mode, destination] = process.argv.slice(2);
if (!["export", "check"].includes(mode) || !destination) {
  throw new Error("Usage: node scripts/wjec-content-review.mjs <export|check> <directory>");
}
const bundle = await build({ stdin: { contents: `
  export { seedQuestions as questions } from './src/content';
  export { wjecCapabilities as nodes } from './src/content/capabilities';
  export { wjecDepthCurricula as curricula } from './src/content/wjec-subject-capabilities';
  export { humanVerifiedWjecQuestion as trusted } from './src/domain/physics-content-review';
  export { buildPhysicsReviewPacketTemplate as packet, importPhysicsReviewPacket as importPacket,
    buildPhysicsPrerequisiteReviewTemplate as edges, importPhysicsPrerequisiteReviews as importEdges } from './src/domain/physics-validation-intake';
  export { auditPhysicsAssessmentQuality as audit, physicsQualityQueue as queue, physicsAuthoringBriefs as briefs } from './src/domain/physics-assessment-quality';
  export { markPart } from './src/domain/marking';
`, resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", write: false });
const data = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const out = resolve(destination);
if (mode === "export") {
  await mkdir(resolve(out, ".."), { recursive: true });
  await mkdir(out); // Never overwrite a returned review packet.
}
const report = [];
for (const curriculum of data.curricula) {
  const subjectId = curriculum.topics[0].subjectId;
  const name = subjectId.replace("wjec-alevel-", "");
  const dir = resolve(out, name);
  let questions = data.questions.filter(q => q.subjectId === subjectId);
  let nodes = data.nodes.filter(n => n.subjectId === subjectId);
  let errors = [], warnings = [];
  const json = (name, value) => writeFile(resolve(dir, name), JSON.stringify(value, null, 2));
  if (mode === "export") {
    await mkdir(dir);
    const rows = data.packet(questions, subjectId);
    await json("content-review.json", { formatVersion: 1, rows });
    await json("prerequisite-review.json", { formatVersion: 1, rows: data.edges(nodes, subjectId) });
    const drafts = rows.filter(row => row.question.id.startsWith(`cnt:question:wjec-quality-${name}-`));
    await json("new-draft-review.json", { formatVersion: 1, rows: drafts });
    for (const reviewer of [false, true]) {
      const lines = [`# WJEC A-level ${name}: new draft questions`, "", "AI-authored, unreviewed practice material. No human approval is implied.", "",
        "The reviewer should independently solve the student version before reading the marking version.", ""];
      for (const [index, row] of drafts.entries()) {
        const q = row.question;
        lines.push(`## ${index + 1}. ${q.id}`, "", `Fingerprint: ${row.fingerprint}`, "", q.stem, "");
        for (const p of q.parts) {
          lines.push(`Marks: ${p.marks}`, "");
          if (reviewer) lines.push(...p.markScheme.map((point, i) => `${i + 1}. ${point}`), "", "Worked solution:", "", p.modelAnswer, "",
            `Capability: ${p.capabilityIds.join(", ")}`, `Internal specification: ${p.specPointIds.join(", ")}`,
            `Reasoning: ${p.learning.reasoningMoves.join("; ")}`, `Family: ${p.learning.familyId}`, "");
          else lines.push("Working and answer:", "", "____________________________________________________________", "", "____________________________________________________________", "");
        }
      }
      await writeFile(resolve(dir, reviewer ? "reviewer.md" : "student.md"), lines.join("\n"));
    }
  } else {
    const review = data.importPacket(await readFile(resolve(dir, "content-review.json"), "utf8"), questions, subjectId);
    const edges = data.importEdges(await readFile(resolve(dir, "prerequisite-review.json"), "utf8"), nodes, subjectId);
    questions = review.updatedQuestions;
    nodes = edges.updatedNodes;
    errors = [...review.errors, ...edges.errors];
    warnings = [...review.warnings, ...edges.warnings];
    // Return proposed updates for review; never alter the app or source bank.
    await json("checked-content.json", questions);
    await json("checked-prerequisites.json", nodes);
  }
  const audit = data.audit({ subjectId, topics: curriculum.topics, questions, nodes, trustedQuestion: data.trusted });
  const markingChecks = questions.flatMap(q => q.parts.map(p => ({ questionId: q.id, partId: p.id,
    awarded: data.markPart(p, p.modelAnswer).awarded, available: p.marks })));
  await json("quality-audit.json", audit);
  await json("quality-queue.json", data.queue(audit));
  await json("authoring-briefs.json", data.briefs(audit));
  await json("model-answer-self-check.json", markingChecks);
  report.push({ subjectId, questions: questions.length, capabilities: nodes.length,
    internalStatements: curriculum.topics.reduce((n, t) => n + (t.specPoints?.length ?? 0), 0),
    draftCompleteStatements: audit.capabilityCoverage.filter(row => row.complete).length,
    approvedQuestions: questions.filter(data.trusted).length,
    modelAnswerDisagreements: markingChecks.filter(row => row.awarded !== row.available).length,
    remainingAuthoringBriefs: data.briefs(audit).length, errors, warnings,
    note: "Structural counts and authored-answer checks are not human validation or evidence of efficacy." });
}
await writeFile(resolve(out, "review-report.json"), JSON.stringify(report, null, 2));
if (mode === "export") await writeFile(resolve(out, "README.md"), [
  "# WJEC Maths, Biology and Chemistry review pack", "",
  "Each subject has 28 new drafts across two capabilities. Start with its student.md; independently solve before opening reviewer.md.", "",
  "Record six qualified review checks against exact fingerprints in new-draft-review.json, then merge those rows into content-review.json. Review prerequisite rationales separately. Never mark an AI review as human approval.", "",
  `Check returned files from the repository: node scripts/wjec-content-review.mjs check "${out.replaceAll("\\", "/")}"`, "",
  "The check writes proposed checked-content and checked-prerequisites files for inspection. It does not publish approvals or modify the app. Fix flagged content in source, export to a new folder and review the new fingerprint.", "",
  "Existing fingerprint prefixes and Physics-named APIs are retained for compatibility; the subjectId parameter selects the bank. Human marking, authenticated papers and real learner studies are still required. This pack contains no fabricated evidence.",
].join("\n"));
console.log(JSON.stringify(report));
if (report.some(row => row.errors.length)) process.exitCode = 1;
