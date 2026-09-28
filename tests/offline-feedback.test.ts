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
    const engine = read("src/state/sync-engine.ts");
    const store = read("src/state/store.tsx");

    expect(sync).toContain("SYNC_QUEUE_EVENT");
    expect(sync).toContain("dispatchEvent(new Event(SYNC_QUEUE_EVENT))");
    expect(engine).toContain("window.addEventListener(SYNC_QUEUE_EVENT");
    expect(engine).toContain("Some changes are still waiting to sync");
    // The central store still exposes the status the banner reads.
    expect(store).toContain("syncStatus");
  });

  it("retries the pull cursor after a failed table read", () => {
    const sync = read("src/data/sync.ts");

    expect(sync).toContain("Promise<{ pulled: number; failed: number; skipped?: SyncSkip }>");
    // Cursors are per entity, so one failing table no longer blocks or replays
    // the others. Each cursor advances only after that entity's pages merged
    // cleanly, and only to server-authored values — never the local clock. They
    // are account-scoped so one device cannot skip another's rows.
    expect(sync).toContain("SYNC_PULL_PAGE_SIZE = 500");
    expect(sync).toMatch(/if \(entityOk\) \{[\s\S]*await writePullCursor\(userId, entity, cursor\);/);
    expect(sync).toContain('writeReviseUserMeta("pullCursors", userId, { ...all, [pullCursorKey(entity)]: cursor })');
    // A page with undecryptable rows pins that entity's cursor so the retry
    // re-reads the unreadable rows instead of skipping past them.
    expect(sync).toMatch(/if \(rowFailures > 0\) \{[\s\S]*entityOk = false;[\s\S]*break;/);
  });
});
