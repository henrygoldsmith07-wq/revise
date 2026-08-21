import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("offline feedback contracts", () => {
  it("explains that offline work is safe and gives an honest recovery action", () => {
    const shell = read("src/components/AppShell.tsx");

    expect(shell).toContain("Offline — your work is safe");
    expect(shell).toContain("will sync when you reconnect");
    expect(shell).toContain("Try again");
    expect(shell).toContain("Last synced");
    expect(shell).toContain('role="status"');
    expect(shell).toContain('aria-live="polite"');
  });

  it("keeps queue status current after local writes", () => {
    const sync = read("src/data/sync.ts");
    const store = read("src/state/store.tsx");

    expect(sync).toContain("SYNC_QUEUE_EVENT");
    expect(sync).toContain("dispatchEvent(new Event(SYNC_QUEUE_EVENT))");
    expect(store).toContain("lastSyncError");
    expect(store).toContain("window.addEventListener(SYNC_QUEUE_EVENT");
    expect(store).toContain("Some changes are still waiting to sync");
  });

  it("retries the pull cursor after a failed table read", () => {
    const sync = read("src/data/sync.ts");

    expect(sync).toContain("Promise<{ pulled: number; failed: number }>");
    expect(sync).toContain("if (failed === 0) await writeReviseMeta(\"lastPullAt\", startedAt);");
  });
});
