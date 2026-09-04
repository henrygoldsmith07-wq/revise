#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const vitest = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vitest.cmd" : "vitest");
const result = spawnSync(vitest, ["run", "tests/supabase-staging.test.ts"], {
  cwd: root,
  env: { ...process.env, REVISE_STAGING_REQUIRED: "1" },
  stdio: "inherit",
});
process.exit(result.status ?? 1);
