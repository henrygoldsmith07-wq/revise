// check-docs-integrity.mjs — fail CI when docs describe a repo that no longer exists.
// Checks README.md + docs/**/*.md for:
//   - documented app routes (`/foo`, `](/foo)`, `src/app/foo/page.tsx`) that have no page/route
//   - referenced repo files (src/…, scripts/…, tests/…, supabase/…, public/…, e2e/…) that are missing
//   - referenced npm scripts (`npm run foo`) that are not in package.json
//   - referenced test files that have been deleted
// Run: node scripts/check-docs-integrity.mjs
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function listFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) listFiles(full, out);
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

function existingRoutes() {
  const routes = new Set(["/"]);
  const walk = (dir, prefix) => {
    let entries = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full, `${prefix}/${e}`);
      } else if (e === "page.tsx") {
        routes.add(prefix === "" ? "/" : prefix);
      } else if (e === "route.ts") {
        routes.add(prefix === "" ? "/" : prefix);
      }
    }
  };
  walk(join(ROOT, "src/app"), "");
  return routes;
}

const routes = existingRoutes();
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const scripts = new Set(Object.keys(pkg.scripts ?? {}));

// Static/asset paths that are served but are not App Router pages.
const ROUTE_ALLOWLIST = new Set(["/api", "/docs", "/_next", "/sw.js"]);
// Historical names may appear in prose when explicitly marked removed; the
// check only flags live claims (links, inline code, src/app file refs).
const PROSE_ALLOWLIST = new Set([]);

const docs = [join(ROOT, "README.md"), ...listFiles(join(ROOT, "docs"))];
const errors = [];

function isRouteAllowed(route) {
  if (routes.has(route)) return true;
  for (const prefix of ROUTE_ALLOWLIST) {
    if (route === prefix || route.startsWith(`${prefix}/`) || route.startsWith(`${prefix}*`)) return true;
  }
  // API sub-routes: /api/ai, /api/pulse/history exist as route.ts.
  if (route.startsWith("/api/")) {
    for (const r of routes) {
      if (route === r || route.startsWith(`${r}/`)) return true;
    }
  }
  return false;
}

for (const file of docs) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const rel = file.replace(`${ROOT}\\`, "").replace(`${ROOT}/`, "");

  // 1. Markdown links to app routes: ](/foo) or ](/foo/bar)
  for (const m of text.matchAll(/\]\((\/[a-z0-9][a-z0-9\-/]*)\)/g)) {
    const route = m[1].split("#")[0].split("?")[0];
    if (!route || PROSE_ALLOWLIST.has(route)) continue;
    if (!isRouteAllowed(route)) errors.push(`${rel}: linked route ${route} has no page/route (see src/app)`);
  }
  // 2. Inline-code routes: `/foo` — only single/double-segment app-like paths.
  for (const m of text.matchAll(/`(\/[a-z0-9][a-z0-9\-/]*)`/g)) {
    const route = m[1].split("#")[0].split("?")[0];
    // Skip file paths, URLs with dots, and API wildcards handled elsewhere.
    if (route.includes(".") || route.includes("*")) continue;
    if (PROSE_ALLOWLIST.has(route)) continue;
    // Only flag plausible app routes (1–2 segments); ignore `/a/b/c` prose.
    const segs = route.split("/").filter(Boolean);
    if (segs.length < 1 || segs.length > 2) continue;
    if (!isRouteAllowed(route)) errors.push(`${rel}: documented route \`${route}\` has no page/route`);
  }
  // 3. src/app file refs must exist.
  for (const m of text.matchAll(/`(src\/app\/[^`\s)]+)`/g)) {
    const raw = m[1].replace(/[,:;.]$/, "");
    if (raw.includes("<") || raw.includes(">") || raw.includes("...")) continue;
    const ref = raw.split(":")[0];
    if (!existsSync(join(ROOT, ref))) errors.push(`${rel}: referenced file \`${raw}\` does not exist`);
  }
  // 4. Generic repo file refs (src/tests/scripts/…) in inline code.
  for (const m of text.matchAll(/`((?:src|tests|scripts|supabase|public|e2e)\/[^\s`)]+?)`/g)) {
    const raw = m[1].replace(/[,:;.]$/, "");
    if (raw.includes("<") || raw.includes(">") || raw.includes("...")) continue;
    let ref = raw.split("#")[0].split(":")[0];
    if (ref.endsWith("/")) continue;
    if (!existsSync(join(ROOT, ref))) {
      // Directories are valid refs (e.g. `src/app/benchmarks`).
      if (!existsSync(join(ROOT, ref))) errors.push(`${rel}: referenced path \`${m[1]}\` does not exist`);
    }
  }
  // 5. npm run foo must exist in package.json.
  for (const m of text.matchAll(/npm (?:cmd )?run ([a-z0-9:._-]+)/g)) {
    const name = m[1];
    if (!scripts.has(name)) errors.push(`${rel}: referenced npm script \`npm run ${name}\` does not exist`);
  }
  // 6. tests/*.test.ts refs must exist.
  for (const m of text.matchAll(/(tests\/[a-z0-9\-/]+\.test\.ts)/g)) {
    if (!existsSync(join(ROOT, m[1]))) errors.push(`${rel}: referenced test \`${m[1]}\` has been deleted`);
  }
  // 7. node scripts/*.mjs refs must exist.
  for (const m of text.matchAll(/(scripts\/[a-z0-9\-/]+\.mjs)/g)) {
    if (!existsSync(join(ROOT, m[1]))) errors.push(`${rel}: referenced script \`${m[1]}\` does not exist`);
  }
}

if (errors.length) {
  console.error("Docs integrity FAILED — documentation drifts from the repo:");
  for (const e of errors) console.error(`  - ${e}`);
  console.error(`\n${errors.length} drift finding(s). Fix the docs (do not recreate removed features) and rerun.`);
  process.exit(1);
} else {
  console.log(`Docs integrity OK — ${docs.length} files, ${routes.size} routes, ${scripts.size} scripts.`);
}
