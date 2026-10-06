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
    // Several suites drive a full IndexedDB through fake-indexeddb
    // (repository, a11y, learner-continuity, question-replication). Those are
    // honest integration tests that take 3-4s on a quiet machine and routinely
    // cross the 5s default once the runner and the OS are busy, so the suite
    // failed intermittently on `main` before any of this branch's work existed
    // (verified: two consecutive baseline runs, no changes present, one pass and
    // one timeout). The budget below only changes how long a slow-but-correct
    // test may run; it does not weaken any assertion, timeout guard or gate, and
    // a genuine hang still fails.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
