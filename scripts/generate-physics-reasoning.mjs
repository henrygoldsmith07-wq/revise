import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const directory = resolve("src/content/sources/physics-reasoning-depth");
const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
if (manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.length ||
    new Set(manifest.files).size !== manifest.files.length || manifest.files.some(file => !/^[a-z0-9-]+\.json$/.test(file))) {
  throw new Error("Invalid Physics reasoning manifest.");
}
const sources = manifest.files.map(file => JSON.parse(readFileSync(resolve(directory, file), "utf8")));
const bundle = await build({ stdin: { contents: 'export { validateStructuredReasoning } from "./src/content/structured-physics";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", write: false });
const { validateStructuredReasoning } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
validateStructuredReasoning(sources);
const output = [
  "// GENERATED validated source adapter. Regenerate: npm run content:reasoning",
  'import { reasoningDepthQuestions, type DepthItem } from "./physics-reasoning-runtime";',
  ...manifest.files.map((file, index) => `import source${index} from "../sources/physics-reasoning-depth/${file}";`),
  `export const physicsReasoningDepthQuestions = reasoningDepthQuestions([${manifest.files.map((_, index) => `source${index}`).join(", ")}] as DepthItem[]);`, "",
].join("\n");
const destination = resolve("src/content/questions/physics-reasoning-depth.generated.ts");
if (process.argv.includes("--check")) {
  if (readFileSync(destination, "utf8").replaceAll("\r\n", "\n") !== output) throw new Error("Physics reasoning adapter is stale. Run npm run content:reasoning.");
} else writeFileSync(destination, output);
console.log(`Validated deterministic Physics reasoning source: ${manifest.files.length} groups.`);
