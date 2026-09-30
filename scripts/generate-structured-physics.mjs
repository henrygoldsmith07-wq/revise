import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const directory = resolve("src/content/sources/physics-depth50-mechanics");
const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
if (manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.length ||
    new Set(manifest.files).size !== manifest.files.length || manifest.files.some((file) => !/^[a-z0-9-]+\.json$/.test(file))) {
  throw new Error("Invalid structured Physics manifest.");
}
const sources = manifest.files.map((file) => JSON.parse(readFileSync(resolve(directory, file), "utf8")));
const bundled = await build({
  stdin: { contents: 'export { validateStructuredPhysics } from "./src/content/structured-physics";', resolveDir: process.cwd(), loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false,
});
const { validateStructuredPhysics } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const items = validateStructuredPhysics(sources);
const output = [
  "// GENERATED from src/content/sources/physics-depth50-mechanics/*.json. Do not edit.",
  "// Regenerate: npm run content:physics",
  'import { depthQuestions, type PhysicsDepthItem } from "./physics-depth-50-common";',
  "", `const ITEMS: PhysicsDepthItem[] = ${JSON.stringify(items, null, 2)};`,
  "", "export const physicsDepth50MechanicsQuestions = depthQuestions(ITEMS);", "",
].join("\n");
const destination = resolve("src/content/questions/physics-depth-50-mechanics.generated.ts");
if (process.argv.includes("--check")) {
  if (readFileSync(destination, "utf8").replaceAll("\r\n", "\n") !== output) throw new Error("Structured Physics runtime is stale. Run npm run content:physics.");
  console.log("Structured Physics schema, provenance, specification mapping and deterministic runtime: passed.");
} else {
  writeFileSync(destination, output);
  console.log(`Generated ${items.length} structured source groups (human trust remains unchanged).`);
}
