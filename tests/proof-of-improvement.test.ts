import { describe, expect, it } from "vitest";
import { buildProofLedger, CONVERSION_PRIOR, MIN_PROOF_DELAY_DAYS, proofLine, shortDate } from "@/domain/proof-of-improvement";
import { physicsContentFingerprint } from "@/domain/content-trust";
import type { Attempt, HumanVerificationRecord, Question, ReviewLog, SpecPoint, Topic } from "@/domain/types";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const day = (n: number) => new Date(Date.UTC(2026, 8, n, 9)).toISOString();

// Proof is a claim about *reviewed* material, so the fixtures model a
// flagship subject whose questions have passed the human review
// contract. Non-flagship subjects deliberately cannot produce proof —
// that distinction is what buildProofLedger now enforces.
const FLAGSHIP = "wjec-alevel-physics";

const spec = (id: string): SpecPoint => ({ id, ref: id, text: id, aos: ["AO1"] });
const topic = (id: string, statements = 3, subjectId = FLAGSHIP): Topic => ({
  id, subjectId, unitId: "u", title: id, order: 1, intrinsicDifficulty: 3, summary: "", keyPoints: [], commonErrors: [],
  specPoints: Array.from({ length: statements }, (_, i) => spec(`${id}.${i}`)),
});

const reviewRecord = (question: Question): HumanVerificationRecord => ({
  status: "approved",
  reviewerId: "test-reviewer",
  reviewerRole: "teacher",
  reviewerQualification: "Test fixture only",
  reviewedAt: "2026-09-26T18:00:00.000Z",
  contentFingerprint: physicsContentFingerprint(question),
  checks: {
    question: true,
    marking: true,
    workedSolution: true,
    capabilityMapping: true,
    specificationMapping: true,
    examRealism: true,
  },
});

const question = (id: string, topicId: string, subjectId = FLAGSHIP): Question => {
  const base: Question = {
    id, subjectId, topicIds: [topicId], kind: "short", stem: id,
    parts: [{ id: `${id}.a`, label: "", prompt: "p", marks: 4, markScheme: ["x"], modelAnswer: "x" }],
    totalMarks: 4, calculatorAllowed: true, difficulty: 3, origin: "seed", createdAt: day(1),
  };
  // A reviewed flagship question: verified plus a full attestation
  // whose fingerprint matches the content exactly.
  return { ...base, verification: "verified", humanVerification: reviewRecord(base) };
};

let n = 0;
function attempt(questionId: string, topicId: string, awarded: number, at: string, overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: `a${n++}`, userId: "u", questionId, subjectId: FLAGSHIP, topicIds: [topicId], answers: {}, marked: [], awarded, max: 4,
    feedback: "", markedBy: "rubric", elapsedMs: 1, mode: "practice", createdAt: at, ...overrides,
  };
}

const t1 = topic("t1");
const bank = Array.from({ length: 12 }, (_, i) => question(`q${i}`, "t1"));
const ledger = (attempts: Attempt[], reviewLogs: ReviewLog[] = [], topics = [t1], now = NOW) =>
  buildProofLedger({ topics, attempts, questions: bank, reviewLogs, now });
const only = (attempts: Attempt[], reviewLogs: ReviewLog[] = []) => ledger(attempts, reviewLogs).topics[0]!;

describe("proof of improvement", () => {
  it("has nothing to say about a topic that has not been tested", () => {
    const row = only([]);
    expect(row.status).toBe("untested");
    expect(row.gain).toBeNull();
    expect(row.markPoints).toBe(0);
    expect(ledger([]).headline).toMatch(/nothing proven yet/i);
  });

  it("waits for a delay and says when proof can start", () => {
    const row = only([attempt("q0", "t1", 1, day(1)), attempt("q1", "t1", 1, day(1))]);
    expect(row.status).toBe("awaiting-proof");
    expect(row.before?.questions).toBe(2);
    expect(row.provableFrom).toBe("2026-09-04");
    expect(row.proofDue).toBe(true);
    const due = ledger([attempt("q0", "t1", 1, day(1)), attempt("q1", "t1", 1, day(1))]);
    expect(due.due).toBe(1);
    expect(due.headline).toMatch(/1 topic is ready to be proven on new questions/);
    const waiting = ledger([attempt("q0", "t1", 1, day(29)), attempt("q1", "t1", 1, day(29))]);
    expect(waiting.topics[0]?.proofDue).toBe(false);
    expect(waiting.due).toBe(0);
    expect(waiting.headline).toMatch(/waiting for new questions/);
  });

  it("proves a gain only on different questions answered unaided after the delay", () => {
    const row = only([
      attempt("q0", "t1", 1, day(1)), attempt("q1", "t1", 0, day(1)), attempt("q2", "t1", 1, day(2)),
      attempt("q3", "t1", 4, day(20)), attempt("q4", "t1", 4, day(21)), attempt("q5", "t1", 3, day(22)),
    ]);
    expect(row.status).toBe("proven-gain");
    expect(row.before?.rate).toBeLessThan(0.3);
    expect(row.after?.rate).toBeGreaterThan(0.85);
    expect(row.gain).toBeGreaterThan(0.5);
    expect(row.delayDays).toBeGreaterThanOrEqual(MIN_PROOF_DELAY_DAYS);
    // 3 statements of 3 in a one-topic subject: the topic is the whole exam.
    expect(row.markPoints).toBeCloseTo(row.gain! * 100, 1);
  });

  it("does not count the same questions again as proof", () => {
    const row = only([
      attempt("q0", "t1", 1, day(1)), attempt("q1", "t1", 0, day(1)), attempt("q2", "t1", 1, day(2)),
      attempt("q0", "t1", 4, day(20)), attempt("q1", "t1", 4, day(21)), attempt("q2", "t1", 4, day(22)),
    ]);
    expect(row.status).toBe("awaiting-proof");
    expect(row.after).toBeNull();
    expect(row.familiarRate).toBeCloseTo(1, 5);
  });

  it("does not count hinted answers, copied answers or recall practice as proof", () => {
    const base = [attempt("q0", "t1", 1, day(1)), attempt("q1", "t1", 0, day(1)), attempt("q2", "t1", 1, day(2))];
    for (const extra of [{ hintTier: "scaffold" as const }, { copiedAnswer: true }, { repairTeachingSeen: true }, { mode: "recall" as const }]) {
      const row = only([...base, attempt("q3", "t1", 4, day(20), extra), attempt("q4", "t1", 4, day(21), extra)]);
      expect(row.status).toBe("awaiting-proof");
    }
  });

  it("requires the delay from the last study, not just from the baseline", () => {
    const attempts = [
      attempt("q0", "t1", 1, day(1)), attempt("q1", "t1", 0, day(1)), attempt("q2", "t1", 1, day(2)),
      attempt("q3", "t1", 4, day(20)), attempt("q4", "t1", 4, day(20)),
    ];
    const crammed: ReviewLog[] = [{ id: "r", cardId: "c", topicId: "t1", reviewedAt: day(19), grade: "good" } as unknown as ReviewLog];
    expect(only(attempts).status).toBe("proven-gain");
    expect(only(attempts, crammed).status).toBe("awaiting-proof");
  });

  it("will not call two lucky answers a proven gain", () => {
    const row = only([
      attempt("q0", "t1", 2, day(1)), attempt("q1", "t1", 2, day(1)), attempt("q2", "t1", 2, day(2)),
      attempt("q3", "t1", 3, day(20)), attempt("q4", "t1", 3, day(21)),
    ]);
    expect(row.status).toBe("no-clear-change");
  });

  it("reports a decline, and a topic that was strong and stayed strong as held", () => {
    const slipped = only([
      attempt("q0", "t1", 4, day(1)), attempt("q1", "t1", 4, day(1)), attempt("q2", "t1", 4, day(2)),
      attempt("q3", "t1", 0, day(20)), attempt("q4", "t1", 0, day(21)), attempt("q5", "t1", 0, day(22)),
    ]);
    expect(slipped.status).toBe("declined");
    expect(slipped.markPoints).toBeLessThan(0);
    const held = only([
      attempt("q0", "t1", 4, day(1)), attempt("q1", "t1", 4, day(1)), attempt("q2", "t1", 3, day(2)),
      attempt("q3", "t1", 4, day(20)), attempt("q4", "t1", 3, day(21)),
    ]);
    expect(held.status).toBe("held");
    expect(held.markPoints).toBe(0);
  });

  it("flags a topic that looks learned on familiar questions but fails on new ones", () => {
    const row = only([
      attempt("q0", "t1", 4, day(1)), attempt("q0", "t1", 4, day(2)), attempt("q0", "t1", 4, day(3)),
      attempt("q1", "t1", 1, day(10)), attempt("q2", "t1", 1, day(11)),
    ]);
    expect(row.illusory).toBe(true);
    expect(row.familiarRate).toBeGreaterThanOrEqual(0.8);
    expect(row.unseenRate).toBeLessThanOrEqual(0.55);
    expect(ledger([attempt("q0", "t1", 4, day(1)), attempt("q1", "t1", 4, day(2))]).illusory).toBe(0);
  });

  it("weights proven marks by how much of the exam each topic carries, across subjects", () => {
    const maths = "wjec-alevel-maths";
    const big = topic("big", 6, FLAGSHIP);
    const small = topic("small", 2, FLAGSHIP);
    const other = topic("other", 5, maths);
    const q = (topicId: string, subjectId = FLAGSHIP) => Array.from({ length: 6 }, (_, i) => question(`${topicId}${i}`, topicId, subjectId));
    const run = (topicId: string, subjectId: string) => [
      attempt(`${topicId}0`, topicId, 1, day(1), { subjectId }), attempt(`${topicId}1`, topicId, 0, day(1), { subjectId }), attempt(`${topicId}2`, topicId, 1, day(2), { subjectId }),
      attempt(`${topicId}3`, topicId, 4, day(20), { subjectId }), attempt(`${topicId}4`, topicId, 4, day(21), { subjectId }), attempt(`${topicId}5`, topicId, 4, day(22), { subjectId }),
    ];
    const result = buildProofLedger({
      topics: [big, small, other], questions: [...q("big"), ...q("small"), ...q("other", maths)], now: NOW,
      attempts: [...run("big", FLAGSHIP), ...run("small", FLAGSHIP), ...run("other", maths)],
    });
    const points = (id: string) => result.topics.find((row) => row.topicId === id)!.markPoints;
    expect(points("big")).toBeGreaterThan(points("small") * 2);
    expect(result.bySubject[FLAGSHIP]!.proven).toBe(2);
    expect(result.bySubject[maths]!.proven).toBe(1);
    expect(result.proven).toBe(3);
    expect(result.provenMarks).toBeGreaterThan(0);
    expect(result.headline).toMatch(/Proven on new questions/);
  });

  it("learns how much headroom this student actually closes, starting from the prior", () => {
    expect(ledger([]).conversion).toEqual({ rate: CONVERSION_PRIOR, pairs: 0, observed: false });
    const closed = ledger([
      attempt("q0", "t1", 1, day(1)), attempt("q1", "t1", 1, day(1)), attempt("q2", "t1", 1, day(2)),
      attempt("q3", "t1", 4, day(20)), attempt("q4", "t1", 4, day(21)),
    ]);
    expect(closed.conversion.observed).toBe(true);
    expect(closed.conversion.pairs).toBe(1);
    expect(closed.conversion.rate).toBeGreaterThan(CONVERSION_PRIOR);
  });

  it("ignores provisional marks", () => {
    const row = only([
      attempt("q0", "t1", 1, day(1)), attempt("q1", "t1", 1, day(1)), attempt("q2", "t1", 1, day(2)),
      attempt("q3", "t1", 4, day(20), { markedBy: "self" }), attempt("q4", "t1", 4, day(21), { markedBy: "self" }),
    ]);
    expect(row.status).toBe("awaiting-proof");
  });

  it("never proves a gain on reference-tier material, however well it is answered", () => {
    // Reference-tier subjects are labelled "not spec-checked" everywhere
    // else in the app. An unreviewed answer there must not become a
    // learner-visible "Proven", no matter how strong the pattern is.
    const refTopic = topic("rt", 3, "aqa-alevel-biology");
    const refBank = Array.from({ length: 6 }, (_, i) => question(`rq${i}`, "rt", "aqa-alevel-biology"));
    const refAttempts = [
      attempt("rq0", "rt", 1, day(1), { subjectId: "aqa-alevel-biology" }),
      attempt("rq1", "rt", 0, day(1), { subjectId: "aqa-alevel-biology" }),
      attempt("rq2", "rt", 1, day(2), { subjectId: "aqa-alevel-biology" }),
      attempt("rq3", "rt", 4, day(20), { subjectId: "aqa-alevel-biology" }),
      attempt("rq4", "rt", 4, day(21), { subjectId: "aqa-alevel-biology" }),
      attempt("rq5", "rt", 3, day(22), { subjectId: "aqa-alevel-biology" }),
    ];
    const result = buildProofLedger({
      topics: [refTopic], attempts: refAttempts, questions: refBank, now: NOW,
    });
    expect(result.topics[0]!.status).toBe("untested");
    expect(result.topics[0]!.gain).toBeNull();
    expect(result.topics[0]!.markPoints).toBe(0);
    expect(result.proven).toBe(0);
    expect(result.headline).toMatch(/nothing proven yet/i);
  });

  it("writes dates the way a student reads them", () => {
    expect(shortDate("2026-10-04")).toBe("4 Oct");
    expect(shortDate("2026-01-31")).toBe("31 Jan");
    expect(proofLine({ status: "awaiting-proof", provableFrom: "2026-10-04", proofDue: false, gain: null, illusory: false })).toContain("from 4 Oct");
  });
});
