// Pure argument parsing and validation for scripts/grant-reviewer.mjs.
// Mirrors the CHECK constraints on public.reviewer_roles
// (supabase/migrations/20261007000200_reviewer_portal.sql) so a bad grant is
// refused before anything touches the database. Kept separate so it is unit
// tested without a network (tests/reviewer-grant-cli.test.ts).

export const REVIEWER_ROLES = ["teacher", "examiner", "subject-expert"];
export const LABEL_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseGrantArgs(argv) {
  const out = { invite: false, dryRun: false, revoke: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const take = () => {
      const eq = arg.indexOf("=");
      if (eq > 0) return arg.slice(eq + 1);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      i++;
      return value;
    };
    const name = arg.split("=")[0];
    if (name === "--email") out.email = take().trim().toLowerCase();
    else if (name === "--label") out.label = take().trim();
    else if (name === "--role") out.role = take().trim();
    else if (name === "--qualification") out.qualification = take().trim();
    else if (name === "--granted-by") out.grantedBy = take().trim();
    else if (name === "--site") out.site = take().trim().replace(/\/+$/, "");
    else if (name === "--subject") out.subject = take().trim();
    else if (name === "--invite") out.invite = true;
    else if (name === "--dry-run") out.dryRun = true;
    else if (name === "--revoke") out.revoke = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  return out;
}

/** Every reason this grant must not be made; empty means it may proceed. */
export function grantProblems(args) {
  const problems = [];
  if (!args.email || !EMAIL_PATTERN.test(args.email)) problems.push("--email must be the teacher's email address");
  if (args.revoke) return problems;
  if (!args.label || !LABEL_PATTERN.test(args.label)) problems.push("--label must be a pseudonym like teacher-jsmith (lowercase letters, digits, . _ -; 3-64 chars)");
  else if (args.email && args.email.split("@")[0].length >= 3 && args.label.includes(args.email.split("@")[0])) problems.push("--label must be a pseudonym: it is shown to students and stamped on every decision, so do not reuse the email address");
  if (!REVIEWER_ROLES.includes(args.role)) problems.push(`--role must be one of ${REVIEWER_ROLES.join(", ")}`);
  if (!args.qualification || args.qualification.length < 3 || args.qualification.length > 300) problems.push("--qualification must describe the teacher's qualification (3-300 chars), e.g. \"PGCE Physics; 8 years teaching WJEC A-level\"");
  if (!args.grantedBy || args.grantedBy.length > 120) problems.push("--granted-by must name who is granting access (1-120 chars)");
  // The person granting access is the maintainer who authors the questions.
  // A reviewer approval must come from someone else; refuse the obvious
  // self-grant. This is a guard against a mistake, not a proof of identity.
  const granter = (args.grantedBy ?? "").toLowerCase();
  if (granter && (granter === (args.label ?? "").toLowerCase() || granter === (args.email ?? "") || granter === (args.email ?? "").split("@")[0])) {
    problems.push("the maintainer cannot grant reviewer access to themselves: questions they authored need two independent reviewers");
  }
  if (args.site && !/^https?:\/\/[^/\s]+$/.test(args.site)) problems.push("--site must be an origin like https://revise-gray.vercel.app");
  return problems;
}

/**
 * What to tell the maintainer when public.grant_reviewer_role refuses. A
 * reviewer's pseudonym never changes once granted: the two-independent-
 * reviewer rule is counted by it, so re-granting the same account under a new
 * --label would make one person count twice. Re-run with their existing label.
 */
export function grantFailureHint(message) {
  const text = String(message ?? "");
  const existing = /already reviewer ([a-z0-9][a-z0-9._-]*)/.exec(text)?.[1];
  if (/pseudonym cannot change/.test(text)) {
    return existing
      ? ` (this account already reviews as ${existing}; re-run with --label ${existing}. A pseudonym never changes, because independent approvals are counted by it)`
      : " (this account already has a reviewer pseudonym; re-run with its existing --label)";
  }
  if (/reviewer_label/.test(text)) return " (that pseudonym is already used by another reviewer)";
  return "";
}

/** The portal page to send the teacher: the transfer-pair batch for one subject. */
export function reviewerLink(site, subject = "physics") {
  return `${site}/reviewer/pairs?subject=${encodeURIComponent(subject)}`;
}
