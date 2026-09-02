import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The sync layer and the Supabase schema must agree: every entity the client
// syncs needs a table with the right primary key, and RLS must cover it. A
// missing table means the outbox retries forever; a missing policy means the
// push silently fails for signed-in users.
describe("sync ↔ schema parity", () => {
  const schema = readFileSync(resolve(__dirname, "../supabase/schema.sql"), "utf8");

  const entityTables: Record<string, string> = {
    cards: "cards",
    reviewLogs: "review_logs",
    attempts: "attempts",
    mistakes: "mistakes",
    questions: "questions",
    papers: "papers",
    plannedSessions: "planned_sessions",
    examDates: "exam_dates",
    settings: "user_settings",
    streak: "streaks",
    lessonProgress: "lesson_progress",
  };

  // Singleton rows (settings, streak, lessonProgress) key on user_id; every
  // other table keys on id.
  const userKeyed = new Set(["user_settings", "streaks", "lesson_progress"]);

  it("every synced entity has a table in the schema", () => {
    const missing = Object.entries(entityTables)
      .filter(([, table]) => !new RegExp(`create table if not exists public\\.${table}\\b`).test(schema))
      .map(([, table]) => table);
    expect(missing, "tables missing from schema.sql").toEqual([]);
  });

  it("singleton tables are primary-keyed on user_id, collections on id", () => {
    for (const table of Object.values(entityTables)) {
      const tableBlock = schema.slice(
        schema.indexOf(`public.${table} (`),
        schema.indexOf(");", schema.indexOf(`public.${table} (`)),
      );
      expect(tableBlock, `${table} primary key`).toMatch(
        userKeyed.has(table) ? /user_id uuid primary key/ : /id uuid primary key/,
      );
    }
  });

  it("RLS is enabled and every table has an owner policy", () => {
    // RLS is applied via a plpgsql loop over the table list; the policy
    // creation is templated the same way. Assert on the loop contents and
    // the templated policy format instead of per-table statements.
    expect(schema).toMatch(/foreach target in array array\[/);
    for (const table of Object.values(entityTables)) {
      expect(schema, `${table} in RLS loop`).toMatch(
        new RegExp(`'${table}'`),
      );
    }
    expect(schema).toMatch(
      /create policy %I on public\.%I for all to authenticated using \(user_id = auth\.uid\(\)\) with check \(user_id = auth\.uid\(\)\)/,
    );
  });

  it("lesson_progress stores its payload in jsonb like the other singletons", () => {
    const block = schema.slice(
      schema.indexOf("public.lesson_progress ("),
      schema.indexOf(");", schema.indexOf("public.lesson_progress (")),
    );
    expect(block).toMatch(/data jsonb not null/);
    expect(block).toMatch(/updated_at timestamptz/);
  });
});
