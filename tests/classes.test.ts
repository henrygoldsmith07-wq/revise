import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildClassHeatmap, classReviewHref, type ClassEvidence } from "@/domain/classes";

const { getSupabase } = vi.hoisted(() => ({ getSupabase: vi.fn() }));
vi.mock("@/data/supabase", () => ({ getSupabase }));
import { createClass, joinClass, leaveClass, listMemberships, loadClass, shareClassEvidence } from "@/data/classes";

const A = "aaaaaaaa-1111-4111-8111-111111111111";
function snapshot(overrides: Partial<ClassEvidence> = {}): ClassEvidence {
  return { attemptId: "11111111-1111-4111-8111-111111111111", studentId: A, questionId: "cnt:question:q1", topicId: "topic:t1", awarded: 1, max: 4,
    misconception: "units", attemptedAt: "2026-10-14T12:00:00Z", ...overrides };
}

describe("real class aggregation", () => {
  it("has no demo evidence or artificial denominator", () => {
    expect(buildClassHeatmap([])).toEqual([]);
    const rows = buildClassHeatmap([
      snapshot(), snapshot(),
      snapshot({ attemptId: "attempt-2", questionId: "cnt:question:q2", awarded: 3 }),
      snapshot({ studentId: "pupil-b", awarded: 0 }),
      snapshot({ attemptId: "attempt-3", misconception: "terminology", awarded: 2 }),
    ]);
    expect(rows).toEqual([
      { tag: "units", label: "Units", occurrences: 3, studentCount: 2, marksLost: 8, questionIds: ["cnt:question:q1", "cnt:question:q2"] },
      { tag: "terminology", label: "Terminology", occurrences: 1, studentCount: 1, marksLost: 2, questionIds: ["cnt:question:q1"] },
    ]);
  });
  it("does not turn invalid marks or free-text tags into analytics", () => {
    expect(buildClassHeatmap([
      snapshot({ awarded: -1 }), snapshot({ awarded: NaN }), snapshot({ awarded: 5 }),
      snapshot({ max: 0 }), snapshot({ max: Infinity }), snapshot({ misconception: "student@example.test" }),
      snapshot({ misconception: undefined }),
    ])).toEqual([]);
  });
  it("uses the canonical review route with encoded content id, not an approval endpoint", () => {
    expect(classReviewHref("cnt:question:a/b")).toBe("/reviewer/review/cnt%3Aquestion%3Aa%2Fb");
  });
});

describe("caller-session class adapter", () => {
  const rpc = vi.fn();
  const getUser = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: A } }, error: null });
    rpc.mockResolvedValue({ data: null, error: null });
    getSupabase.mockReturnValue({ auth: { getUser }, rpc });
  });
  it("fails closed without configuration or a signed-in caller", async () => {
    getSupabase.mockReturnValueOnce(null);
    await expect(createClass("Physics")).rejects.toThrow(/configured/);
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(joinClass("secret", "Pupil-1", "18+", true)).rejects.toThrow(/Sign in/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("creates only via the teacher-gated RPC and maps the response", async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: "c", name: "Physics", join_code: "generated-server-side", user_id: A }], error: null });
    await expect(createClass(" Physics ")).resolves.toEqual({ id: "c", name: "Physics", joinCode: "generated-server-side", teacherId: A });
    expect(rpc).toHaveBeenCalledWith("create_teacher_class", { p_name: "Physics" });
  });
  it("uses only own-memberships RPC rather than exposing class codes or a roster", async () => {
    rpc.mockResolvedValueOnce({ data: [{ class_id: "c", user_id: A, alias: "Pupil-1", age_band: "13-17", status: "pending", consented_at: "now", class_name: "Physics" }], error: null });
    await expect(listMemberships()).resolves.toEqual([{ classId: "c", studentId: A, alias: "Pupil-1", ageBand: "13-17", status: "pending", consentedAt: "now", className: "Physics" }]);
    expect(rpc).toHaveBeenCalledWith("list_my_class_memberships");
  });
  it("treats join denial as a failure even when SQL returns no error", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(joinClass(" BAD ", " Pupil-1 ", "13-17", false)).rejects.toThrow(/Unable to join/);
    expect(rpc).toHaveBeenCalledWith("join_teacher_class", { p_code: "bad", p_alias: "Pupil-1", p_age_band: "13-17", p_consent: false });
  });
  it("never sends raw attempt answers, feedback, or extra properties", async () => {
    await shareClassEvidence("c", [{ ...snapshot(), answers: { p: "PRIVATE ANSWER" }, feedback: "PRIVATE FEEDBACK" } as ClassEvidence]);
    expect(rpc).toHaveBeenCalledWith("share_class_evidence", { p_class_id: "c", p_evidence: [snapshot()] });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("PRIVATE");
  });
  it("does not impersonate another student's evidence", async () => {
    await expect(shareClassEvidence("c", [snapshot({ studentId: "other" })])).rejects.toThrow(/own attempt/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("revoke/leave uses the synchronous server deletion RPC", async () => {
    await leaveClass("c");
    expect(rpc).toHaveBeenCalledWith("leave_teacher_class", { p_class_id: "c" });
  });
  it("loads later evidence pages instead of silently truncating a real heatmap", async () => {
    const ranges: Array<[string, number, number]> = [];
    const from = vi.fn((table: string) => {
      const query = {
        select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => query),
        range: vi.fn(async (start: number, end: number) => {
          ranges.push([table, start, end]);
          const count = table !== "class_evidence" ? 0 : start === 0 ? 500 : 1;
          return { data: Array.from({ length: count }, (_, i) => ({ attempt_id: `attempt-${start + i}`, user_id: A,
            question_id: "cnt:question:q1", topic_id: "topic:t1", awarded: "1", max: "4", misconception: "units", attempted_at: "now" })), error: null };
        }),
      };
      return query;
    });
    getSupabase.mockReturnValue({ auth: { getUser }, rpc, from });
    const result = await loadClass("c");
    expect(result.evidence).toHaveLength(501);
    expect(result.evidence[500]!.attemptId).toBe("attempt-500");
    expect(result.evidence[500]!.awarded).toBe(1);
    expect(ranges).toContainEqual(["class_evidence", 500, 999]);
    expect(buildClassHeatmap(result.evidence)[0]!.occurrences).toBe(501);
  });
  it("does not return class records into a switched account", async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: "c", name: "Physics", join_code: "secret", user_id: A }], error: null });
    getUser.mockResolvedValueOnce({ data: { user: { id: A } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: "different-account" } }, error: null });
    await expect(createClass("Physics")).rejects.toThrow(/Account changed/);
  });
});
