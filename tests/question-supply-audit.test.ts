import { describe, expect, it } from "vitest";
import { applyHumanVerification, physicsContentFingerprint } from "@/domain/content-trust";
import { auditFlagshipSupply, auditSubjectSupply, auditTopicSupply, capabilityGapsForTopic, supplyAuditIntegrityIssues, verdictFor } from "@/domain/supply-audit";
import { MIN_PROVABLE_QUESTIONS } from "@/domain/supply";
import type { Question, Topic } from "@/domain/types";

const SUBJECT = "wjec-alevel-maths";
const topic = (id: string, order = 1): Topic => ({ id, subjectId: SUBJECT, unitId: "u", title: id, order, intrinsicDifficulty: 2, summary: "", keyPoints: [], commonErrors: [], specPoints: [] }) as Topic;
const TOPIC = topic("t1");

function q(id: string, prompt: string, extra: Partial<Question> = {}, topicIds = ["t1"]): Question {
  return {
    id, subjectId: SUBJECT, topicIds, kind: "short", stem: prompt, totalMarks: 2, calculatorAllowed: true, difficulty: 3, origin: "seed",
    createdAt: "2026-01-01T00:00:00.000Z", specPointIds: ["sp1"],
    parts: [{ id: `${id}:a`, label: "", prompt, marks: 2, markScheme: ["a", "b"], modelAnswer: `answer ${id}`, specPointIds: ["sp1"] }],
    ...extra,
  } as Question;
}
// Test-only attestation; nothing in the production bank is approved here.
function approve(question: Question): Question {
  return applyHumanVerification(question, {
    status: "approved", reviewerId: "test-only", reviewerRole: "teacher", reviewerQualification: "Test fixture only",
    reviewedAt: "2026-09-08T00:00:00Z", contentFingerprint: physicsContentFingerprint(question),
    checks: { question: true, marking: true, workedSolution: true, capabilityMapping: true, specificationMapping: true, examRealism: true },
  });
}

const FACTOR = "Use the factor theorem to decide whether x - 2 is a factor of the cubic polynomial given below.";
const CARDS = "Calculate the probability that two cards drawn without replacement are both hearts from a standard pack.";
const STATIONARY = "Differentiate the function and find the coordinates of the stationary point of the curve shown.";
const COPPER = "A student heats a sample of copper sulfate crystals gently and measures the mass lost during the heating.";
const NITRATE = "A student heats a sample of magnesium nitrate crystals gently and measures the mass lost during the heating.";
const trustAll = { trusted: () => true } as const;
const audit = (qs: Question[], options: Parameters<typeof auditTopicSupply>[2] = trustAll) => auditTopicSupply(TOPIC, qs, options);

describe("shallow variation", () => {
  it("collapses a number swap to one question even across different families", () => {
    const a = q("a", "Show that x = 2 is a root of f(x) = x³ - 5x² + 4x - 3 and state the remainder when divided by x - 2.");
    const b = q("b", "Show that x = 3 is a root of f(x) = x³ - 6x² + 5x - 4 and state the remainder when divided by x - 3.");
    const row = audit([a, b]);
    expect(row.trusted).toBe(2);
    expect(row.provableDistinct).toBe(1);
    expect(row.shallowGroups).toEqual([{ kind: "number-swap", kinds: ["number-swap"], ids: ["a", "b"], trustedIds: ["a", "b"] }]);
    expect(row.delayedProofEligible).toBe(0);
    expect(row.verdict).toBe("thin");
  });

  it("ignores units when matching number swaps", () => {
    const row = audit([
      q("a", "A force of 12 N acts on a body of mass 4 kg; find the acceleration of the body in the stated direction."),
      q("b", "A force of 30 kN acts on a body of mass 9 g; find the acceleration of the body in the stated direction."),
    ]);
    expect(row.shallowGroups[0]?.kind).toBe("number-swap");
    expect(row.provableDistinct).toBe(1);
  });

  it("collapses a noun swap to one question", () => {
    const row = audit([q("c", COPPER), q("d", NITRATE)]);
    expect(row.shallowGroups).toEqual([{ kind: "noun-swap", kinds: ["noun-swap"], ids: ["c", "d"], trustedIds: ["c", "d"] }]);
    expect(row.provableDistinct).toBe(1);
    expect(row.verdict).toBe("thin");
  });

  it("merges a chain of swaps into one group that counts once", () => {
    const row = audit([q("c", COPPER), q("d", NITRATE), q("e", COPPER.replace("copper sulfate", "zinc carbonate")), q("f", FACTOR)]);
    expect(row.shallowGroups.map((g) => g.ids)).toEqual([["c", "d", "e"]]);
    expect(row.provableDistinct).toBe(2);
  });

  it("flags identical reasoning with a reworded surface", () => {
    const learning = { familyId: "f", contextId: "c", demand: "application", reasoningMoves: ["apply the factor theorem to test a root", "compare the remainder with zero"] };
    const part = (id: string, prompt: string) => ({ id, label: "", prompt, marks: 2, markScheme: ["a"], modelAnswer: "m", learning: { ...learning, familyId: `fam-${id}` } });
    const a = q("a", "Decide whether the linear expression divides the polynomial exactly, using the factor theorem on the given cubic.", { parts: [part("a", "Decide whether the linear expression divides the polynomial exactly, using the factor theorem on the given cubic.")] } as Partial<Question>);
    const b = q("b", "Decide whether the linear expression divides the polynomial exactly, using the factor theorem on the given quartic.", { parts: [part("b", "Decide whether the linear expression divides the polynomial exactly, using the factor theorem on the given quartic.")] } as Partial<Question>);
    expect(audit([a, b]).provableDistinct).toBe(1);
  });

  it("counts genuinely different questions separately", () => {
    const row = audit([q("a", FACTOR), q("b", CARDS), q("c", STATIONARY)]);
    expect(row.shallowGroups).toEqual([]);
    expect(row.provableDistinct).toBe(3);
    expect(row.provenIds).toEqual(["a", "b", "c"]);
    expect(row.delayedProofEligible).toBe(3);
    expect(row.verdict).toBe("enough-for-proof");
  });

  it("counts distinct reasoning families separately and merges a shared family", () => {
    const learning = (familyId: string) => ({ familyId, contextId: "c", demand: "application", expectedMinutes: 3 }) as Question["learning"];
    const distinct = audit([q("a", FACTOR, { learning: learning("f1") }), q("b", CARDS, { learning: learning("f2") })]);
    expect(distinct.trustedFamilies).toBe(2);
    expect(distinct.provableDistinct).toBe(2);
    const shared = audit([q("a", FACTOR, { learning: learning("f1") }), q("b", CARDS, { learning: learning("f1") })]);
    expect(shared.trustedFamilies).toBe(1);
    expect(shared.provableDistinct).toBe(1);
    expect(shared.shallowGroups).toEqual([]);
  });

  it("still reports shallow groups that include untrusted members, without counting them as proof", () => {
    const row = audit([q("a", COPPER), q("b", NITRATE)], { trusted: (x) => x.id === "a" });
    expect(row.shallowGroups[0]).toMatchObject({ ids: ["a", "b"], trustedIds: ["a"] });
    expect(row.trusted).toBe(1);
    expect(row.provableDistinct).toBe(1);
  });
});

describe("trust and verdicts", () => {
  it("never counts unverified content as proof-eligible", () => {
    const row = audit([q("a", FACTOR), q("b", CARDS), q("c", STATIONARY)], {});
    expect(row).toMatchObject({ questions: 3, trusted: 0, provableDistinct: 0, delayedProofEligible: 0, verdict: "insufficient", provenIds: [] });
    expect(row.reviewableDistinct).toBe(MIN_PROVABLE_QUESTIONS);
  });

  it("counts only genuinely approved questions under the repo's trust predicate", () => {
    const bank = [approve(q("a", FACTOR)), q("b", CARDS), q("c", STATIONARY)];
    expect(bank[0]!.verification).toBe("verified");
    const row = audit(bank, {});
    expect(row).toMatchObject({ trusted: 1, provableDistinct: 1, verdict: "thin", provenIds: ["a"] });
    const both = audit([approve(q("a", FACTOR)), approve(q("b", CARDS))], {});
    expect(both.verdict).toBe("enough-for-proof");
  });

  it("invalidates trust when an approved question is edited", () => {
    const edited = { ...approve(q("a", FACTOR)), stem: "Edited after review so the approval no longer applies to this text." };
    expect(audit([edited], {}).trusted).toBe(0);
  });

  it("never counts reference-tier subjects, whatever the predicate says", () => {
    const reference = { ...q("a", FACTOR), subjectId: "ocr-gcse-maths" } as Question;
    const row = auditTopicSupply({ id: "t1", subjectId: "ocr-gcse-maths", title: "t" }, [reference, { ...q("b", CARDS), subjectId: "ocr-gcse-maths" } as Question], trustAll);
    expect(row.trusted).toBe(0);
    expect(row.verdict).toBe("insufficient");
  });

  it("maps distinct trusted counts to verdicts using MIN_PROVABLE_QUESTIONS", () => {
    expect(verdictFor(0)).toBe("insufficient");
    expect(verdictFor(MIN_PROVABLE_QUESTIONS - 1)).toBe("thin");
    expect(verdictFor(MIN_PROVABLE_QUESTIONS)).toBe("enough-for-proof");
    expect(audit([]).verdict).toBe("insufficient");
    expect(audit([q("a", FACTOR)]).verdict).toBe("thin");
  });

  it("excludes questions the learner has already seen", () => {
    const bank = [q("a", FACTOR), q("b", CARDS)];
    const attempt = { id: "x", userId: "u", subjectId: SUBJECT, questionId: "a", topicIds: ["t1"], answers: {}, marked: [], awarded: 1, max: 2, feedback: "", markedBy: "rubric", elapsedMs: 1, mode: "practice", createdAt: "2026-01-01T00:00:00.000Z" } as never;
    expect(audit(bank, { ...trustAll, attempts: [attempt] })).toMatchObject({ trusted: 1, provableDistinct: 1, verdict: "thin" });
  });

  it("counts transfer and data-analysis only among trusted questions", () => {
    const data = q("a", FACTOR, { learning: { familyId: "f", contextId: "c", demand: "transfer", expectedMinutes: 3, setupFingerprint: { structures: ["table-dataset"], representations: ["table"], operations: [], relationships: [], outputTypes: [] } } });
    const options = { trusted: (x: Question) => x.id === "a", isTransfer: () => true };
    expect(audit([data, q("b", CARDS)], options)).toMatchObject({ transfer: 1, dataAnalysis: 1 });
    expect(audit([data], { trusted: () => false, isTransfer: () => true })).toMatchObject({ transfer: 0, dataAnalysis: 0 });
  });
});

describe("subject rollup and authoring needs", () => {
  const topics = [topic("t1", 1), topic("t2", 2), topic("t3", 3)];
  const bank = [
    q("a1", FACTOR, {}, ["t1"]), q("a2", CARDS, {}, ["t1"]),
    q("b1", COPPER, {}, ["t2"]), q("b2", NITRATE, {}, ["t2"]),
  ];
  const result = auditSubjectSupply({ subjectId: SUBJECT, topics, questions: bank, ...trustAll });

  it("summarises verdicts and ranks the biggest gap first", () => {
    expect(result.rollup.byVerdict).toEqual({ "enough-for-proof": 1, thin: 1, insufficient: 1 });
    expect(result.rollup.provableDistinct).toBe(3);
    expect(result.authoringNeeds.map((n) => [n.topicId, n.missingDistinct])).toEqual([["t3", 2], ["t2", 1], ["t1", 0]]);
    expect(result.authoringNeeds[0]).toMatchObject({ action: "author-new", verdict: "insufficient" });
  });

  it("covers all four flagship subjects", () => {
    expect(auditFlagshipSupply({ topics, questions: bank }).map((s) => s.subjectId)).toEqual([
      "wjec-alevel-maths", "wjec-alevel-biology", "wjec-alevel-chemistry", "wjec-alevel-physics"]);
  });
});

describe("integrity", () => {
  const topics = [topic("t1")];
  const bank = [q("a", FACTOR), q("b", CARDS), q("c", COPPER), q("d", NITRATE)];

  it("is clean for an honest audit, even when supply is thin", () => {
    const audits = auditFlagshipSupply({ topics, questions: bank, ...trustAll });
    expect(supplyAuditIntegrityIssues(audits, bank, trustAll)).toEqual([]);
    expect(supplyAuditIntegrityIssues(auditFlagshipSupply({ topics, questions: bank }), bank)).toEqual([]);
  });

  it("catches a proof-eligible question that is not trusted", () => {
    const audits = auditFlagshipSupply({ topics, questions: bank, ...trustAll });
    expect(supplyAuditIntegrityIssues(audits, bank).some((issue) => issue.includes("is not trusted"))).toBe(true);
  });

  it("catches shallow duplicates both counted as distinct", () => {
    const audits = auditFlagshipSupply({ topics, questions: bank, ...trustAll });
    const maths = audits[0]!;
    maths.topics[0]!.provenIds = ["c", "d"];
    maths.topics[0]!.provableDistinct = 2;
    maths.topics[0]!.verdict = "enough-for-proof";
    expect(supplyAuditIntegrityIssues(audits, bank, trustAll).some((issue) => issue.includes("both count as distinct"))).toBe(true);
  });
});

describe("determinism", () => {
  it("gives identical output for shuffled questions and topics", () => {
    const topics = [topic("t1", 1), topic("t2", 2)];
    const bank = [q("a", FACTOR), q("b", CARDS), q("c", COPPER), q("d", NITRATE), q("e", STATIONARY, {}, ["t2"]), q("f", COPPER, {}, ["t1", "t2"])];
    const forward = auditFlagshipSupply({ topics, questions: bank, ...trustAll });
    const shuffled = auditFlagshipSupply({ topics: [...topics].reverse(), questions: [bank[3]!, bank[5]!, bank[0]!, bank[4]!, bank[2]!, bank[1]!], ...trustAll });
    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(forward));
  });
});

describe("capability-aware authoring needs", () => {
  const topics = [topic("t1", 1), topic("t2", 2), topic("t3", 3)];
  const bank = [
    q("a1", FACTOR, {}, ["t1"]), q("a2", CARDS, {}, ["t1"]),
    q("b1", COPPER, {}, ["t2"]), q("b2", NITRATE, {}, ["t2"]),
  ];
  const result = auditSubjectSupply({ subjectId: SUBJECT, topics, questions: bank, ...trustAll });

  it("reports data and delayed-proof needs without disturbing the ranking", () => {
    // Order is still driven by the distinct gap first: t3 (2), t2 (1), t1 (0).
    expect(result.authoringNeeds.map((n) => [n.topicId, n.missingDistinct])).toEqual([["t3", 2], ["t2", 1], ["t1", 0]]);
    const [t3, t2, t1] = result.authoringNeeds;
    // t2's pair is a noun swap: one distinct question, no delayed-proof pair.
    expect(t2).toMatchObject({ missingTransfer: 1, missingDelayedProof: 1 });
    // t1 has two distinct questions but no transfer supply.
    expect(t1).toMatchObject({ missingDistinct: 0, missingTransfer: 1, missingData: 0, missingDelayedProof: 0 });
    // Nothing authored here is data content, so no data need is raised.
    expect(t3).toMatchObject({ missingData: 0, missingDelayedProof: 1 });
  });

  it("raises a data need only when authored data questions exist unreviewed", () => {
    const data = q("d", FACTOR, { learning: { familyId: "f", contextId: "c", demand: "application", expectedMinutes: 3, setupFingerprint: { structures: ["table-dataset"], representations: ["table"], operations: [], relationships: [], outputTypes: [] } } });
    const row = audit([data], {});
    expect(row.dataAuthored).toBe(1);
    expect(row.dataAnalysis).toBe(0);
    const gaps = capabilityGapsForTopic(row);
    expect(gaps.map((g) => g.capability)).toContain("data");
  });
});

describe("learner-facing capability gaps", () => {
  it("is empty when a topic can be proven", () => {
    const row = audit([approve(q("a", FACTOR)), approve(q("b", CARDS)), approve(q("c", STATIONARY))], {});
    expect(row.verdict).toBe("enough-for-proof");
    // Plain short questions carry no transfer demand, so only transfer is listed.
    expect(capabilityGapsForTopic(row).map((g) => g.capability)).toEqual(["transfer"]);
  });

  it("names the distinct gap first on an empty topic", () => {
    const gaps = capabilityGapsForTopic(audit([], {}));
    expect(gaps.map((g) => g.capability)).toEqual(["distinct", "transfer"]);
    expect(gaps[0]!.text).toMatch(/cannot be proven/);
    expect(gaps[0]!.alternative).toMatch(/Practise the authored questions/);
  });

  it("names the delayed-proof gap only once distinct supply exists", () => {
    const pair = (id: string, stem: string) => approve(q(id, stem));
    const row = audit([
      pair("a", "Show that x = 2 is a root of f(x) = x³ - 5x² + 4x - 3 and state the remainder when divided by x - 2."),
      pair("b", "Show that x = 3 is a root of f(x) = x³ - 6x² + 5x - 4 and state the remainder when divided by x - 3."),
      pair("c", COPPER),
      pair("d", NITRATE),
    ], {});
    expect(row.provableDistinct).toBe(2);
    expect(row.delayedProofEligible).toBe(0);
    const gaps = capabilityGapsForTopic(row);
    expect(gaps.map((g) => g.capability)).toEqual(["transfer", "delayed-proof"]);
    expect(gaps[1]!.alternative).toMatch(/spaced review/);
  });
});
