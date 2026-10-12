#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(path.join(appRoot, "scripts", "client-performance-budget.json"), "utf8"));
const requireBuild = process.argv.includes("--require-build");
const failures = [];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function staticImportLines(source) {
  return source.split(/\r?\n/).filter((line) => /^\s*import(?:\s|\{)|^\s*export .* from /.test(line));
}

const forbidden = config.forbiddenInitialImports ?? [];
for (const file of walk(path.join(appRoot, "src", "app")).filter((target) => /page\.(tsx?|jsx?)$/.test(target))) {
  const source = readFileSync(file, "utf8");
  for (const line of staticImportLines(source)) {
    for (const name of forbidden) {
      if (line.includes(name)) failures.push(`${path.relative(appRoot, file)} statically imports ${name}; use an action-triggered dynamic import`);
    }
  }
}

const nextDir = path.join(appRoot, ".next");
const manifestCandidates = [
  path.join(nextDir, "server", "app", "page", "build-manifest.json"),
  path.join(nextDir, "build-manifest.json"),
];
const manifestPath = manifestCandidates.find(existsSync);
if (!manifestPath) {
  if (requireBuild) failures.push("client performance budget: no Next build manifest found");
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const files = [...new Set([...(manifest.polyfillFiles ?? []), ...(manifest.rootMainFiles ?? [])])]
    .filter((file) => /\.js$/.test(file))
    .map((file) => path.join(nextDir, file));
  const existing = files.filter(existsSync);
  const bytes = existing.reduce((sum, file) => sum + statSync(file).size, 0);
  const gzipBytes = existing.reduce((sum, file) => sum + gzipSync(readFileSync(file), { level: 9 }).length, 0);
  console.log(`Initial route assets: ${bytes} bytes raw / ${gzipBytes} bytes gzip`);
  if (bytes > config.initialRoute.maxBytes) failures.push(`initial route raw assets exceed ${config.initialRoute.maxBytes} bytes`);
  if (gzipBytes > config.initialRoute.maxGzipBytes) failures.push(`initial route gzip assets exceed ${config.initialRoute.maxGzipBytes} bytes`);
  const source = existing.map((file) => readFileSync(file, "utf8")).join("\n");
  for (const name of forbidden) {
    if (source.includes(name)) failures.push(`initial route bundle contains optional dependency ${name}`);
  }

  // Route budgets: everything a first visit to the route downloads before it
  // can hydrate — the root files above plus the layout and page entry chunks
  // from the route's client reference manifest. The root files alone leave
  // out the shell's own chunks (the content bank among them), so they
  // understated "/" by roughly 9x (fifteenth pass, 2026-10-12).
  for (const [route, budget] of Object.entries(config.routes ?? {})) {
    const segment = route === "/" ? "page" : `${route.replace(/^\//, "")}/page`;
    const referencePath = path.join(nextDir, "server", "app", `${segment}_client-reference-manifest.js`);
    if (!existsSync(referencePath)) {
      failures.push(`route ${route}: no client reference manifest at ${path.relative(appRoot, referencePath)}`);
      continue;
    }
    const sandbox = { globalThis: {} };
    sandbox.self = sandbox.globalThis;
    vm.runInNewContext(readFileSync(referencePath, "utf8"), sandbox);
    const reference = (sandbox.globalThis.__RSC_MANIFEST ?? {})[`/${segment}`];
    const entry = reference?.entryJSFiles?.[`[project]/src/app/${segment}`];
    if (!Array.isArray(entry) || !entry.length) {
      failures.push(`route ${route}: its client reference manifest lists no entry chunks`);
      continue;
    }
    const routeFiles = [...new Set([...files, ...entry.map((file) => path.join(nextDir, file))])].filter((file) => /\.js$/.test(file));
    const missing = routeFiles.filter((file) => !existsSync(file));
    if (missing.length) failures.push(`route ${route}: ${missing.length} listed chunk(s) missing from the build`);
    const present = routeFiles.filter(existsSync);
    const routeBytes = present.reduce((sum, file) => sum + statSync(file).size, 0);
    const routeGzip = present.reduce((sum, file) => sum + gzipSync(readFileSync(file), { level: 9 }).length, 0);
    console.log(`Route ${route}: ${routeBytes} bytes raw / ${routeGzip} bytes gzip (${present.length} files)`);
    if (routeBytes > budget.maxBytes) failures.push(`route ${route} raw assets exceed ${budget.maxBytes} bytes`);
    if (routeGzip > budget.maxGzipBytes) failures.push(`route ${route} gzip assets exceed ${budget.maxGzipBytes} bytes`);
  }

  // Optional dependencies get their own budget as soon as the build emits a
  // chunk that identifies them. A dependency can be absent in a local build
  // (for example an OCR adapter behind a feature flag), so no-match is
  // informational rather than a false failure. Matching by both package name
  // and common runtime aliases keeps this useful after minification while
  // retaining a deterministic upper bound for every emitted optional chunk.
  const optionalChunks = config.optionalChunks ?? {};
  const jsChunks = walk(path.join(nextDir, "static")).filter((file) => file.endsWith(".js"));
  for (const [name, budget] of Object.entries(optionalChunks)) {
    const aliases = {
      "pdfjs-dist": ["pdfjs-dist", "pdf.worker"],
      "@huggingface/transformers": ["@huggingface/transformers", "transformers.js"],
      "@mlc-ai/web-llm": ["@mlc-ai/web-llm", "web-llm", "webllm"],
      onnxruntime: ["onnxruntime", "onnxruntime-web"],
      "tesseract.js": ["tesseract.js", "tesseract"],
      katex: ["katex"],
    }[name] ?? [name];
    const matches = jsChunks.filter((file) => {
      const source = readFileSync(file, "utf8");
      return aliases.some((alias) => source.includes(alias));
    });
    if (!matches.length) {
      console.log(`Optional chunk ${name}: not emitted in this build`);
      continue;
    }
    const rawBytes = matches.reduce((sum, file) => sum + statSync(file).size, 0);
    const gzipBytes = matches.reduce((sum, file) => sum + gzipSync(readFileSync(file), { level: 9 }).length, 0);
    console.log(`Optional chunk ${name}: ${rawBytes} bytes raw / ${gzipBytes} bytes gzip (${matches.length} files)`);
    if (rawBytes > budget.maxBytes) failures.push(`${name} optional chunks exceed ${budget.maxBytes} bytes`);
    if (gzipBytes > budget.maxGzipBytes) failures.push(`${name} optional chunks exceed ${budget.maxGzipBytes} gzip bytes`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Client performance budget passed (route imports, raw and gzip initial assets, route budgets).");

