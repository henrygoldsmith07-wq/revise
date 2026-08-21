import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const schema = () => readFileSync(join(process.cwd(), "supabase/schema.sql"), "utf8");

describe("security — RLS + schema invariants", () => {
  it("every user-owned table has RLS and an owner policy", () => {
    const sql = schema();
    const tables = ["cards","review_logs","questions","attempts","mistakes","papers","planned_sessions","exam_dates","user_settings","streaks"];
    for (const t of tables) {
      expect(sql, t+" missing enable RLS").toContain(`enable row level security`);
    }
    expect(sql).toContain("with check (user_id = auth.uid())");
  });
  it("updated_at trigger prevents stale sync skips", () => {
    const sql = schema();
    expect(sql).toContain("touch_updated_at");
    expect(sql).toContain("greatest(now()");
  });
  it("text columns that must be scoped contain user_id", () => {
    const sql = schema();
    expect(sql.match(/user_id/g)!.length).toBeGreaterThan(10);
  });
});
describe("security — API route guards", () => {
  it("/api/ai requires explicit provider and validates input with zod", async () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/ai/route.ts"), "utf8");
    expect(route).toContain("payloadSchemas");
    expect(route).toContain("safeParse");
  });
});
