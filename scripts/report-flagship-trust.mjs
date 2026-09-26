import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `
      export { seedQuestions as questions } from "./src/content";
      export { allTopics } from "./src/domain/curriculum";
      export { flagshipTrustReadinessSet as report } from "./src/domain/flagship-trust";
    `,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});

const data = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const rows = data.report({ topics: data.allTopics(), questions: data.questions });
const json = process.argv.includes("--json");

if (json) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log("WJEC flagship trusted assessment depth");
  console.log("");
  for (const row of rows) {
    const trustedShare = row.statementsTotal
      ? Math.round(row.trustedStatementShare * 1000) / 10
      : 0;
    const coreShare = row.statementsTotal
      ? Math.round(row.coreTrustShare * 1000) / 10
      : 0;
    console.log(
      [
        row.subjectId,
        `approved questions ${row.trustedQuestions}/${row.questionsTotal}`,
        `statements with trusted evidence ${row.statementsWithTrustedQuestions}/${row.statementsTotal} (${trustedShare}%)`,
        `trusted core ${row.statementsMeetingCoreTrustBar}/${row.statementsTotal} (${coreShare}%)`,
        `review queue ${row.reviewQueue}`,
      ].join(" | "),
    );
  }
  console.log("");
  console.log("Trusted core = at least four approved questions spanning recall, application and transfer.");
  console.log("Draft/authored question volume is intentionally excluded.");
}
