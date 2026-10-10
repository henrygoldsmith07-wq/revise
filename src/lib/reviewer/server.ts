import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import committedAuditLog from "@/content/reviews/wjec-review-audit-log.json";
import committedLedger from "@/content/reviews/wjec-human-verification.json";
import { seedQuestions } from "@/content";
import { WJEC_REVIEWER_ROLES } from "@/domain/content-trust";
import { reviewPriorityIndex, type ReviewPriorityIndex } from "./priority";
import { reviewTopicContext } from "./view";
import { combineAuditLog, effectiveLedger, readRuntimeEventPages, REVIEW_AUDIT_EVENT_COLUMNS, type CombinedAuditLog, type RuntimeEventInsert, type RuntimeEventRow, type ReviewerGrant } from "./runtime-ledger";

// ---------------------------------------------------------------------------
// Server-side access for the reviewer portal.
//
// Every portal read and write goes through the CALLER's Supabase session
// (anon key + request cookies), so RLS is the second wall behind these checks:
// `review_audit_events` is readable and insertable only by an active reviewer,
// and the insert trigger binds the event to the caller's own grant. The
// service role is used for exactly one read-only job: deriving the public
// verified-ledger feed students merge (getPublicRuntimeLedger).
// ---------------------------------------------------------------------------

export const reviewBank = seedQuestions;
export { committedAuditLog, committedLedger };

export type ReviewerContext =
  | { status: "unconfigured" }
  | { status: "signed-out" }
  | { status: "not-reviewer"; email: string | null }
  | { status: "ok"; supabase: SupabaseClient; grant: ReviewerGrant; email: string | null };

export async function createSessionClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          for (const item of items) cookieStore.set(item.name, item.value, item.options);
        } catch {
          // Server Components get a read-only cookie store; reading is enough.
        }
      },
    },
  });
}

/** Authenticate (getUser verifies the JWT with Supabase) and authorise as a reviewer. */
export async function getReviewerContext(): Promise<ReviewerContext> {
  const supabase = await createSessionClient();
  if (!supabase) return { status: "unconfigured" };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { status: "signed-out" };
  const email = auth.user.email ?? null;
  const { data, error } = await supabase
    .from("reviewer_roles")
    .select("role, reviewer_label, qualification, revoked_at")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error || !data || data.revoked_at) return { status: "not-reviewer", email };
  const role = String(data.role);
  if (!(WJEC_REVIEWER_ROLES as readonly string[]).includes(role)) return { status: "not-reviewer", email };
  return {
    status: "ok",
    supabase,
    email,
    grant: {
      userId: auth.user.id,
      reviewerLabel: String(data.reviewer_label),
      role: role as ReviewerGrant["role"],
      qualification: String(data.qualification),
    },
  };
}

export async function loadRuntimeRows(client: SupabaseClient): Promise<RuntimeEventRow[]> {
  return readRuntimeEventPages(async (from, to) => {
    const { data, error } = await client
      .from("review_audit_events")
      .select(REVIEW_AUDIT_EVENT_COLUMNS.join(", "))
      .order("seq", { ascending: true })
      .range(from, to);
    if (error) throw new Error(`review audit events could not be read (${error.code ?? "unknown"})`);
    return (data ?? []) as unknown as RuntimeEventRow[];
  });
}

export async function loadCombinedLog(client: SupabaseClient): Promise<CombinedAuditLog> {
  return combineAuditLog(committedAuditLog, await loadRuntimeRows(client));
}

/** Insert one event. A 40001/23505 means another reviewer appended first. */
export async function appendRuntimeEvent(client: SupabaseClient, row: RuntimeEventInsert): Promise<"ok" | "conflict" | "forbidden" | "error"> {
  const { error } = await client.from("review_audit_events").insert(row);
  if (!error) return "ok";
  if (error.code === "40001" || error.code === "23505") return "conflict";
  if (error.code === "42501") return "forbidden";
  return "error";
}

/** Verified-ledger feed for students; derived, read-only, fails closed to the committed ledger. */
export async function getPublicRuntimeLedger(admin: SupabaseClient | null) {
  if (!admin) return { ledger: effectiveLedger(reviewBank, committedLedger, combineAuditLog(committedAuditLog, [])), chainOk: true, runtimeEvents: 0 };
  const combined = await loadCombinedLog(admin);
  return { ledger: effectiveLedger(reviewBank, committedLedger, combined), chainOk: combined.issues.length === 0, runtimeEvents: combined.runtimeOnly };
}

/** Capability-first review order for one subject, against the verified combined chain (memoised). */
export function getReviewPriority(combined: CombinedAuditLog, subjectId: string): ReviewPriorityIndex {
  const { topics, gate } = reviewTopicContext();
  return reviewPriorityIndex({ questions: reviewBank, combined, committedLedger, subjectId, topics, gate });
}
