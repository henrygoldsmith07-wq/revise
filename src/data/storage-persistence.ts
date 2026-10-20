import { readReviseMeta, writeReviseMeta } from "./storage-namespace";

// ---------------------------------------------------------------------------
// Persistent storage request.
//
// IndexedDB is the source of truth, and for a learner who never signs in it
// is the only copy. Browsers treat site data as "best-effort" by default:
// Chrome may evict it under storage pressure, and Safari deletes script-
// writable storage for a site not used for seven days (unless installed to
// the home screen). navigator.storage.persist() asks the browser to exempt
// this origin. Chrome and Edge grant it silently from engagement signals,
// Firefox asks the user, Safari grants it to installed web apps; a refusal is
// an honest outcome, not an error.
//
// Requested once onboarding completes (the learner has now chosen to keep
// data here), and again from Settings on demand. The outcome is stored so the
// Settings line can show it even where `persisted()` is unavailable.
// ---------------------------------------------------------------------------

export type StoragePersistenceState = "persisted" | "best-effort" | "unsupported";

export interface StoragePersistenceRecord {
  state: StoragePersistenceState;
  checkedAt: string;
}

interface StorageManagerLike {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
}

function storageManager(): StorageManagerLike | null {
  if (typeof navigator === "undefined") return null;
  const storage = (navigator as Navigator & { storage?: StorageManagerLike }).storage;
  return storage ?? null;
}

/** Current state without asking the browser for anything. */
export async function storagePersistenceState(): Promise<StoragePersistenceState> {
  const storage = storageManager();
  if (!storage?.persisted) return storage?.persist ? "best-effort" : "unsupported";
  try {
    return (await storage.persisted()) ? "persisted" : "best-effort";
  } catch {
    return "best-effort";
  }
}

/** Ask the browser to keep this origin's data, store the outcome, and return it. */
export async function requestPersistentStorage(): Promise<StoragePersistenceState> {
  const storage = storageManager();
  let state: StoragePersistenceState;
  if (!storage?.persist) {
    state = "unsupported";
  } else {
    try {
      state = (await storagePersistenceState()) === "persisted" || (await storage.persist()) ? "persisted" : "best-effort";
    } catch {
      state = "best-effort";
    }
  }
  const record: StoragePersistenceRecord = { state, checkedAt: new Date().toISOString() };
  await writeReviseMeta("storagePersistence", record).catch(() => undefined);
  return state;
}

/** The live state where the browser reports it, else the last stored outcome. */
export async function readStoragePersistence(): Promise<StoragePersistenceState> {
  const live = await storagePersistenceState();
  if (live !== "unsupported") return live;
  const stored = await readReviseMeta<StoragePersistenceRecord>("storagePersistence").catch(() => undefined);
  return stored?.state ?? "unsupported";
}

export const STORAGE_PERSISTENCE_COPY: Record<StoragePersistenceState, { label: string; explanation: string }> = {
  persisted: {
    label: "Persistent",
    explanation: "This browser has agreed not to clear Revise's data on this device to free up space.",
  },
  "best-effort": {
    label: "Best-effort",
    explanation: "This browser may clear Revise's data on this device under storage pressure, or (Safari) after a week unused. Sign in to sync, or export a backup.",
  },
  unsupported: {
    label: "Not reported",
    explanation: "This browser does not say whether it keeps site data. Sign in to sync, or export a backup, so this device is not your only copy.",
  },
};
