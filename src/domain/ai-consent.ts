// ---------------------------------------------------------------------------
// Per-learner AI consent — the pure rules.
//
// Revise is used by UK students, many of them under 18. Sending a learner's
// answers, notes or photographs to a third-party model provider needs that
// learner's explicit, revocable opt-in. These functions are the single
// definition of what "consent is present" means, shared by:
//
//   * the browser gate (no AI request leaves the device without consent),
//   * the /api/ai route (the server refuses every task without consent), and
//   * the reconciliation that keeps the device and the server agreeing.
//
// Everything here is deliberately strict: a missing row, a missing flag, a
// string "true", a consent recorded against an older wording, or anything
// other than an explicit boolean `true` at the current version withholds.
// ---------------------------------------------------------------------------

/**
 * Version of the consent wording the learner agreed to. Bumping it makes
 * every earlier opt-in stale, so learners are asked again when what AI does
 * with their work changes materially.
 */
export const AI_CONSENT_VERSION = "2026-10-ai-consent-v1";

/**
 * Header the browser sends in local mode (no Supabase identity configured),
 * where the server has no account to read consent from. It is only accepted
 * outside production; production always requires an authenticated account
 * and a server-side consent row.
 */
export const AI_CONSENT_HEADER = "x-revise-ai-consent";
export const AI_CONSENT_HEADER_VALUE = AI_CONSENT_VERSION;

/** Error code the route returns, so the client can explain rather than retry. */
export const AI_CONSENT_REQUIRED_CODE = "ai-consent-required";
export const AI_CONSENT_UNAVAILABLE_CODE = "ai-consent-unavailable";

export const AI_CONSENT_REQUIRED_MESSAGE =
  "AI features are turned off for this account. Turn them on in Settings → AI to use them.";

/** Local settings fields that carry the learner's choice. */
export interface AiConsentSettingsFields {
  aiEnabled?: unknown;
  aiConsentVersion?: unknown;
  aiConsentUpdatedAt?: unknown;
}

/**
 * True only for an explicit opt-in at the current consent version. The
 * version check is what turns the old implicit `aiEnabled: true` default —
 * which no learner ever chose — into "off" for every existing profile.
 */
export function aiConsentGrantedInSettings(settings: unknown): boolean {
  if (typeof settings !== "object" || settings === null) return false;
  const value = settings as AiConsentSettingsFields;
  return value.aiEnabled === true && value.aiConsentVersion === AI_CONSENT_VERSION;
}

/** Server row shape in public.ai_consent. */
export interface AiConsentRow {
  enabled?: unknown;
  consent_version?: unknown;
  updated_at?: unknown;
}

export function aiConsentGrantedInRow(row: unknown): boolean {
  if (typeof row !== "object" || row === null) return false;
  const value = row as AiConsentRow;
  return value.enabled === true && value.consent_version === AI_CONSENT_VERSION;
}

export type AiConsentDecision =
  | { allowed: true }
  | { allowed: false; status: 403 | 503; code: string; error: string };

/**
 * The server-side decision for one AI request.
 *
 * - `account` mode: the caller is authenticated; consent is the server row.
 *   A database error fails closed with 503 (the row could not be read, so
 *   consent cannot be shown), never open.
 * - `local` mode: no identity backend is configured (development / a
 *   self-hosted single-device install). The browser asserts the learner's
 *   local choice with a versioned header. Production never reaches this mode:
 *   the route fails closed before consent is considered.
 */
export function decideAiConsent(
  input:
    | { mode: "account"; row: unknown; error: unknown }
    | { mode: "local"; header: string | null },
): AiConsentDecision {
  if (input.mode === "local") {
    return input.header === AI_CONSENT_HEADER_VALUE
      ? { allowed: true }
      : { allowed: false, status: 403, code: AI_CONSENT_REQUIRED_CODE, error: AI_CONSENT_REQUIRED_MESSAGE };
  }
  if (input.error) {
    return {
      allowed: false,
      status: 503,
      code: AI_CONSENT_UNAVAILABLE_CODE,
      error: "AI consent could not be checked right now. The rest of the app keeps working.",
    };
  }
  return aiConsentGrantedInRow(input.row)
    ? { allowed: true }
    : { allowed: false, status: 403, code: AI_CONSENT_REQUIRED_CODE, error: AI_CONSENT_REQUIRED_MESSAGE };
}

/** The settings patch that records an explicit choice. */
export function aiConsentSettingsPatch(enabled: boolean, now: Date = new Date()): {
  aiEnabled: boolean;
  aiConsentVersion: string;
  aiConsentUpdatedAt: string;
} {
  return { aiEnabled: enabled, aiConsentVersion: AI_CONSENT_VERSION, aiConsentUpdatedAt: now.toISOString() };
}

/** A consent change made on this device that the server has not confirmed yet. */
export interface PendingAiConsent {
  enabled: boolean;
  at: string;
}

export interface ServerAiConsent {
  enabled: boolean;
  updatedAt: string | null;
}

export interface AiConsentReconciliation {
  /** The value this device should hold afterwards. */
  local: boolean;
  /** Value to write to the server row, or null when the server is already right. */
  push: boolean | null;
  /** Whether the pending local change has been settled and can be cleared. */
  clearPending: boolean;
}

function instant(value: string | null | undefined): number {
  const ms = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

/**
 * Settle device and server after a consent change, a sign-in or a reconnect.
 *
 * The server row is authoritative (it is what the route enforces), with one
 * exception: a change made on this device while it could not reach the server
 * is pushed, unless the server holds a strictly newer decision. Ties resolve
 * to "off" — when two decisions cannot be ordered, the privacy-protective one
 * wins. A missing server row means "never opted in".
 */
export function reconcileAiConsent(input: {
  pending: PendingAiConsent | null;
  server: ServerAiConsent | null;
}): AiConsentReconciliation {
  const server = input.server ?? { enabled: false, updatedAt: null };
  const pending = input.pending;
  if (!pending) {
    return { local: server.enabled, push: null, clearPending: false };
  }
  const pendingAt = instant(pending.at);
  const serverAt = instant(server.updatedAt);
  if (serverAt > pendingAt) {
    return { local: server.enabled, push: null, clearPending: true };
  }
  if (serverAt === pendingAt && pending.enabled !== server.enabled) {
    return { local: false, push: server.enabled ? false : null, clearPending: true };
  }
  return {
    local: pending.enabled,
    push: pending.enabled === server.enabled && input.server ? null : pending.enabled,
    clearPending: true,
  };
}
