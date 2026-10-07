// ---------------------------------------------------------------------------
// Retention policy — what is kept, for how long, and what enforces it.
//
// This replaces an earlier `RetentionSettings` / `shouldRetain()` pair that
// modelled a 365-day server retention window nothing ever called. A policy
// that is never enforced reads like a promise; this table states only what
// the code actually does, and names the mechanism for each row so a reviewer
// (and tests/retention-policy.test.ts) can check the claim against the repo.
//
// Revision history is deliberately not auto-expired: spaced repetition and
// the evidence model need the learner's full history. The learner controls
// it directly — Erase local data, delete individual records, or Delete
// account — and those are the enforced mechanisms listed below.
// ---------------------------------------------------------------------------

/** Days an untouched AI quota row is kept before the scheduled purge removes it. */
export const AI_QUOTA_RETENTION_DAYS = 2;

export interface RetentionRule {
  data: string;
  where: "device" | "server";
  retention: string;
  /** Repository paths of the code that enforces the rule. */
  enforcedBy: string[];
}

export const RETENTION_POLICY: readonly RetentionRule[] = [
  {
    data: "Revision data on this device (cards, answers, marks, mistakes, plans, settings)",
    where: "device",
    retention: "Until you erase local data, delete the record, or delete your account.",
    enforcedBy: ["src/data/db.ts", "src/app/settings/page.tsx"],
  },
  {
    data: "Synced revision data (signed-in accounts)",
    where: "server",
    retention: "Until you delete the record or delete your account; account deletion cascades every synced table.",
    enforcedBy: ["src/app/api/account/delete/route.ts", "supabase/schema.sql"],
  },
  {
    data: "Deletion records that stop a deleted item reappearing from another device",
    where: "server",
    retention: "For the life of the account; removed when the account is deleted.",
    enforcedBy: ["supabase/schema.sql", "src/app/api/account/delete/route.ts"],
  },
  {
    data: "AI consent record",
    where: "server",
    retention: "For the life of the account; removed when the account is deleted.",
    enforcedBy: ["supabase/migrations/20261007000100_privacy_ai_trust.sql", "src/app/api/account/delete/route.ts"],
  },
  {
    data: "AI usage counters (rate limiting)",
    where: "server",
    retention: `Deleted after ${AI_QUOTA_RETENTION_DAYS} days without use, and immediately when the account is deleted.`,
    enforcedBy: [
      "supabase/migrations/20261007000100_privacy_ai_trust.sql",
      "src/app/api/maintenance/retention/route.ts",
      "src/app/api/account/delete/route.ts",
    ],
  },
  {
    data: "Answers cached from earlier AI marks (on this device only)",
    where: "device",
    retention: "30 days, capped at 2,000 entries.",
    enforcedBy: ["src/ai/semantic-cache.ts"],
  },
  {
    data: "Answers waiting for an AI re-mark (on this device only)",
    where: "device",
    retention: "Until re-marked, 12 attempts, or AI is switched off — whichever comes first.",
    enforcedBy: ["src/ai/mark-dlq.ts", "src/ai/consent-client.ts"],
  },
];
