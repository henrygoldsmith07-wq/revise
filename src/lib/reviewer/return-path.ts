// Pure helper for the reviewer sign-in link (unit-tested in tests/reviewer-batches.test.ts).

/**
 * Is this a reviewer-portal path? Exact segment match: the student route
 * "/review" (spaced repetition) is not part of the portal.
 */
export function isReviewerPath(pathname: string | null | undefined): boolean {
  return pathname === "/reviewer" || Boolean(pathname?.startsWith("/reviewer/"));
}

/**
 * Where the link should bring the teacher back to: the reviewer page they
 * opened (so a shared /reviewer/pairs?subject=physics link survives sign-in),
 * never anywhere outside the portal.
 */
export function reviewerReturnPath(pathname: string, search: string): string {
  if (!isReviewerPath(pathname) || pathname.includes("//")) return "/reviewer";
  const params = new URLSearchParams(search);
  // Supabase adds these on the way back; never bounce them into a new link.
  for (const key of ["code", "error", "error_code", "error_description"]) params.delete(key);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

export type SignInLinkProblem = "expired" | "other-browser" | "failed" | null;

/**
 * What went wrong when a teacher arrives from a sign-in link and still has no
 * session, read from the URL Supabase redirected to. Supabase reports a used
 * or expired link as `error_code=otp_expired` (query or hash). A `code` that
 * did not turn into a session almost always means the link was opened in a
 * different browser from the one that requested it: the PKCE verifier lives
 * only in the requesting browser (common when the email is read on a phone).
 * Pure: the caller decides it only after the session check came back empty.
 */
export function signInLinkProblem(search: string, hash: string): SignInLinkProblem {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const read = (key: string) => query.get(key) ?? fragment.get(key);
  const code = read("error_code");
  if (code === "otp_expired") return "expired";
  if (read("error") || code || read("error_description")) return "failed";
  if (query.get("code")) return "other-browser";
  return null;
}
