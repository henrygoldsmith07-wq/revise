// Sync state — ephemeral UI state, never persisted.
//
// What causes writes: local repository writes enqueue to the outbox.
// What causes synchronisation: syncNow() drain+pull when online + signed in.
// Derived: pending count from outboxSize(), online from navigator.onLine.

import { isSupabaseConfigured } from "@/data/supabase";

export interface SyncStatus {
  online: boolean;
  pending: number;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  enabled: boolean;
  syncing: boolean;
}

export function initialSyncStatus(): SyncStatus {
  return {
    online: true,
    pending: 0,
    lastSyncedAt: null,
    lastSyncError: null,
    enabled: isSupabaseConfigured,
    syncing: false,
  };
}
