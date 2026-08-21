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
