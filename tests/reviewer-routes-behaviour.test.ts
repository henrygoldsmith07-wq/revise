import { beforeEach, describe, expect, it, vi } from "vitest";

// These routes were previously "verified" by searching their source for
// status strings. Exercise the real handler so a deleted gate fails the test.

const mocks = vi.hoisted(() => ({
  status: "not-reviewer" as string,
  contextCalls: 0,
  limited: { ok: true as boolean, retryAfterSeconds: 1 },
  appendCalls: 0,
  chainIssues: [] as string[],
}));

vi.mock("@/lib/reviewer/server", () => ({
  getReviewerContext: async () => {
    mocks.contextCalls++;
    return mocks.status === "ok"
      ? { status: "ok", grant: { userId: "reviewer-1" }, supabase: {} }
      : { status: mocks.status };
  },
  appendRuntimeEvent: async () => { mocks.appendCalls++; return "ok"; },
  loadCombinedLog: async () => ({ log: { events: [] }, issues: mocks.chainIssues }),
  reviewBank: [],
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => mocks.limited,
}));

import { POST } from "@/app/api/reviewer/decisions/route";

const checks = {
  question: true, marking: true, workedSolution: true,
  capabilityMapping: true, specificationMapping: true, examRealism: true,
};
const valid = {
  questionId: "q-1",
  contentFingerprint: "fp-1",
  decision: "revise",
  checks,
  comments: "",
};

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://x/api/reviewer/decisions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://x",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.status = "not-reviewer";
  mocks.contextCalls = 0;
  mocks.limited = { ok: true, retryAfterSeconds: 1 };
  mocks.appendCalls = 0;
  mocks.chainIssues = [];
});

describe("POST /api/reviewer/decisions", () => {
  it("refuses a cross-site request before reading the body", async () => {
    const noOrigin = await POST(request(valid, { origin: "" }));
    expect(noOrigin.status).toBe(403);
    const foreign = await POST(request(valid, { origin: "https://evil.example" }));
    expect(foreign.status).toBe(403);
    expect(mocks.contextCalls).toBe(0);
  });

  it("caps the body and rejects malformed or non-conforming payloads", async () => {
    expect((await POST(request("x".repeat(9_000)))).status).toBe(413);
    expect((await POST(request("{"))).status).toBe(400);
    expect((await POST(request({ ...valid, reviewerId: "attacker" }))).status).toBe(400);
    expect((await POST(request({ ...valid, decision: "approve-all" }))).status).toBe(400);
    expect(mocks.contextCalls).toBe(0);
  });

  it("maps reviewer-context states to 503 / 401 / 403 and never writes", async () => {
    for (const [status, expected] of [["unconfigured", 503], ["signed-out", 401], ["not-reviewer", 403]] as const) {
      mocks.status = status;
      const res = await POST(request(valid));
      expect(res.status, status).toBe(expected);
    }
    expect(mocks.appendCalls).toBe(0);
  });

  it("rate-limits per reviewer with a retry-after header and no write", async () => {
    mocks.status = "ok";
    mocks.limited = { ok: false, retryAfterSeconds: 7 };
    const res = await POST(request(valid));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("7");
    expect(mocks.appendCalls).toBe(0);
  });

  it("refuses to record anything when the audit chain fails verification", async () => {
    mocks.status = "ok";
    mocks.chainIssues = ["hash-mismatch"];
    const res = await POST(request(valid));
    expect(res.status).toBe(500);
    expect(mocks.appendCalls).toBe(0);
  });
});
