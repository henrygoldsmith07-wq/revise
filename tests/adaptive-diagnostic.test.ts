import { describe, expect, it } from "vitest";
import {
  DIAGNOSTIC_MAX_MINUTES, diagnosticFinished, diagnosticReport, diagnosticStartBlocker, fallbackDepths, inferCause, nextProbe, topicStates,
  type DiagnosticItem, type ProbeRecord,
} from "@/domain/adaptive-diagnostic";

const item = (id: string, topicId: string, depth: DiagnosticItem["depth"], extra: Partial<DiagnosticItem> = {}): DiagnosticItem =>
  ({ id, topicId, depth, marks: 2, expectedSeconds: 90, trusted: true, ...extra });
const topics = ["A", "B"];
const items = [
  item("a-r1", "A", "recall"), item("a-r2", "A", "recall"), item("a-p1", "A", "application", { prerequisiteTopicId: "P" }), item("a-h1", "A", "hard-application"),
  item("b-r1", "B", "recall"), item("b-p1", "B", "application"), item("p-r1", "P", "recall"),
];
const rec = (itemId: string, topicId: string, depth: ProbeRecord["depth"], correct: boolean, confident = true, extra: Partial<ProbeRecord> = {}): ProbeRecord =>
  ({ itemId, topicId, depth, correct, confident, seconds: 90, ...extra });
const pick = (records: ProbeRecord[], extra: object = {}) => nextProbe({ topicIds: topics, items, records, ...extra })?.item.id;

describe("adaptive diagnostic", () => {
  it("starts broad: one recall probe per topic before going deeper", () => {
    const first = pick([])!;
    expect(first).toMatch(/-r1$/);
    const second = pick([rec("a-r1", "A", "recall", true)])!;
    expect(second).toBe("b-r1");
  });
  it("goes harder after a confident correct answer, once topics are opened", () => {
    expect(pick([rec("a-r1", "A", "recall", true), rec("b-r1", "B", "recall", true)])).toMatch(/-p1$/);
  });
  it("verifies a correct-but-unsure answer with a different item at the same depth", () => {
    const next = pick([rec("a-r1", "A", "recall", true, false), rec("b-r1", "B", "recall", true)]);
    expect(next).toBe("a-r2");
  });
  it("identifies recall vs application vs technique causes", () => {
    expect(inferCause([rec("x", "A", "recall", false)])).toBe("recall");
    expect(inferCause([rec("x", "A", "recall", true), rec("y", "A", "application", false)])).toBe("application");
    expect(inferCause([rec("y", "A", "application", false, true, { techniqueMiss: true })])).toBe("technique");
    expect(inferCause([rec("x", "A", "recall", true)])).toBe("none");
  });
  it("opens a prerequisite probe after an application miss with known recall", () => {
    const next = pick([rec("a-r1", "A", "recall", true), rec("a-p1", "A", "application", false), rec("b-r1", "B", "recall", true)], { });
    expect(["p-r1", "b-p1"]).toContain(next);
  });
  it("stops testing a branch after repeated weakness", () => {
    const records = [rec("a-r1", "A", "recall", false), rec("a-r2", "A", "recall", false)];
    expect(topicStates(records, ["A"])[0]!.settled).toBe(true);
    expect(pick(records)).toMatch(/^b-/);
  });
  it("never uses untrusted, already-seen or same-family items", () => {
    const pool = [item("u", "A", "recall", { trusted: false }), item("s", "A", "recall"), item("f2", "A", "application", { familyId: "F" }), item("f1", "A", "recall", { familyId: "F" })];
    const ids = new Set<string>();
    let records: ProbeRecord[] = [];
    for (let i = 0; i < 6; i++) {
      const n = nextProbe({ topicIds: ["A"], items: pool, records, seenItemIds: new Set(["s"]) });
      if (!n) break;
      ids.add(n.item.id);
      records = [...records, rec(n.item.id, "A", n.item.depth, true)];
    }
    expect(ids.has("u")).toBe(false);
    expect(ids.has("s")).toBe(false);
    expect(ids.has("f1") && ids.has("f2")).toBe(false);
  });
  it("stops at the time limit and skips known topics", () => {
    const slow = Array.from({ length: 20 }, (_, i) => rec(`z${i}`, "A", "recall", true, true, { seconds: 90 }));
    expect(diagnosticFinished({ topicIds: topics, items, records: slow })).toBe(true);
    expect(DIAGNOSTIC_MAX_MINUTES).toBe(25);
    expect(pick([], { knownTopicIds: new Set(["A"]) })).toMatch(/^b-/);
  });
  it("returns nothing when there are no trusted items at all", () => {
    expect(nextProbe({ topicIds: topics, items: items.map((i) => ({ ...i, trusted: false })), records: [] })).toBeNull();
  });
  it("reports unknowns honestly, ignores hinted answers and flags calibration", () => {
    const records = [rec("a-r1", "A", "recall", true), rec("a-p1", "A", "application", true), rec("b-r1", "B", "recall", false, true), rec("b-p1", "B", "application", false, false), rec("p-r1", "P", "recall", true, true, { hinted: true })];
    const report = diagnosticReport(records, ["A", "B", "C"], items);
    expect(report.unknown).toEqual(["C"]);
    expect(report.strong).toEqual(["A"]);
    expect(report.weak.map((w) => w.topicId)).toEqual(["B"]);
    expect(report.calibration.overconfident).toBe(1);
    expect(report.established.join(" ")).toMatch(/not a grade prediction/);
    expect(diagnosticReport([], ["A"]).established[0]).toMatch(/nothing can be said/);
  });
});

describe("adaptive diagnostic without reviewed recall questions", () => {
  // Real case: early on, every teacher-reviewed question in a subject can be
  // application-level or harder. The diagnostic used to open a topic only with
  // a recall question, so it finished before asking anything.
  const noRecall = [
    item("a-p1", "A", "application"), item("a-p2", "A", "application", { expectedSeconds: 120 }),
    item("a-h1", "A", "hard-application", { expectedSeconds: 60 }),
    item("b-h1", "B", "hard-application"), item("b-h2", "B", "hard-application"),
  ];
  const next = (records: ProbeRecord[], extra: object = {}) => nextProbe({ topicIds: topics, items: noRecall, records, ...extra });

  it("opens each topic with its least demanding reviewed question", () => {
    const first = next([])!;
    expect(first.item.id).toBe("a-p1"); // lowest demand wins over a shorter, harder item
    expect(first.reason).toMatch(/No reviewed recall question here yet/);
    const second = next([rec("a-p1", "A", "application", true, true)])!;
    expect(second.item.id).toBe("b-h1"); // then the other topic is opened
  });

  it("checks a miss with the least demanding reviewed question, recorded at its real depth", () => {
    const records = [rec("a-p1", "A", "application", false), rec("b-h1", "B", "hard-application", true)];
    const probe = next(records)!;
    expect(probe.item.id).toBe("a-p2");
    expect(probe.reason).not.toMatch(/Recall is fine/);
    // Two clean misses settle the topic; nothing claims recall was tested.
    const settled = topicStates([...records, rec("a-p2", "A", "application", false)], topics).find((s) => s.topicId === "A")!;
    expect(settled.settled).toBe(true);
    expect(settled.probes.every((p) => p.depth !== "recall")).toBe(true);
  });

  it("never falls back to an easier question after a correct answer", () => {
    const records = [rec("a-p1", "A", "application", true), rec("b-h1", "B", "hard-application", true, false)];
    const ids: string[] = [];
    let r = records;
    for (let i = 0; i < 6; i++) {
      const p = next(r);
      if (!p) break;
      ids.push(p.item.id);
      r = [...r, rec(p.item.id, p.item.topicId, p.item.depth, true, true)];
    }
    expect(ids).toContain("a-h1");
    expect(ids).toContain("b-h2");
  });

  it("never uses an untrusted item as a fallback", () => {
    const only = [item("a-r", "A", "recall", { trusted: false }), item("a-p", "A", "application", { trusted: false })];
    expect(nextProbe({ topicIds: ["A"], items: only, records: [] })).toBeNull();
    expect(diagnosticStartBlocker({ topicIds: ["A"], items: only, records: [] })).toBe("no-reviewed");
  });

  it("fallback order: recall widens upwards; harder wants step down no lower than the floor", () => {
    expect(fallbackDepths("recall")).toEqual(["recall", "application", "hard-application"]);
    expect(fallbackDepths("hard-application")).toEqual(["hard-application", "application", "recall"]);
    expect(fallbackDepths("hard-application", "application")).toEqual(["hard-application", "application"]);
  });

  it("explains why it cannot start instead of reporting nothing", () => {
    const input = { topicIds: topics, items: noRecall, records: [] as ProbeRecord[] };
    expect(diagnosticStartBlocker(input)).toBeNull();
    expect(diagnosticStartBlocker({ ...input, seenItemIds: new Set(noRecall.map((i) => i.id)) })).toBe("all-seen");
    expect(diagnosticStartBlocker({ ...input, knownTopicIds: new Set(topics) })).toBe("all-known");
    expect(diagnosticStartBlocker({ ...input, records: [rec("a-p1", "A", "application", true)] })).toBeNull();
  });
});
