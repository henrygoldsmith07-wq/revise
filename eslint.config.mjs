import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // pdf.worker.min.mjs is vendored build output copied in by a prebuild step.
  // .claude/ holds local agent worktrees (whole checkouts), never app source.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "public/**", ".claude/**"]),
]);
