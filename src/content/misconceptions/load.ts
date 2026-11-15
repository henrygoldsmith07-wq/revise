import type { Misconception } from "@/domain/types";

// The misconception library as its own chunk. The app shell needs it only
// once an answer is marked (to tag a lost mark with the belief behind it) and
// for the recurring-misconceptions tally, so the "/" route no longer ships its
// ~65 KB of authored text before Today can paint. A failed load (offline
// before the chunk was ever cached) is retried on the next call; callers
// treat it as an empty library, so marking still works without it.

let pending: Promise<Misconception[]> | null = null;

export function loadMisconceptions(): Promise<Misconception[]> {
  pending ??= import("./index").then(
    (module) => module.seedMisconceptions,
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );
  return pending;
}
