import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The assessment/property suites intentionally perform long synchronous
    // CPU work. On Windows, two concurrent CPU-heavy files can starve Vitest's
    // 60s worker RPC long enough for onTaskUpdate itself to time out even when
    // every assertion passes. Serialising files preserves the full test corpus
    // and its existing assertion/time budgets while keeping the runner channel
    // responsive and deterministic in CI.
    maxWorkers: 1,
    fileParallelism: false,
  },
});
