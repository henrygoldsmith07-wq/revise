export const REQUIRED_STAGING_SECRETS = [
  "REVISE_STAGING_SUPABASE_URL", "REVISE_STAGING_SUPABASE_ANON_KEY",
  "REVISE_STAGING_USER_A_EMAIL", "REVISE_STAGING_USER_A_PASSWORD",
  "REVISE_STAGING_USER_B_EMAIL", "REVISE_STAGING_USER_B_PASSWORD",
  "REVISE_STAGING_DATABASE_URL",
];
export const STAGING_TABLES = ["cards", "review_logs", "questions", "attempts", "mistakes", "papers", "planned_sessions", "exam_dates", "user_settings", "streaks", "lesson_progress", "sync_writes", "learner_records", "sync_tombstones"];
export const CONTINUITY_COLUMNS = {
 learner_records: { id:"uuid", user_id:"uuid", kind:"text", data:"jsonb", lamport:"bigint", device_id:"text", deleted:"boolean", frozen_fingerprint:"text", change_seq:"bigint", updated_at:"timestamp with time zone" },
 sync_tombstones: { id:"uuid", user_id:"uuid", table_name:"text", row_id:"uuid", local_id:"text", change_seq:"bigint", updated_at:"timestamp with time zone" },
};
export const DELETION_TABLES = ["cards","review_logs","questions","attempts","mistakes","papers","planned_sessions","exam_dates"];
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
    const columns = CONTINUITY_COLUMNS[table] ?? (table === "sync_writes" ? { id: "uuid", user_id: "uuid", created_at: "timestamp with time zone" }
      : { id: "uuid", user_id: "uuid", subject_id: "text", topic_id: "text", due: "date", date: "date", data: "jsonb", updated_at: "timestamp with time zone" });
    for (const [column, type] of Object.entries(columns)) {
      if (row.columns?.[column] !== type) errors.push(`${table}: ${column} must be ${type}`);
    }
    if (!row.rls) errors.push(`${table}: RLS disabled`);
    if (CONTINUITY_COLUMNS[table]) {
      const trigger = table === "learner_records" ? "learner_records_order" : "sync_tombstones_order";
      if (!row.triggers?.some(t => t.name === trigger && t.enabled === "O" && t.function === "order_continuity_change" && t.definition.includes("BEFORE INSERT OR UPDATE"))) errors.push(`${table}: continuity ordering trigger missing or inactive`);
      if (!row.indexes?.some(index => index.includes("(user_id, change_seq)"))) errors.push(`${table}: continuity cursor index missing`);
      if (row.canDelete) errors.push(`${table}: authenticated clients can erase terminal history`);
      if (table === "sync_tombstones" && row.canUpdate) errors.push(`${table}: authenticated clients can rewrite deletion markers`);
    }
    const ownerExpression = (value) => typeof value === "string" && /^\(*user_id = auth\.uid\(\)\)*$/.test(value);
    if (table !== "sync_tombstones" && !row.policies?.some((p) => p.name === `${table}_owner` && p.command === "ALL" && p.roles.includes("authenticated") && ownerExpression(p.using) && ownerExpression(p.check))) {
      errors.push(`${table}: required owner policy missing or drifted`);
    }
    if (table === "sync_tombstones") {
      for (const [suffix,command,field] of [["read","SELECT","using"],["insert","INSERT","check"]]) {
        if (!row.policies?.some(p => p.name === `${table}_${suffix}` && p.command === command && p.roles.includes("authenticated") && ownerExpression(p[field]))) errors.push(`${table}: deletion ${suffix} policy missing or drifted`);
      }
    }
    const expectedPolicies = table === "sync_tombstones" ? ["sync_tombstones_read","sync_tombstones_insert"] : [`${table}_owner`];
    if (row.policies?.some((p) => !expectedPolicies.includes(p.name))) errors.push(`${table}: unexpected policy (may widen access)`);
    if (table !== "sync_writes" && !CONTINUITY_COLUMNS[table]) {
      for (const suffix of ["touch", "touch_insert"]) {
        if (!row.triggers?.some((t) => t.name === `${table}_${suffix}` && t.enabled === "O" && t.function === "touch_updated_at" && t.definition.includes(suffix === "touch" ? "BEFORE UPDATE" : "BEFORE INSERT"))) errors.push(`${table}: ${suffix} trigger missing or inactive`);
      }
      if (DELETION_TABLES.includes(table)) {
        for (const [suffix,fn,event] of [["delete_guard","guard_replica_resurrection","BEFORE INSERT OR UPDATE"],["retain_delete","record_replica_deletion","BEFORE DELETE"]]) {
          if (!row.triggers?.some(t => t.name === `${table}_${suffix}` && t.enabled === "O" && t.function === fn && t.definition.includes(event))) errors.push(`${table}: ${suffix} trigger missing or inactive`);
        }
      }
      if (!row.indexes?.some((index) => index.includes("(user_id, updated_at, id)"))) errors.push(`${table}: keyset index missing`);
    }
  }
  return errors;
}

export function validateStagingFunctions(rows) {
  const requirements = {
    order_continuity_change: ["pg_advisory_xact_lock", "new.change_seq := nextval", "old.deleted", "new.frozen_fingerprint <> old.frozen_fingerprint"],
    guard_replica_resurrection: ["pg_advisory_xact_lock", "sync_tombstones", "return null"],
    record_replica_deletion: ["pg_advisory_xact_lock", "sync_tombstones", "on conflict on constraint"],
    delete_replica_row: ["pg_advisory_xact_lock", "auth.uid()", "sync_tombstones", "delete from public.%I"],
  };
  return Object.entries(requirements).flatMap(([name, fragments]) => {
    const row = rows.find(r => r.name === name);
    if (!row) return [`${name}: continuity function missing`];
    const errors = fragments.filter(fragment => !row.definition?.includes(fragment)).map(() => `${name}: continuity function drifted`);
    if (row.securityDefiner) errors.push(`${name}: must exercise authenticated RLS`);
    return errors;
  });
}

// Privacy tables are not sync tables (no keyset index, no touch trigger), so
// they get their own explicit contract rather than being forced through the
// sync-table checks above.
export const PRIVACY_TABLES = ["ai_consent", "ai_rate_quota"];
export const PRIVACY_FUNCTIONS = ["purge_account_server_data", "account_residual_rows", "purge_expired_server_data", "consume_ai_quota"];

/** Pure checks for the consent and quota structures (deployed catalog rows). */
export function validatePrivacyCatalog(catalog) {
  const errors = [];
  const ownerExpression = (value) => typeof value === "string" && /^\(*user_id = auth\.uid\(\)\)*$/.test(value);
  const consent = catalog.find((entry) => entry.table === "ai_consent");
  if (!consent) errors.push("ai_consent: missing table");
  else {
    if (!consent.rls) errors.push("ai_consent: RLS disabled");
    if (consent.primaryKey !== "user_id") errors.push("ai_consent: primary key must be user_id");
    for (const [column, type] of Object.entries({ user_id: "uuid", enabled: "boolean", consent_version: "text", updated_at: "timestamp with time zone" })) {
      if (consent.columns?.[column] !== type) errors.push(`ai_consent: ${column} must be ${type}`);
    }
    if (!consent.policies?.some((p) => p.name === "ai_consent_owner" && p.command === "ALL" && p.roles.includes("authenticated") && ownerExpression(p.using) && ownerExpression(p.check))) {
      errors.push("ai_consent: required owner policy missing or drifted");
    }
    if (consent.policies?.some((p) => p.name !== "ai_consent_owner")) errors.push("ai_consent: unexpected policy (may widen access)");
    if (!consent.triggers?.some((t) => t.name === "ai_consent_order" && t.enabled === "O" && t.function === "ai_consent_order")) errors.push("ai_consent: ordering trigger missing or inactive");
  }
  const quota = catalog.find((entry) => entry.table === "ai_rate_quota");
  if (!quota) errors.push("ai_rate_quota: missing table");
  else {
    if (!quota.rls) errors.push("ai_rate_quota: RLS disabled");
    if (quota.primaryKey !== "key") errors.push("ai_rate_quota: primary key must be key");
    if (quota.columns?.user_id !== "uuid") errors.push("ai_rate_quota: user_id must be uuid (owner foreign key)");
    if (quota.policies?.length) errors.push("ai_rate_quota: client policies present (only SECURITY DEFINER functions may touch it)");
    if (!quota.triggers?.some((t) => t.name === "ai_rate_quota_owner" && t.enabled === "O" && t.function === "ai_rate_quota_owner")) errors.push("ai_rate_quota: owner trigger missing or inactive");
    if (!quota.indexes?.some((index) => index.includes("(user_id)"))) errors.push("ai_rate_quota: owner index missing");
  }
  return errors;
}

/** The privileged privacy functions must exist and be SECURITY DEFINER (they are service-role or JWT-checked). */
export function validatePrivacyFunctions(rows) {
  return PRIVACY_FUNCTIONS.flatMap((name) => {
    const row = rows.find((r) => r.name === name);
    if (!row) return [`${name}: privacy function missing`];
    return row.securityDefiner ? [] : [`${name}: must be SECURITY DEFINER`];
  });
}

export const STAGING_CATALOG_SQL = `
      select c.relname as "table", c.relrowsecurity as rls,
        has_table_privilege('authenticated',c.oid,'DELETE') as "canDelete",
        has_table_privilege('authenticated',c.oid,'UPDATE') as "canUpdate",
        (select string_agg(a.attname, ',' order by k.n)
          from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum,n)
          join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
          where i.indrelid=c.oid and i.indisprimary) as "primaryKey",
        (select jsonb_object_agg(column_name,data_type) from information_schema.columns
          where table_schema='public' and table_name=c.relname) as columns,
        (select jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'roles',roles,'using',qual,'check',with_check))
          from pg_policies where schemaname='public' and tablename=c.relname) as policies,
        (select jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'function',p.proname,'definition',pg_get_triggerdef(t.oid)))
          from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid=c.oid and not t.tgisinternal) as triggers,
        (select jsonb_agg(indexdef) from pg_indexes where schemaname='public' and tablename=c.relname) as indexes
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=any($1::text[])`;
