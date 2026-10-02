import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `
      export { seedQuestions as questions, isSeedWjecReleaseQuestion as releaseQuestion } from "./src/content";
      export { allTopics, getSubject, unitsFor } from "./src/domain/curriculum";
      export { FLAGSHIP_SUBJECTS as flagships } from "./src/domain/flagship";
      export { buildCoverageRows as rows, coverageMetrics as metrics, coverageCsv as csv, TRUSTED_DEPTH } from "./src/domain/trusted-coverage";
    `,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true, platform: "node", format: "esm", write: false,
});
const data = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const topics = data.allTopics();
const subjectArg = process.argv.find((a) => a.startsWith("--subject="))?.slice(10);
const all = [];
const summary = {};
for (const flagship of data.flagships) {
  if (subjectArg && flagship.subjectId !== subjectArg) continue;
  const subject = data.getSubject(flagship.subjectId);
  const paperForUnit = (unit) => {
    const n = /\bUnit (\d+)\b/.exec(unit.title)?.[1];
    return n ? subject.papers.find((p) => p.id.endsWith(`.u${n}`))?.id ?? null : null;
  };
  const rows = data.rows({ subject, topics, units: data.unitsFor(subject.id), questions: data.questions, release: data.releaseQuestion, paperForUnit });
  all.push(...rows);
  summary[subject.id] = data.metrics(rows);
}
if (process.argv.includes("--csv")) console.log(data.csv(all));
else if (process.argv.includes("--json")) console.log(JSON.stringify({ depthStandard: data.TRUSTED_DEPTH, summary, rows: all }, null, 2));
else {
  console.log(`Trusted depth standard: trusted recall + application + transfer, >=${data.TRUSTED_DEPTH.minTrusted} trusted items from >=${data.TRUSTED_DEPTH.minFamilies} families`);
  for (const [id, m] of Object.entries(summary)) {
    console.log(`${id} | statements ${m.statements} | any trusted ${m.anyTrustedPct}% | recall ${m.recallPct}% | application ${m.applicationPct}% | transfer ${m.transferPct}% | full depth ${m.completePct}%`);
  }
  console.log("Unreviewed, generated and draft items are never counted. Use --csv or --json for the per-statement table.");
}
