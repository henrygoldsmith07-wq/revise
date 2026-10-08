// ---------------------------------------------------------------------------
// Account deletion — the pure rules and the words.
//
// Two different things are easy to confuse, and the product must never let a
// learner confuse them:
//
//   * Erase local data — wipes this browser profile's IndexedDB. Nothing on
//     the server changes; signing in again brings synced history back.
//   * Delete account — an authenticated server request that deletes the
//     account itself (auth.users) and, through ON DELETE CASCADE, every synced
//     row, deletion marker, learner record, consent row and AI quota row,
//     then verifies nothing is left.
//
// The route (src/app/api/account/delete/route.ts) does the privileged work;
// this module holds what can be decided without I/O so it can be tested.
// ---------------------------------------------------------------------------

/** The exact phrase the learner types to confirm. Case-sensitive on purpose. */
export const ACCOUNT_DELETION_CONFIRMATION = "DELETE MY ACCOUNT";

export const LOCAL_ERASE_EXPLANATION =
  "Erase local data wipes everything stored in this browser. It does not delete your account or anything already synced to it — sign in again and synced history comes back.";

export const ACCOUNT_DELETION_EXPLANATION =
  "Delete account permanently deletes your Revise account and everything synced to it: cards, answers, marks, mistakes, plans, exam dates, settings, deletion records, AI consent and AI usage counters. It cannot be undone. Export a portable snapshot first if you want a copy.";

export type DeletionRequestCheck =
  | { ok: true }
  | { ok: false; status: 400 | 403; error: string };

/**
 * Reject cross-site requests. Browsers send Origin on POST; when present it
 * must match the host the request was made to. (Session cookies are
 * SameSite=Lax as well, so this is a second, explicit layer.)
 */
export function sameOriginRequest(requestUrl: string, origin: string | null, secFetchSite: string | null): boolean {
  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "none") return false;
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(requestUrl).host;
  } catch {
    return false;
  }
}

export function checkDeletionRequest(input: {
  requestUrl: string;
  origin: string | null;
  secFetchSite: string | null;
  body: unknown;
}): DeletionRequestCheck {
  if (!sameOriginRequest(input.requestUrl, input.origin, input.secFetchSite)) {
    return { ok: false, status: 403, error: "Account deletion must be requested from Revise itself." };
  }
  const confirm =
    typeof input.body === "object" && input.body !== null ? (input.body as { confirm?: unknown }).confirm : undefined;
  if (confirm !== ACCOUNT_DELETION_CONFIRMATION) {
    return { ok: false, status: 400, error: `Type ${ACCOUNT_DELETION_CONFIRMATION} to confirm.` };
  }
  return { ok: true };
}

export interface ResidualRow {
  scope: string;
  remaining: number;
}

/** Normalise the account_residual_rows RPC result; anything unreadable counts as residual. */
export function residualScopes(rows: unknown): ResidualRow[] {
  if (!Array.isArray(rows)) return [{ scope: "unverified", remaining: 1 }];
  return rows
    .map((row) => {
      const r = typeof row === "object" && row !== null ? (row as { scope?: unknown; remaining?: unknown }) : {};
      const remaining = typeof r.remaining === "number" ? r.remaining : Number(r.remaining);
      return { scope: typeof r.scope === "string" ? r.scope : "unknown", remaining: Number.isFinite(remaining) ? remaining : 1 };
    })
    .filter((row) => row.remaining > 0);
}
