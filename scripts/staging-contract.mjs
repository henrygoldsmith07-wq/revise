export const REQUIRED_STAGING_SECRETS = [
  "REVISE_STAGING_SUPABASE_URL", "REVISE_STAGING_SUPABASE_ANON_KEY",
  "REVISE_STAGING_USER_A_EMAIL", "REVISE_STAGING_USER_A_PASSWORD",
  "REVISE_STAGING_USER_B_EMAIL", "REVISE_STAGING_USER_B_PASSWORD",
  "REVISE_STAGING_DATABASE_URL",
];
export const STAGING_TABLES = ["cards", "review_logs", "questions", "attempts", "mistakes", "papers", "planned_sessions", "exam_dates", "user_settings", "streaks", "lesson_progress", "sync_writes"];
export const SINGLETON_TABLES = ["user_settings", "streaks", "lesson_progress"];

export function stagingConfiguration(env) {
  const missing = REQUIRED_STAGING_SECRETS.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`[infrastructure] Missing GitHub secrets: ${missing.join(", ")}`);
  const url = new URL(env.REVISE_STAGING_SUPABASE_URL);
  if (url.protocol !== "https:") throw new Error("[infrastructure] Staging Supabase URL must use HTTPS.");
  const database = new URL(env.REVISE_STAGING_DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(database.protocol)) throw new Error("[infrastructure] Staging database URL must be PostgreSQL.");
  if (env.REVISE_STAGING_USER_A_EMAIL.trim().toLowerCase() === env.REVISE_STAGING_USER_B_EMAIL.trim().toLowerCase()) {
    throw new Error("[infrastructure] Two independent staging users are required.");
  }
}

/** Pure deployed-catalog checks, used by the runner and local unit tests. */
export function validateStagingCatalog(catalog) {
  const errors = [];
  for (const table of STAGING_TABLES) {
    const row = catalog.find((entry) => entry.table === table);
    if (!row) { errors.push(`${table}: missing table`); continue; }
    const expectedKey = SINGLETON_TABLES.includes(table) ? "user_id" : "id";
    if (row.primaryKey !== expectedKey) errors.push(`${table}: primary key must be ${expectedKey}`);
    const columns = table === "sync_writes" ? { id: "uuid", user_id: "uuid", created_at: "timestamp with time zone" }
      : { id: "uuid", user_id: "uuid", subject_id: "text", topic_id: "text", due: "date", date: "date", data: "jsonb", updated_at: "timestamp with time zone" };
    for (const [column, type] of Object.entries(columns)) {
      if (row.columns?.[column] !== type) errors.push(`${table}: ${column} must be ${type}`);
    }
    if (!row.rls) errors.push(`${table}: RLS disabled`);
    const ownerExpression = (value) => typeof value === "string" && /^\(*user_id = auth\.uid\(\)\)*$/.test(value);
    if (!row.policies?.some((p) => p.name === `${table}_owner` && p.command === "ALL" && p.roles.includes("authenticated") && ownerExpression(p.using) && ownerExpression(p.check))) {
      errors.push(`${table}: required owner policy missing or drifted`);
    }
    if (row.policies?.some((p) => p.name !== `${table}_owner`)) errors.push(`${table}: unexpected policy (may widen access)`);
    if (table !== "sync_writes") {
      for (const suffix of ["touch", "touch_insert"]) {
        if (!row.triggers?.some((t) => t.name === `${table}_${suffix}` && t.enabled === "O" && t.function === "touch_updated_at" && t.definition.includes(suffix === "touch" ? "BEFORE UPDATE" : "BEFORE INSERT"))) errors.push(`${table}: ${suffix} trigger missing or inactive`);
      }
      if (!row.indexes?.some((index) => index.includes("(user_id, updated_at, id)"))) errors.push(`${table}: keyset index missing`);
    }
  }
  return errors;
}
