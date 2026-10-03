import { describe, expect, it } from "vitest";
import { buildTopicLifecycles, LIFECYCLE_LABEL, topicLifecycle } from "@/domain/proof-lifecycle";
import type { ProofLedger, ProofWindow, TopicProof } from "@/domain/proof-of-improvement";
import type { Attempt, Question } from "@/domain/types";

const NOW = new Date("2026-10-01T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const topic = { id: "t", title: "Capacitors" };
const win = (rate: number): ProofWindow => ({ rate, low: rate - 0.1, high: rate + 0.1, questions: 4, from: day(30), to: day(20) });
const proof = (o: Partial<TopicProof>): TopicProof => ({ topicId: "t", subjectId: "s", share: 0.1, status: "untested", proofDue: false, illusory: false, markPoints: 0, before: null, after: null, ...o } as TopicProof);
const q = (id: string): Question => ({
  id, subjectId: "s", topicIds: ["t"], kind: "short", stem: id, totalMarks: 3, calculatorAllowed: true, difficulty: 3, origin: "seed", createdAt: "2026-01-01T00:00:00.000Z",
  learning: { familyId: id, contextId: id, expectedMinutes: 3 } as Question["learning"], parts: [{ id: `${id}:a`, label: "", prompt: "p", marks: 3, markScheme: ["a"], modelAnswer: "m" }],
}) as Question;
const att = (id: string, question: Question, awarded: number, daysAgo: number, o: Partial<Attempt> = {}): Attempt => ({
  id, userId: "u", questionId: question.id, subjectId: "s", topicIds: ["t"], answers: {}, marked: [], awarded, max: 3, feedback: "", markedBy: "rubric", elapsedMs: 1000, mode: "practice", createdAt: day(daysAgo), ...o,
});
const life = (p: TopicProof | undefined, attempts: Attempt[] = [], questions: Question[] = []) => topicLifecycle({ topic, proof: p, attempts, questions, now: NOW });

describe("proof lifecycle", () => {
  it("is not started with no evidence, and never calls that weak", () => {
    expect(life(undefined).stage).toBe("not-started");
  });
  it("separates weak from merely practising by measured unaided accuracy", () => {
    const qs = ["a", "b", "c"].map(q);
    expect(life(undefined, qs.map((x, i) => att(`w${i}`, x, 0, 3 - i)), qs).stage).toBe("weak");
    expect(life(undefined, [att("p1", qs[0]!, 0, 2)], qs).stage).toBe("practising");
  });
  it("calls strong immediate performance 'looks learned', never proven", () => {
    const qs = ["a", "b", "c"].map(q);
    const r = life(undefined, qs.map((x, i) => att(`s${i}`, x, 3, 3 - i)), qs);
    expect(r.stage).toBe("looks-learned");
    expect(r.claim).toBeNull();
    expect(r.line).toMatch(/not proof yet/);
  });
  it("only the ledger can prove an improvement, and the claim uses coarse figures", () => {
    const r = life(proof({ status: "proven-gain", before: win(0.46), after: win(0.72) }));
    expect(r.stage).toBe("proven");
    expect(r.claim).toBe("Your unseen-question performance in Capacitors improved from about 45% to about 70% after revision.");
  });
  it("makes no claim for a proven status without both windows, or when the gain looks illusory", () => {
    expect(life(proof({ status: "proven-gain" })).claim).toBeNull();
    const illusory = life(proof({ status: "proven-gain", illusory: true, before: win(0.4), after: win(0.8) }));
    expect(illusory.stage).toBe("looks-learned");
    expect(illusory.claim).toBeNull();
    expect(illusory.memorised).toBe(true);
  });
  it("maps declined, held, no change and awaiting proof honestly", () => {
    expect(life(proof({ status: "declined" })).stage).toBe("slipped");
    expect(life(proof({ status: "held" })).stage).toBe("holding");
    expect(life(proof({ status: "no-clear-change" })).stage).toBe("no-clear-improvement");
    const waiting = life(proof({ status: "awaiting-proof", proofDue: true }));
    expect(waiting).toMatchObject({ stage: "awaiting-proof", dueNow: true });
    expect(life(proof({ status: "awaiting-proof" })).dueNow).toBe(false);
  });
  it("shows old strong evidence as fading rather than slipped", () => {
    const qs = ["a", "b", "c"].map(q);
    expect(life(undefined, qs.map((x, i) => att(`o${i}`, x, 3, 100 - i)), qs).stage).toBe("fading");
  });
  it("hinted answers never lift a topic out of practising", () => {
    const qs = ["a", "b", "c"].map(q);
    const r = life(undefined, qs.map((x, i) => att(`h${i}`, x, 3, 3 - i, { hintTier: "cue" })), qs);
    expect(["practising", "weak"]).toContain(r.stage);
  });
  it("has a label for every stage and builds many topics against one ledger", () => {
    expect(Object.values(LIFECYCLE_LABEL).every(Boolean)).toBe(true);
    const ledger = { topics: [proof({ topicId: "a", status: "declined" }), proof({ topicId: "b", status: "held" })] } as ProofLedger;
    const rows = buildTopicLifecycles({ topics: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }], ledger, attempts: [], questions: [], now: NOW });
    expect(rows.map((row) => row.stage)).toEqual(["slipped", "holding", "not-started"]);
  });
});
