// Maintainer tool: give a teacher reviewer access in one command, instead of
// inviting them in the Supabase dashboard and then pasting SQL with a uuid
// lookup into the SQL editor.
//
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run wjec:reviewer:grant -- \
//     --email teacher@school.org --label teacher-jsmith --role teacher \
//     --qualification "PGCE Physics; 8 years teaching WJEC A-level" \
//     --granted-by henry --invite --site https://revise-gray.vercel.app [--dry-run]
//
//   ... npm run wjec:reviewer:grant -- --email teacher@school.org --revoke
//
// It does exactly what docs/review-workflow.md describes by hand:
//   1. finds the teacher's Supabase Auth account by email, or with --invite
//      sends Supabase's own invite email (redirecting to the portal);
//   2. calls public.grant_reviewer_role (or revoke_reviewer_role), which only
//      the service role may execute.
// It never approves anything, never creates a reviewer without a real auth
// account, and never weakens the two-independent-reviewer rule. The service
// role key stays in the maintainer's shell; nothing is written to the repo.
import { createClient } from "@supabase/supabase-js";
import { grantProblems, parseGrantArgs, reviewerLink } from "./lib/reviewer-grant.mjs";

let args;
try {
  args = parseGrantArgs(process.argv.slice(2));
} catch (error) {
  console.error(String(error.message ?? error));
  process.exit(2);
}
const problems = grantProblems(args);
if (problems.length) {
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(2);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role, never committed).");
  process.exit(2);
}
const site = args.site ?? process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });

async function findUser(email) {
  for (let page = 1; page < 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`could not list auth users (${error.message})`);
    const hit = data.users.find((user) => (user.email ?? "").toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

let user = await findUser(args.email);
const report = { email: args.email, dryRun: args.dryRun };

if (args.revoke) {
  if (!user) { console.error("No auth account has that email; nothing to revoke."); process.exit(1); }
  if (!args.dryRun) {
    const { error } = await admin.rpc("revoke_reviewer_role", { p_user_id: user.id });
    if (error) { console.error(`revoke_reviewer_role failed (${error.message})`); process.exit(1); }
  }
  console.log(JSON.stringify({ ...report, revoked: !args.dryRun, note: "Past decisions stay in the audit chain." }, null, 2));
  process.exit(0);
}

if (!user) {
  if (!args.invite) {
    console.error("No Supabase Auth account has that email. Re-run with --invite to send Supabase's invite email (and --site so it lands on the portal).");
    process.exit(1);
  }
  if (!site) {
    console.error("--invite needs --site (or NEXT_PUBLIC_SITE_URL) so the invite lands on the reviewer portal.");
    process.exit(2);
  }
  if (!args.dryRun) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(args.email, { redirectTo: reviewerLink(site, args.subject) });
    if (error || !data.user) { console.error(`invite failed (${error?.message ?? "no user returned"})`); process.exit(1); }
    user = data.user;
  }
  report.invited = true;
}

if (!args.dryRun) {
  const { error } = await admin.rpc("grant_reviewer_role", {
    p_user_id: user.id,
    p_reviewer_label: args.label,
    p_role: args.role,
    p_qualification: args.qualification,
    p_granted_by: args.grantedBy,
  });
  if (error) {
    const hint = /reviewer_label/.test(error.message) ? " (that pseudonym is already used by another reviewer)" : "";
    console.error(`grant_reviewer_role failed (${error.message})${hint}`);
    process.exit(1);
  }
}

console.log(JSON.stringify({
  ...report,
  granted: !args.dryRun,
  reviewerLabel: args.label,
  role: args.role,
  sendThisLink: site ? reviewerLink(site, args.subject) : "set --site to print the portal link",
  next: report.invited
    ? "The teacher gets Supabase's invite email; after accepting it they land on the transfer-pair batch, already signed in."
    : "Send the teacher the link above. They sign in with a one-time email link and return to the batch.",
}, null, 2));
