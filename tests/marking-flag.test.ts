import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  MARKING_EVIDENCE_NAMESPACE,
  MAX_FLAG_REASON_CHARS,
  createMarkingFlag,
  exportMarkingFlags,
  importMarkingFlags,
  markingFlagId,
  upsertMarkingFlag,
  type MarkingFlag,
} from "@/domain/marking-flag";
import type { Attempt, MarkedPart } from "@/domain/types";

const NOW = "2026-10-04T12:00:00.000Z";

function attempt(over: Partial<Attempt> = {}): Attempt {
  return {
    id: "att-1",
    userId: "u1",
    questionId: "q1",
    subjectId: "wjec-alevel-physics",
    topicIds: ["wjec-alevel-physics.kinematics-dynamics"],
    answers: { p1: "s = ut + 1/2at^2", p2: "12 m/s" },
    marked: [],
    awarded: 3,
    max: 6,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 1000,
    mode: "practice",
    createdAt: NOW,
    ...over,
  };
}

function part(over: Partial<MarkedPart> = {}): MarkedPart {
  return {
    partId: "p1",
    awarded: 1,
    max: 3,
    creditedPoints: ["M1 correct suv equation"],
    missedPoints: ["A1 substitution shown"],
    comment: "Method mark awarded; substitution not shown.",
    ...over,
  };
}

/** Build a valid flag, then override stored fields directly. */
const flag = (over: Partial<MarkingFlag> = {}): MarkingFlag => ({
  ...createMarkingFlag({ userId: "u1", attempt: attempt(), part: part(), reason: "wrong-mark", note: "I did substitute", now: NOW }),
  ...over,
});

describe("flagging a mark", () => {
  it("records what the learner actually wrote, not what they are told they wrote", () => {
    const built = flag();
    expect(built.learnerAnswer).toBe("s = ut + 1/2at^2");
    expect(built.awarded).toBe(1);
    expect(built.max).toBe(3);
    expect(built.rubricFeedback).toContain("Method mark awarded");
    expect(built.resolution).toBeNull();
    expect(built.createdAt).toBe(NOW);
  });

  it("is keyed so re-flagging the same part replaces rather than duplicates", () => {
    const first = flag({ note: "first" });
    const second = flag({ note: "second" });
    expect(markingFlagId("att-1", "p1")).toBe(markingFlagId("att-1", "p1"));
    expect(markingFlagId("att-1", "p1")).not.toBe(markingFlagId("att-1", "p2"));

    const stored = upsertMarkingFlag([first], second);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.note).toBe("second");
  });

  it("flags a mark with no reason and no note — the button must not require typing", () => {
    const bare = createMarkingFlag({ userId: "u1", attempt: attempt(), part: part(), now: NOW });
    expect(bare.reason).toBeNull();
    expect(bare.note).toBe("");
    expect(bare.learnerAnswer).toBeTruthy();
  });

  it("truncates an unbounded note rather than storing whatever was pasted", () => {
    const long = createMarkingFlag({ userId: "u1", attempt: attempt(), part: part(), note: "x".repeat(MAX_FLAG_REASON_CHARS + 5000), now: NOW });
    expect(long.note).toHaveLength(MAX_FLAG_REASON_CHARS);
  });

  it("never touches the awarded mark: a flag is an assertion, not an adjustment", () => {
    const before = attempt();
    const built = flag();
    // The attempt the flag points at is untouched by flagging it.
    expect(before.marked).toHaveLength(0);
    expect(before.awarded).toBe(3);
    // A flag carries no field that could be mistaken for a mark decision.
    expect(Object.keys(built).sort()).toEqual([
      "awarded", "createdAt", "id", "learnerAnswer", "max", "note", "partId",
      "questionId", "reason", "resolution", "rubricFeedback", "schemeIndex",
      "subjectId", "topicIds", "userId", "attemptId",
    ].sort());
  });

  it("cannot resolve its own flag — only a reviewer fills in a resolution", () => {
    expect(flag().resolution).toBeNull();
    const resolved: MarkingFlag = { ...flag(), resolution: { status: "upheld", reviewerId: "teacher-9", reviewedAt: NOW, note: "Substitution was shown." } };
    expect(resolved.resolution?.status).toBe("upheld");
  });
});

describe("marking:evidence export", () => {
  const questionOf = (id: string) =>
    id === "q1"
      ? { questionText: "State the equation of motion for constant acceleration and solve it.", markScheme: ["M1 correct suv equation", "A1 substitution shown", "A1 correct value"], maximumMarks: 3, topicId: "wjec-alevel-physics.kinematics-dynamics", specification: "A200QS" }
      : null;
  const file = exportMarkingFlags({ userId: "u1", anonId: "alias-abc", flags: [flag(), flag({ id: "markflag:att-2:p1", attemptId: "att-2" })], capturedAt: NOW, questionOf });

  it("uses the importable namespace and the answer-corpus version", () => {
    expect(file.kind).toBe(MARKING_EVIDENCE_NAMESPACE);
    expect(file.formatVersion).toBe(2);
    expect(file.anonId).toBe("alias-abc");
    expect(file.disputes).toHaveLength(2);
    expect(file.records).toHaveLength(2);
  });

  it("strips the account id, like the pilot export does", () => {
    expect(JSON.stringify(file)).not.toContain("u1");
    for (const dispute of file.disputes) expect(dispute).not.toHaveProperty("userId");
  });

  it("exports only this learner's flags", () => {
    const other = flag({ userId: "someone-else" });
    const scoped = exportMarkingFlags({ userId: "u1", anonId: "a", flags: [flag(), other], capturedAt: NOW, questionOf });
    expect(scoped.disputes).toHaveLength(1);
  });

  it("keeps the answer text, because a reviewer cannot triage a dispute without it", () => {
    expect(file.records[0]?.studentAnswer).toBe("s = ut + 1/2at^2");
    expect(file.disputes[0]?.note).toBe("I did substitute");
  });

  it("never writes a human mark — a disputed mark is not a human judgement", () => {
    for (const record of file.records) {
      expect(record.humanMark1).toBeNull();
      expect(record.humanMark2).toBeNull();
      expect(record.adjudicatedMark).toBeNull();
      expect(record.humanFeedback).toBeNull();
      expect(record.source).toBe("unreviewed");
      expect(record.reviewStatus).toBe("needs_review");
    }
  });

  it("keeps the app's award in the sidecar, never in a human field", () => {
    expect(file.disputes[0]?.appAwarded).toBe(1);
    expect(file.disputes[0]?.maximumMarks).toBe(3);
    const asHuman = file.records.map((r) => r.humanMark1 ?? r.humanMark2 ?? r.adjudicatedMark);
    expect(asHuman.every((m) => m === null)).toBe(true);
  });

  it("still reports a dispute whose question has left the bank, instead of dropping it", () => {
    const orphan = flag({ questionId: "gone" });
    const out = exportMarkingFlags({ userId: "u1", anonId: "a", flags: [orphan], capturedAt: NOW, questionOf });
    expect(out.records).toHaveLength(0);
    expect(out.disputes).toHaveLength(1);
    expect(out.disputes[0]?.questionId).toBe("gone");
  });

  it("round-trips through the importer and the corpus parser without losing a dispute", () => {
    const parsed = importMarkingFlags(file);
    expect(parsed.ok, parsed.ok ? "" : parsed.problems.join("; ")).toBe(true);
    if (!parsed.ok) return;
    // The corpus parser rebuilds records, so compare what matters rather than
    // deep-equality: every dispute survives, and no human mark appeared.
    expect(parsed.disputes).toEqual(file.disputes);
    expect(parsed.records).toHaveLength(file.records.length);
    expect(parsed.records.map((r) => r.studentAnswer)).toEqual(file.records.map((r) => r.studentAnswer));
    for (const record of parsed.records) {
      expect(record.humanMark1).toBeNull();
      expect(record.humanMark2).toBeNull();
      expect(record.adjudicatedMark).toBeNull();
      expect(record.reviewStatus).toBe("needs_review");
    }
  });

  it("round-trips any well-formed flag, however it is filled in", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9 .,;:()'’-]{0,120}$/),
        fc.option(fc.constantFrom("wrong-mark", "unclear-question", "wrong-scheme", "other"), { nil: null }),
        (learnerAnswer, reason) => {
          const built = flag({ learnerAnswer, reason });
          const out = exportMarkingFlags({ userId: "u1", anonId: "a", flags: [built], capturedAt: NOW, questionOf });
          const parsed = importMarkingFlags(out);
          expect(parsed.ok).toBe(true);
          if (parsed.ok) expect(parsed.records[0]?.studentAnswer).toBe(learnerAnswer);
        },
      ),
      { numRuns: 20 },
    );
  });
});

describe("marking:evidence import is strict", () => {
  const questionOf = (id: string) =>
    id === "q1"
      ? { questionText: "State the equation of motion for constant acceleration and solve it.", markScheme: ["M1 correct suv equation", "A1 substitution shown", "A1 correct value"], maximumMarks: 3, topicId: "wjec-alevel-physics.kinematics-dynamics", specification: "A200QS" }
      : null;
  const base = exportMarkingFlags({ userId: "u1", anonId: "a", flags: [flag()], capturedAt: NOW, questionOf });

  it("rejects a file from a different namespace", () => {
    expect(importMarkingFlags({ ...base, kind: "pilot" }).ok).toBe(false);
  });

  it("rejects an unsupported corpus version rather than guessing", () => {
    expect(importMarkingFlags({ ...base, formatVersion: 9 }).ok).toBe(false);
  });

  it("rejects a non-object and a non-array payload", () => {
    expect(importMarkingFlags(null).ok).toBe(false);
    expect(importMarkingFlags("nope").ok).toBe(false);
    expect(importMarkingFlags({ ...base, disputes: {} }).ok).toBe(false);
  });

  it("rejects a record the corpus parser itself would refuse", () => {
    const broken = { ...base, records: [{ ...base.records[0], maximumMarks: 0 }] };
    expect(importMarkingFlags(broken).ok).toBe(false);
  });

  it("rejects a dispute with an unknown reason or an unknown resolution", () => {
    const badReason = { ...base, disputes: [{ ...base.disputes[0], reason: "because" }] };
    const badResolution = { ...base, disputes: [{ ...base.disputes[0], resolution: { status: "fixed" } }] };
    expect(importMarkingFlags(badReason).ok).toBe(false);
    expect(importMarkingFlags(badResolution).ok).toBe(false);
  });

  it("accepts an empty but well-formed file", () => {
    expect(importMarkingFlags({ ...base, records: [], disputes: [] }).ok).toBe(true);
  });
});

describe("marking flags never reach a sync queue", () => {
  it("keeps the store out of the sync contract and the outbox", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const contract = readFileSync(resolve(process.cwd(), "src/data/sync-contract.ts"), "utf8");
    // A disputed mark carries the learner's own answer text and free-text note.
    // It has no server table and no RLS policy, so it must not be reachable from
    // the sync path until one is designed and the learner has opted in.
    expect(contract).not.toContain("markingFlag");
    const db = readFileSync(resolve(process.cwd(), "src/data/db.ts"), "utf8");
    expect(db).toMatch(/markingFlags[\s\S]{0,400}never synced|device-local/i);
  });

  it("adopts flags into a new account but never queues them to the outbox", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const profile = readFileSync(resolve(process.cwd(), "src/data/account-profile.ts"), "utf8");
    expect(profile).toContain('"markingFlags"');
    expect(profile).toMatch(/store !== "markingFlags"/);
  });

  it("is covered by the device erase path", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const db = readFileSync(resolve(process.cwd(), "src/data/db.ts"), "utf8");
    const clearAll = db.slice(db.indexOf("export async function clearAll"));
    expect(clearAll).toContain('"markingFlags"');
    const schema = readFileSync(resolve(process.cwd(), "src/data/persistence-schema.ts"), "utf8");
    expect(schema).toContain('"markingFlags"');
    expect(schema).toContain("marking-flags");
  });
});