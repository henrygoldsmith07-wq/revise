/**
 * Revise's own Pulse consent, read server-side from the `user_settings` row
 * the app syncs. Off by default: a missing row, a missing flag, or anything
 * other than an explicit boolean true withholds the history.
 */

export function pulseEnabledValue(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const value = (data as { pulseEnabled?: unknown }).pulseEnabled;
  return value === true;
}

export function pulseHistoryAllowed(data: unknown): boolean {
  return pulseEnabledValue(data);
}

/**
 * The settings row is end-to-end encrypted, so the server cannot read the
 * Pulse choice (and the history rows are ciphertext too). Same shape test as
 * `isEncryptedPayload` in ./e2ee, which is a client module.
 */
export function pulseSettingsEncrypted(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const v = data as Record<string, unknown>;
  return v.v === 1 && v.alg === "AES-GCM" && typeof v.iv === "string" && typeof v.ct === "string";
}
