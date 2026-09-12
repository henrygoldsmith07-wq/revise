import { build } from "esbuild";
const bundle = await build({
  stdin: {
    contents: `
      export { seedQuestionsForSubject } from './src/content';
      export { wjecPhysics } from './src/domain/curriculum/wjec-physics';
      export { wjecCapabilities } from './src/content/capabilities';
      export { auditPhysicsAssessmentQuality } from './src/domain/physics-assessment-quality';
    `,
    resolveDir: process.cwd(), loader: "ts",
  },
  bundle: true, platform: "node", format: "esm", write: false,
});
const data = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const physics = data.seedQuestionsForSubject("wjec-alevel-physics");
const audit = data.auditPhysicsAssessmentQuality({ topics: data.wjecPhysics.topics, questions: physics, nodes: data.wjecCapabilities, trustedQuestion: () => false });
const target = process.argv[2] ?? "phys.fields.sp-01";
const row = audit.capabilityCoverageByCapability.find((r) => r.capabilityId === target);
if (!row) { console.log("no row for", target); process.exit(0); }
for (const d of row.demands) {
  console.log(`${d.demand}: fams=${d.families.length} ${d.complete ? "COMPLETE" : ""}${d.complete && d.distinct ? "+distinct" : ""}`);
  for (const f of d.families) console.log(`    ${f}`);
}
