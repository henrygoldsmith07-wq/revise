import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const destinationArg = process.argv[2];
if (!destinationArg || destinationArg === "--help" || destinationArg === "-h") {
  console.log("Usage: node scripts/create-physics-evidence-intake.mjs <output-directory>");
  console.log("Writes blank, versioned files for qualified content review, marking, paper and outcome collection.");
  process.exit(destinationArg ? 0 : 1);
}

const bundle = await build({
  stdin: { contents: `
    export { seedQuestions as questions } from "./src/content";
    export { physicsCapacitorEnergyQuestions as pilotQuestions } from "./src/content/questions/physics-capacitor-energy";
    export { humanVerifiedPhysicsQuestion } from "./src/domain/physics-content-review";
    export { wjecCapabilities as capabilities } from "./src/content/capabilities";
    export { wjecPhysics } from "./src/domain/curriculum/wjec-physics";
    export { auditPhysicsAssessmentQuality, physicsQualityQueue, physicsAuthoringBriefs } from "./src/domain/physics-assessment-quality";
    export { buildPhysicsReviewPacketTemplate, buildPhysicsPrerequisiteReviewTemplate, PHYSICS_REVIEW_PACKET_VERSION, PHYSICS_PREREQUISITE_PACKET_VERSION, PHYSICS_PAPER_MANIFEST_VERSION, PHYSICS_INTERVENTION_PACKET_VERSION, PHYSICS_EXPERIMENT_PACKET_VERSION } from "./src/domain/physics-validation-intake";
  `, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false,
});
const data = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const out = resolve(destinationArg);
// Refuse an existing directory: rerunning setup must never erase returned reviews.
await mkdir(resolve(out, ".."), { recursive: true });
await mkdir(out);

const reviewRows = data.buildPhysicsReviewPacketTemplate(data.questions);
const prerequisiteRows = data.buildPhysicsPrerequisiteReviewTemplate(data.capabilities);
const qualityAudit = data.auditPhysicsAssessmentQuality({ topics: data.wjecPhysics.topics, questions: data.questions, nodes: data.capabilities, trustedQuestion: data.humanVerifiedPhysicsQuestion });
const qualityQueue = data.physicsQualityQueue(qualityAudit);
const authoringBriefs = data.physicsAuthoringBriefs(qualityAudit);
const now = new Date().toISOString();

await writeFile(resolve(out, "physics-review-packet.json"), JSON.stringify({
  formatVersion: data.PHYSICS_REVIEW_PACKET_VERSION,
  generatedAt: now,
  rows: reviewRows,
}, null, 2));
await writeFile(resolve(out, "physics-prerequisite-review.json"), JSON.stringify({
  formatVersion: data.PHYSICS_PREREQUISITE_PACKET_VERSION,
  generatedAt: now,
  rows: prerequisiteRows,
}, null, 2));
await writeFile(resolve(out, "physics-quality-queue.json"), JSON.stringify(qualityQueue, null, 2));
await writeFile(resolve(out, "physics-authoring-briefs.json"), JSON.stringify(authoringBriefs, null, 2));
await writeFile(resolve(out, "physics-answer-corpus.json"), JSON.stringify({
  formatVersion: 2,
  benchmarkVersion: "physics-human-gold-v1",
  createdAt: now,
  provenance: "awaiting two independent qualified WJEC markers",
  records: [],
}, null, 2));
await writeFile(resolve(out, "physics-paper-manifests.json"), await readFile(new URL("../docs/physics-paper-sources.json", import.meta.url), "utf8"));
await writeFile(resolve(out, "physics-intervention-outcomes.json"), JSON.stringify({
  formatVersion: data.PHYSICS_INTERVENTION_PACKET_VERSION,
  outcomes: [],
}, null, 2));
await writeFile(resolve(out, "physics-experiment.json"), JSON.stringify({
  formatVersion: data.PHYSICS_EXPERIMENT_PACKET_VERSION,
  assignments: [], events: [], attempts: [], reviews: [], masteryByTopic: {}, baselineAssessments: [], finalAssessments: [],
}, null, 2));

// Deliver a small, usable first review batch separately from the full JSON queue.
const student = ["# Capacitor energy — draft review trial", "", "Participant code: __________  Date: __________", "",
  "These original practice questions await subject review. A teacher must approve the items before a learner trial. Use a calculator and show all working. Record active start/stop times and any support used. Do not use this whole set as both training and an unseen test.", ""];
const key = ["# Reviewer key — capacitor energy", "", "Draft content. Solve the student version before opening this key. Review every mark, alternative answer and mapping; no automated check counts as human approval.", "",
  "Official crosswalk: [WJEC Physics v3 October 2023, section 4.1(b), (c), (g), pp. 47–48](https://www.wjec.co.uk/media/gxbjl243/wjec-gce-physics-spec-from-2015-e-22-09-22.pdf). The internal mapping is phys.capacitance.sp-02. Synoptic items additionally use mechanics, energy conservation or 4.1(j) discharge relations; check those demands as well.", ""];
for (const [index, question] of data.pilotQuestions.entries()) {
  const part = question.parts[0];
  student.push(`## ${index + 1}. [${part.marks} marks]`, "", part.prompt, "", "Start: ______ Stop: ______ Support used: ______", "", "Working and answer:", "", "________________________________________________________________", "", "________________________________________________________________", "");
  key.push(`## ${index + 1}. ${question.id}`, "", `Demand: ${part.learning.demand}. Family: ${part.learning.familyId}.`, `Reasoning: ${part.learning.reasoningMoves.join("; ")}`, "",
    ...part.markScheme.map((point, i) => `${i + 1}. ${point}`), "", "Worked solution:", part.modelAnswer, "", "Reviewer corrections / acceptable alternatives: __________________", "");
}
await writeFile(resolve(out, "student-capacitor-energy.md"), student.join("\n"));
await writeFile(resolve(out, "reviewer-capacitor-energy.md"), key.join("\n"));
await writeFile(resolve(out, "pilot-review-packet.json"), JSON.stringify({ formatVersion: 1, rows: data.buildPhysicsReviewPacketTemplate(data.pilotQuestions) }, null, 2));

const readme = `# Revise Physics evidence intake

This folder is an evidence drop, not a source of synthetic approvals. Keep the files under version control only when the source, consent and licence permit it.

## Collection order

1. Use **physics-review-packet.json** to review every live Physics question. A qualified reviewer must solve the exact item and complete all six checks: question, marking, worked solution, specification mapping, capability mapping and exam realism. Fill reviewerId, reviewerRole, reviewerQualification, reviewedAt and keep the fingerprint unchanged.
2. Use **physics-prerequisite-review.json** to approve only real conceptual dependencies. A stale or missing fingerprint remains a diagnosis hypothesis.
3. Import anonymised Physics answers into **physics-answer-corpus.json**. Two qualified WJEC markers mark independently before seeing each other's decisions; an adjudicator records disagreements. Keep partial methods, equivalent algebra, units, significant figures, error carried forward, contradictory working, first incorrect steps and borderline explanations tagged.
4. Add one row per paper sitting to **physics-paper-manifests.json**. Use the official WJEC source URL and immutable file digest. A verified manifest is required before extracted questions can become trusted paper evidence.
5. Append every intervention observation to **physics-intervention-outcomes.json**. Include measured time and retain incomplete or failed chains; only independent transfer after a delay can calibrate durable gain.
6. Append preregistered four-arm study data to **physics-experiment.json**. Baseline and held-out delayed forms must be human marked and on the same version/scale.

## Validate

    node scripts/validate-physics-evidence.mjs "${out.replaceAll("\\", "/")}" --strict

The validator compares every row with the current bank and reports blockers. It never writes approvals into source content and never treats synthetic/demo rows as real evidence.
`;
await writeFile(resolve(out, "README.md"), readme);
console.log(JSON.stringify({ output: out, questions: reviewRows.length, prerequisiteEdges: prerequisiteRows.length, qualityQueueItems: qualityQueue.length, authoringBriefs: authoringBriefs.length, pilotQuestions: data.pilotQuestions.length, files: 12 }));
