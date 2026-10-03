// Bundles TypeScript domain modules for plain-node review scripts, so scripts
// call the same pure functions the app and tests use.
import { build } from "esbuild";

export async function loadDomain(contents) {
  const bundle = await build({
    stdin: { contents, resolveDir: process.cwd(), loader: "ts" },
    bundle: true, platform: "node", format: "esm", write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
}
