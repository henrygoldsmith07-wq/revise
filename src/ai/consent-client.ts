"use client";

// ---------------------------------------------------------------------------
// Browser side of per-learner AI consent.
//
// The device gate reads the learner's choice from IndexedDB on every AI
// request (so revoking takes effect on the very next call, with no in-memory
// copy to go stale), and the server row in public.ai_consent is what the
// /api/ai route enforces. A change made while offline is remembered as
// "pending" and pushed on the next reconcile; see reconcileAiConsent for the
// ordering rules.
// ---------------------------------------------------------------------------

import {
  AI_CONSENT_VERSION,
  aiConsentGrantedInSettings,
  aiConsentSettingsPatch,
  reconcileAiConsent,
  type PendingAiConsent,
  type ServerAiConsent,
} from "@/domain/ai-consent";
import type { Id, UserSettings } from "@/domain/types";
import { deleteMeta, getDb } from "@/data/db";
import { readReviseUserMeta, writeReviseUserMeta, REVISE_META_KEYS } from "@/data/storage-namespace";
import { getSupabase, isSupabaseConfigured } from "@/data/supabase";

/**
 * Whether this device may send anything to the AI route right now. Every
 * settings row in the active profile must carry an explicit, current opt-in;
 * an unreadable database means "no".
 */
export async function localAiConsentGranted(): Promise<boolean> {
  try {
    const db = await getDb();
    const rows = (await db.getAll("settings")) as unknown[];
    return rows.length > 0 && rows.every((row) => aiConsentGrantedInSettings(row));
  } catch {
    return false;
  }
}

function pendingKey(userId: Id): string {
  return `${REVISE_META_KEYS.aiConsentPending}::user:${userId}`;
}

async function readPending(userId: Id): Promise<PendingAiConsent | null> {
  const value = await readReviseUserMeta<PendingAiConsent>("aiConsentPending", userId);
  return value && typeof value.enabled === "boolean" && typeof value.at === "string" ? value : null;
}

async function clearPending(userId: Id): Promise<void> {
  await deleteMeta(pendingKey(userId));
}

async function readServerConsent(userId: Id): Promise<ServerAiConsent | null | "unavailable"> {
  const supabase = getSupabase();
  if (!supabase) return "unavailable";
  const { data, error } = await supabase
    .from("ai_consent")
    .select("enabled, consent_version, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return "unavailable";
  if (!data) return null;
  const row = data as { enabled?: unknown; consent_version?: unknown; updated_at?: unknown };
  return {
    enabled: row.enabled === true && row.consent_version === AI_CONSENT_VERSION,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

async function pushServerConsent(userId: Id, enabled: boolean, at: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { error } = await supabase
    .from("ai_consent")
    .upsert({ user_id: userId, enabled, consent_version: AI_CONSENT_VERSION, updated_at: at }, { onConflict: "user_id" });
  return !error;
}

/**
 * Record a learner's explicit choice on this device and, when signed in,
 * on the server. The local write happens first and is what the device gate
 * reads, so turning AI off stops this device immediately even when the
 * server cannot be reached; the server write is retried on reconcile.
 *
 * Returns whether the server confirmed the change (always true in local mode,
 * where there is no server copy).
 */
export async function recordAiConsentChoice(input: {
  userId: Id;
  enabled: boolean;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
}): Promise<{ serverConfirmed: boolean }> {
  const patch = aiConsentSettingsPatch(input.enabled);
  await input.updateSettings(patch);
  if (!input.enabled) {
    // Nothing queued under the old consent may leave later.
    const { clearDeadMarks } = await import("./mark-dlq");
    await clearDeadMarks();
  }
  if (!isSupabaseConfigured || input.userId === "local") return { serverConfirmed: true };
  await writeReviseUserMeta("aiConsentPending", input.userId, { enabled: input.enabled, at: patch.aiConsentUpdatedAt });
  const ok = await pushServerConsent(input.userId, input.enabled, patch.aiConsentUpdatedAt).catch(() => false);
  if (ok) await clearPending(input.userId);
  return { serverConfirmed: ok };
}

/**
 * Bring this device and the server back into agreement. Safe to call on
 * every successful sync. Returns the settings to adopt when the local value
 * changed, or null when nothing changed (or the server was unreachable).
 */
export async function reconcileAiConsentWithServer(userId: Id): Promise<UserSettings | null> {
  if (!isSupabaseConfigured || userId === "local") return null;
  const server = await readServerConsent(userId).catch(() => "unavailable" as const);
  if (server === "unavailable") return null;
  const pending = await readPending(userId);
  const decision = reconcileAiConsent({ pending, server });

  if (decision.push !== null) {
    const at = pending?.at ?? new Date().toISOString();
    const ok = await pushServerConsent(userId, decision.push, at).catch(() => false);
    if (ok) await clearPending(userId);
  } else if (decision.clearPending) {
    await clearPending(userId);
  }

  const db = await getDb();
  const stored = (await db.get("settings", userId)) as UserSettings | undefined;
  if (!stored) return null;
  if (aiConsentGrantedInSettings(stored) === decision.local) return null;
  const next: UserSettings = {
    ...stored,
    ...aiConsentSettingsPatch(decision.local),
    updatedAt: new Date().toISOString(),
  };
  const { saveSettings } = await import("@/data/repository");
  await saveSettings(next);
  if (!decision.local) {
    const { clearDeadMarks } = await import("./mark-dlq");
    await clearDeadMarks();
  }
  return next;
}
