import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { DB_VERSION, getProfileDb, profileDatabaseName, resetDbConnectionsForTests } from "@/data/db";
import { currentDatabaseNotice, resetDatabaseNoticeForTests } from "@/data/db-notice";
import { storageFailureKind, storageFailureMessage } from "@/data/storage-recovery";

// After a schema bump, a new tab used to hang at "opening your profile" for
// as long as an old tab stayed open: the old connection never closed on
// versionchange and the new open had no blocked handler.

function rawOpen(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => undefined;
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

afterEach(() => {
  resetDbConnectionsForTests();
  resetDatabaseNoticeForTests();
});

describe("IndexedDB version changes across tabs", () => {
  it("closes an old tab's connection when a newer version opens, and asks it to reload", async () => {
    const name = profileDatabaseName("tab-old");
    await getProfileDb("tab-old");
    // The "new build" in another tab: without a blocking handler this hangs.
    const newer = await rawOpen(name, DB_VERSION + 1);
    newer.close();
    expect(currentDatabaseNotice()).toBe("stale");
    const error = await getProfileDb("tab-old").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(storageFailureKind(error)).toBe("outdated");
    expect(storageFailureKind(new Error((error as Error).message))).toBe("outdated");
    expect(storageFailureMessage(error)).toMatch(/older version/i);
    await deleteDb(name);
  });

  it("tells the new tab it is waiting on another tab, and clears the notice once it opens", async () => {
    const name = profileDatabaseName("tab-blocked");
    // An old build's tab that never handles versionchange.
    const old = await rawOpen(name, DB_VERSION - 1);
    const opening = getProfileDb("tab-blocked");
    await tick();
    expect(currentDatabaseNotice()).toBe("blocked");
    old.close();
    const db = await opening;
    expect(db.version).toBe(DB_VERSION);
    expect(currentDatabaseNotice()).toBeNull();
    db.close();
    await deleteDb(name);
  });

  it("reports a database newer than this build as an older tab, not a failed migration", async () => {
    const name = profileDatabaseName("tab-newer");
    const newer = await rawOpen(name, DB_VERSION + 3);
    newer.close();
    const error = await getProfileDb("tab-newer").catch((caught: unknown) => caught);
    expect(storageFailureKind(error)).toBe("outdated");
    expect(storageFailureMessage(new Error((error as Error).message))).toMatch(/older version.*reload/i);
    await deleteDb(name);
  });
});
