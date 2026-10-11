// Pure helper for the reviewer sign-in link (unit-tested in tests/reviewer-batches.test.ts).

/**
 * Where the link should bring the teacher back to: the reviewer page they
 * opened (so a shared /reviewer/pairs?subject=physics link survives sign-in),
 * never anywhere outside the portal.
 */
export function reviewerReturnPath(pathname: string, search: string): string {
  const inPortal = pathname === "/reviewer" || pathname.startsWith("/reviewer/");
  if (!inPortal || pathname.includes("//")) return "/reviewer";
  const params = new URLSearchParams(search);
  // Supabase adds these on the way back; never bounce them into a new link.
  for (const key of ["code", "error", "error_code", "error_description"]) params.delete(key);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}
