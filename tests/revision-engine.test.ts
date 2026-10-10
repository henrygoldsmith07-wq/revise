import { describe, expect, it } from "vitest";
import { estimateEffectiveness, effectivenessClaims, missionChains, type MissionChain } from "@/domain/effectiveness";
import { physicsContentFingerprint } from "@/domain/content-trust";
import { buildExamMissions } from "@/domain/exam-mission";
import { buildMarkRecovery } from "@/domain/mark-recovery";
import { recoveryBreakdown, recoveryWindow, weekLines } from "@/domain/marks-progress";
import { buildMissionSession } from "@/domain/mission-session";
import { buildPaperRecovery } from "@/domain/paper-recovery";
import { collectMissions, daysToNearestExam, rankRevisionActions, type EngineInput } from "@/domain/revision-engine";
import { evidenceLimits, limitsSentence, unseenSupplyByTopic } from "@/domain/supply";
import type { Attempt, ExamDate, Mistake, Question } from "@/domain/types";
import { attempt as mkAttempt, mistake as mkMistake, question as mkQuestion } from "./helpers-recovery";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const iso = (d: string) => `${d}T09:00:00.000Z`;

function exam(subjectId: string, daysAhead: number): ExamDate {
  const date = new Date(NOW.getTime() + daysAhead * 86_400_000).toISOString().slice(0, 10);
  return { id: `e-${subjectId}`, userId: "u1", subjectId, date, label: subjectId };
}
// Proof is a claim about reviewed flagship material: reference-tier subjects
// can never prove improvement (learnerEvidenceTrusted). These fixtures
// therefore model the four WJEC flagships, and `bank()` is a reviewed bank.
const PHY = "wjec-alevel-physics", BIO = "wjec-alevel-biology", MATHS = "wjec-alevel-maths", CHEM = "wjec-alevel-chemistry";
/** Short fixture prefix so question ids stay readable ("maths-calculus-0"). */
const short = (subjectId: string) => subjectId.replace(/^wjec-alevel-/, "");
const q = (id: string, subjectId: string, topicId: string, over: Partial<Question> = {}) => mkQuestion(id, topicId, { subjectId, ...over });
/** A question that has passed the full human review contract (test fixture only). */
const reviewed = (question: Question): Question => ({
  ...question, verification: "verified",
  humanVerification: {
    status: "approved", reviewerId: "test-reviewer", reviewerRole: "teacher", reviewerQualification: "Test fixture only",
    reviewedAt: "2026-09-01T09:00:00.000Z", contentFingerprint: physicsContentFingerprint(question),
    checks: { question: true, marking: true, workedSolution: true, capabilityMapping: true, specificationMapping: true, examRealism: true },
  },
});
const m = (id: string, subjectId: string, topicId: string, questionId: string, over: Partial<Mistake> = {}) =>
  mkMistake(id, { subjectId, topicId, questionId, attemptId: `att-${id}`, workingErrorKind: "unit-error", ...over });
const a = (id: string, subjectId: string, topicId: string, questionId: string, awarded: number, at: string, over: Partial<Attempt> = {}) =>
  mkAttempt(id, questionId, awarded, 3, at, { subjectId, topicIds: [topicId], ...over });

function bank(subjectId: string, topicId: string, n = 8): Question[] {
  return Array.from({ length: n }, (_, i) => reviewed(q(`${short(subjectId)}-${topicId}-${i}`, subjectId, topicId, { kind: i % 2 ? "calculation" : "structured" })));
}

function engine(over: Partial<EngineInput> & Pick<EngineInput, "mistakes" | "attempts" | "questions" | "subjectIds" | "examDates">): EngineInput {
  const recovery = buildMarkRecovery({ mistakes: over.mistakes, attempts: over.attempts, questions: over.questions, now: NOW });
  const topics = [...new Set(over.questions.flatMap((x) => x.topicIds))];
  return { now: NOW, recovery, supplyByTopic: unseenSupplyByTopic(topics, over.questions, over.attempts), topicTitle: (id) => id, subjectName: (id) => id, ...over };
}

// Physics: 8 marks, exam in 8 days. Biology: 12 marks, exam in 40 days. Maths: delayed proof due.
function scenario() {
  const questions = [...bank(PHY, "circuits"), ...bank(BIO, "cells"), ...bank(MATHS, "calculus"), ...bank(CHEM, "bonding")];
  const mistakes = [
    m("p1", PHY, "circuits", "physics-circuits-0", { marksLost: 4, createdAt: iso("2026-09-20") }),
    m("p2", PHY, "circuits", "physics-circuits-1", { marksLost: 4, createdAt: iso("2026-09-21") }),
    m("b1", BIO, "cells", "biology-cells-0", { marksLost: 6, category: "communication", workingErrorKind: undefined, createdAt: iso("2026-09-20") }),
    m("b2", BIO, "cells", "biology-cells-1", { marksLost: 6, category: "communication", workingErrorKind: undefined, createdAt: iso("2026-09-21") }),
    m("m1", MATHS, "calculus", "maths-calculus-0", { marksLost: 4, createdAt: iso("2026-09-10") }),
  ];
  const attempts = [
    a("att-m1", MATHS, "calculus", "maths-calculus-0", 0, iso("2026-09-10")),
    a("ms1", MATHS, "calculus", "maths-calculus-2", 3, iso("2026-09-15")),
  ];
  return { questions, mistakes, attempts, examDates: [exam(PHY, 8), exam(BIO, 40), exam(MATHS, 30), exam(CHEM, 90)] };
}

describe("next best action engine", () => {
  it("compares candidates across subjects globally and explains the winner", () => {
    const s = scenario();
    const plan = rankRevisionActions(engine({ ...s, subjectIds: [PHY, BIO, MATHS, CHEM] }));
    expect(plan.top).not.toBeNull();
    const subjects = new Set(plan.actions.map((x) => x.subjectId));
    expect(subjects.size).toBeGreaterThanOrEqual(3);
    const top = plan.top!;
    for (const key of ["why", "whyNow", "whyBefore", "after", "proves"] as const) expect(top.explanation[key].length).toBeGreaterThan(0);
    expect(top.explanation.evidence.length).toBeGreaterThan(0);
    expect(top.route.href).toMatch(/^\/(practice|papers|review|adaptive-session)/);
    expect(plan.model).toMatch(/expected marks/);
    // Strictly ordered by score.
    for (let i = 1; i < plan.actions.length; i++) expect(plan.actions[i - 1]!.score).toBeGreaterThanOrEqual(plan.actions[i]!.score);
  });

  it("chooses the same action whatever order the subjects are listed in", () => {
    const s = scenario();
    const orders = [
      [PHY, BIO, MATHS, CHEM], [CHEM, MATHS, BIO, PHY], [BIO, PHY, CHEM, MATHS], [MATHS, CHEM, PHY, BIO],
    ];
    const ids = orders.map((subjectIds) => rankRevisionActions(engine({ ...s, subjectIds, examDates: [...s.examDates].reverse(), mistakes: [...s.mistakes].reverse() })).actions.map((x) => x.id));
    for (const list of ids) expect(list).toEqual(ids[0]);
  });

  it("lets a near exam outweigh a larger loss further away", () => {
    const s = scenario();
    const plan = rankRevisionActions(engine({ ...s, subjectIds: [PHY, BIO] }));
    expect(plan.top!.subjectId).toBe(PHY);
    const bio = plan.actions.find((x) => x.subjectId === BIO)!;
    expect(bio.marksRecoverable!).toBeGreaterThan(plan.top!.marksRecoverable!);
    expect(plan.top!.explanation.whyBefore).toMatch(/closer|per minute|stage|evidence|exam/);
  });

  it("only plans enrolled subjects", () => {
    const s = scenario();
    const plan = rankRevisionActions(engine({ ...s, subjectIds: [BIO] }));
    expect(new Set(plan.actions.map((x) => x.subjectId))).toEqual(new Set([BIO]));
  });

  it("parks a proof check until the delay has passed, then ranks it", () => {
    const s = scenario();
    const early = rankRevisionActions(engine({ ...s, subjectIds: [MATHS], now: new Date("2026-09-16T09:00:00Z") }));
    const waiting = early.deferred.find((d) => d.action.type === "proof-check" || d.reason.includes("Waiting"));
    expect(waiting?.reason).toMatch(/Waiting for the delay/);
    expect(early.actions.find((x) => x.type === "proof-check")).toBeUndefined();
    const later = rankRevisionActions(engine({ ...s, subjectIds: [MATHS], now: new Date("2026-10-03T12:00:00Z") }));
    expect(later.actions.some((x) => x.type === "proof-check" && x.proofStatus === "awaiting-proof")).toBe(true);
  });

  it("keeps a learner practising when nothing else ranks, without spending supply a delayed check needs", () => {
    const s = scenario();
    // Maths only, before the delay has passed: the calculus proof check is
    // parked. "limits" has been started and won, nothing is due.
    const limits = bank(MATHS, "limits", 4);
    const questions = [...s.questions, ...limits];
    const attempts = [...s.attempts, a("l0", MATHS, "limits", "maths-limits-0", 3, iso("2026-09-14"))];
    const plan = rankRevisionActions(engine({ ...s, questions, attempts, subjectIds: [MATHS], now: new Date("2026-09-16T09:00:00.000Z") }));
    expect(plan.deferred.some((d) => /Waiting for the delay/.test(d.reason))).toBe(true);
    expect(plan.top?.title).toBe("Keep practising limits");
    expect(plan.top!.topicIds).toEqual(["limits"]);
    expect(plan.top!.explanation.why).toMatch(/3 questions you have not answered/);
    // With only the reserved topic left, Today stays honest rather than spending it.
    const reservedOnly = rankRevisionActions(engine({ ...s, subjectIds: [MATHS], now: new Date("2026-09-16T09:00:00.000Z") }));
    expect(reservedOnly.top?.topicIds ?? []).not.toContain("calculus");
  });

  it("plans a regressed topic before new work on it and never claims proof it lacks", () => {
    const questions = bank(MATHS, "calculus", 8);
    const mistakes = [m("m1", MATHS, "calculus", "maths-calculus-0", { marksLost: 4, createdAt: iso("2026-09-10") })];
    const attempts = [
      a("att-m1", MATHS, "calculus", "maths-calculus-0", 0, iso("2026-09-10")),
      a("s1", MATHS, "calculus", "maths-calculus-2", 3, iso("2026-09-15")), a("s2", MATHS, "calculus", "maths-calculus-3", 3, iso("2026-09-25")),
      a("s3", MATHS, "calculus", "maths-calculus-4", 0, iso("2026-10-02")),
    ];
    const plan = rankRevisionActions(engine({ questions, mistakes, attempts, subjectIds: [MATHS], examDates: [exam(MATHS, 30)] }));
    expect(plan.top!.type).toBe("regression-recovery");
    expect(plan.top!.requiredFirst).toBe(true);
    expect(plan.top!.proofStatus).toBe("regressed");
  });

  it("treats missing exam dates as unknown, not urgent", () => {
    expect(daysToNearestExam([], MATHS, NOW)).toBeNull();
    expect(daysToNearestExam([exam(MATHS, 5), exam(MATHS, 20)], MATHS, NOW)).toBe(5);
  });
});

describe("exam countdown strategy", () => {
  const base = () => {
    const s = scenario();
    const papers = [{ subjectId: PHY, paperId: "paper-9", title: "2024 Physics Unit 1" }];
    return { ...s, subjectIds: [PHY], papers, dueReviews: [{ subjectId: PHY, count: 20, overdue: 4 }], untouched: [{ subjectId: PHY, topicId: "waves", label: "Waves", share: 0.08 }] };
  };
  const at = (days: number) => rankRevisionActions(engine({ ...base(), examDates: [exam(PHY, days)] }));

  it("changes what is offered as the exam approaches", () => {
    const far = at(60);
    const mid = at(30);
    const late = at(7);
    const final = at(2);
    expect(far.actions.some((x) => x.type === "exam-section" || x.type === "full-paper")).toBe(false);
    expect(mid.actions.some((x) => x.type === "exam-section")).toBe(true);
    expect(mid.actions.some((x) => x.type === "full-paper")).toBe(false);
    expect(late.actions.some((x) => x.type === "full-paper")).toBe(true);
    expect(final.actions.some((x) => x.type === "exam-urgent")).toBe(true);
    expect(far.actions.some((x) => x.type === "exam-urgent")).toBe(false);
  });

  it("does not start a large low-value area in the final days, and says why", () => {
    const final = at(2);
    expect(final.actions.some((x) => x.type === "learn-untouched")).toBe(false);
    expect(final.deferred.some((d) => d.action.type === "learn-untouched" && /too close/i.test(d.reason))).toBe(true);
    expect(at(60).actions.some((x) => x.type === "learn-untouched")).toBe(true);
  });

  it("makes no delayed-proof claim the exam cannot fit", () => {
    const final = at(2);
    const urgent = final.actions.find((x) => x.type === "exam-urgent")!;
    expect(urgent.explanation.proves).toMatch(/no time left/i);
    const physics = collectMissions({ ...engine({ ...base(), examDates: [exam(PHY, 2)] }), includeProven: true }).filter((x) => x.subjectId === PHY);
    expect(physics.length).toBeGreaterThan(0);
    for (const mission of physics) expect(mission.stages.some((s) => s.kind === "delayed-proof")).toBe(false);
  });
});

describe("thin evidence and evidence gaps", () => {
  it("states uncertainty and low confidence when there is almost no evidence", () => {
    const questions = bank(PHY, "circuits", 4);
    const mistakes = [m("p1", PHY, "circuits", "physics-circuits-0", { marksLost: 3 })];
    const plan = rankRevisionActions(engine({ questions, mistakes, attempts: [], subjectIds: [PHY], examDates: [exam(PHY, 30)] }));
    const top = plan.top!;
    expect(top.confidence).toBeLessThan(0.6);
    expect(top.explanation.evidence.join(" ")).toMatch(/thin|no proof yet/i);
  });

  it("turns an unprovable mission into an explicit evidence-gap action that can still be practised", () => {
    const questions = bank(PHY, "circuits", 3);
    const mistakes = [m("p1", PHY, "circuits", "physics-circuits-0", { marksLost: 3 }), m("p2", PHY, "circuits", "physics-circuits-1", { marksLost: 3, createdAt: iso("2026-09-22") })];
    const attempts = [
      a("att-p1", PHY, "circuits", "physics-circuits-0", 0, iso("2026-09-20")), a("att-p2", PHY, "circuits", "physics-circuits-1", 0, iso("2026-09-22")),
      a("s1", PHY, "circuits", "physics-circuits-2", 3, iso("2026-09-25")),
    ];
    const plan = rankRevisionActions(engine({ questions, mistakes, attempts, subjectIds: [PHY], examDates: [exam(PHY, 30)] }));
    const gap = plan.actions.find((x) => x.type === "evidence-gap");
    expect(gap).toBeDefined();
    expect(gap!.explanation.evidence.join(" ")).toMatch(/cannot currently prove the improvement/);
    expect(gap!.mission?.stage).toBe("practise");
    expect(plan.authoringNeeds[0]).toMatchObject({ topicId: "circuits", need: "unseen-verified" });
  });

  it("explains each way proof can be limited", () => {
    const notes = evidenceLimits({ supply: { provable: 0, practiceOnly: 3, transfer: 0 }, daysToExam: 2, minProofDays: 3, trustedAttempts: 1, delayedChecked: false });
    expect(notes.map((n) => n.kind)).toEqual(expect.arrayContaining(["only-unverified", "no-transfer", "exam-too-close", "thin-evidence", "no-delayed-evidence"]));
    expect(limitsSentence(notes)).toMatch(/have not been reviewed/);
    expect(evidenceLimits({ supply: { provable: 1, practiceOnly: 0, transfer: 1 }, daysToExam: 40, minProofDays: 3, trustedAttempts: 5, delayedChecked: true }).map((n) => n.kind)).toEqual(["one-unseen-verified"]);
    expect(limitsSentence([])).toBeNull();
  });

  it("never lets unverified content prove a mark", () => {
    const unverified = (id: string) => q(id, "wjec-alevel-physics", "circuits");
    const questions = [unverified("w0"), unverified("w1"), unverified("w2"), unverified("w3")];
    const mistakes = [m("w", "wjec-alevel-physics", "circuits", "w0", { createdAt: iso("2026-09-10"), attemptId: "att-w" })];
    const attempts = [a("att-w", "wjec-alevel-physics", "circuits", "w0", 0, iso("2026-09-10")), a("x1", "wjec-alevel-physics", "circuits", "w1", 3, iso("2026-09-15")), a("x2", "wjec-alevel-physics", "circuits", "w2", 3, iso("2026-09-25"))];
    const r = buildMarkRecovery({ mistakes, attempts, questions, now: NOW });
    expect(r.items[0]!.state).toBe("provisional");
    expect(r.items[0]!.unverifiedOnly).toBe(true);
  });

  it("supply counts only unseen verified questions as able to prove", () => {
    const questions = bank(MATHS, "calculus", 4);
    const seen = [a("s", MATHS, "calculus", "maths-calculus-0", 3, iso("2026-09-01"))];
    expect(unseenSupplyByTopic(["calculus"], questions, seen).calculus!.provable).toBe(3);
  });
});

describe("mission sessions", () => {
  const s = scenario();
  const base = engine({ ...s, subjectIds: [PHY], mistakes: s.mistakes.filter((x) => x.subjectId === PHY) });
  const mission = () => buildExamMissions({ mistakes: base.mistakes, recovery: base.recovery, daysToExam: 30, unseenByTopic: {}, supplyByTopic: base.supplyByTopic })[0]!;

  it("selects questions for the mission's weakness, spread across its topics, and attributes every attempt", () => {
    const ms = [
      m("u1", PHY, "circuits", "p-c-0", { marksLost: 3 }), m("u2", PHY, "fields", "p-f-0", { marksLost: 3, createdAt: iso("2026-09-22") }),
    ];
    const questions = [
      q("p-c-0", PHY, "circuits", { kind: "calculation" }), q("p-f-0", PHY, "fields", { kind: "calculation" }),
      ...["c1", "c2", "c3"].map((id) => q(id, PHY, "circuits", { kind: "calculation" })), ...["f1", "f2", "f3"].map((id) => q(id, PHY, "fields", { kind: "structured" })),
    ].map(reviewed);
    const recovery = buildMarkRecovery({ mistakes: ms, attempts: [], questions, now: NOW });
    const mis = buildExamMissions({ mistakes: ms, recovery, daysToExam: 30, unseenByTopic: {}, supplyByTopic: unseenSupplyByTopic(["circuits", "fields"], questions, []) })[0]!;
    expect(mis.topicIds).toEqual(["circuits", "fields"]);
    const practise = buildMissionSession(mis, { questions, attempts: [], mistakes: ms }, "practise");
    const topics = new Set(practise.questionIds.map((id) => questions.find((x) => x.id === id)!.topicIds[0]));
    expect(topics.size).toBe(2);
    expect(practise.questionIds).not.toContain("p-c-0");
    expect(practise.steps[0]!.hintBudget).toBeUndefined();
    for (const id of practise.questionIds) expect(practise.contextFor[id]).toMatchObject({ missionId: mis.id, stage: "practise", targetCause: "unit-error", sourceMistakeIds: ["u1", "u2"] });
    const apply = buildMissionSession(mis, { questions, attempts: [], mistakes: ms }, "apply");
    expect(apply.steps.length).toBeGreaterThan(0);
    expect(apply.steps.every((st) => st.hintBudget === 0 && st.verified)).toBe(true);
    const repair = buildMissionSession(mis, { questions, attempts: [], mistakes: ms }, "repair");
    expect(repair.questionIds.sort()).toEqual(["p-c-0", "p-f-0"]);
  });

  it("reports the limit instead of inventing a proof stage when no verified unseen question exists", () => {
    const ms = [m("u1", PHY, "circuits", "p-c-0", { marksLost: 3 })];
    const questions = [q("p-c-0", PHY, "circuits")];
    const recovery = buildMarkRecovery({ mistakes: ms, attempts: [], questions, now: NOW });
    const mis = buildExamMissions({ mistakes: ms, recovery, daysToExam: 30, unseenByTopic: {} })[0]!;
    const apply = buildMissionSession(mis, { questions, attempts: [], mistakes: ms }, "apply");
    expect(apply.questionIds).toEqual([]);
    expect(apply.limit).toMatch(/cannot (currently )?prove|enough reviewed new questions/i);
  });

  it("never offers a reference-tier question as proof, even when plenty are unseen", () => {
    // Reference-tier subjects pass the permissive authoring predicate, but are
    // labelled "not checked against the specification", so they must never
    // feed a step that says it "proves the marks are back".
    const REF = "gcse-geography";
    const ms = [m("r1", REF, "rivers", "g-0", { marksLost: 3 })];
    const questions = Array.from({ length: 6 }, (_, i) => q(`g-${i}`, REF, "rivers", { kind: "structured" }));
    const supply = unseenSupplyByTopic(["rivers"], questions, []);
    expect(supply.rivers).toEqual({ provable: 0, practiceOnly: 6, transfer: 0 });
    const recovery = buildMarkRecovery({ mistakes: ms, attempts: [], questions, now: NOW });
    const mis = buildExamMissions({ mistakes: ms, recovery, daysToExam: 30, unseenByTopic: {}, supplyByTopic: supply })[0]!;
    for (const stage of ["apply", "delayed-proof"] as const) {
      const session = buildMissionSession(mis, { questions, attempts: [], mistakes: ms }, stage);
      expect(session.questionIds).toEqual([]);
      expect(session.steps.some((st) => /proves the marks are back/.test(st.why))).toBe(false);
      expect(session.limit).toBeTruthy();
    }
    // Practice is still served: reference content is practice-only, not hidden.
    expect(buildMissionSession(mis, { questions, attempts: [], mistakes: ms }, "practise").questionIds.length).toBeGreaterThan(0);
  });

  it("builds a delayed check from questions unlike anything answered so far", () => {
    const m0 = mission();
    const used = new Set(["physics-circuits-0", "physics-circuits-1"]);
    const session = buildMissionSession(m0, { questions: base.questions, attempts: base.attempts, mistakes: base.mistakes }, "delayed-proof");
    expect(session.steps[0]?.hintBudget).toBe(0);
    for (const id of session.questionIds) expect(used.has(id)).toBe(false);
  });
});

describe("learner-specific effectiveness", () => {
  const chain = (i: number, intervention: string, cause: string | null, gain: number, durable = true): MissionChain => ({
    missionId: `m${i}${intervention}${cause}`, intervention, cause, subjectId: PHY, baseline: 0.3, immediate: 0.6, differentQuestion: 0.6, transfer: null,
    delayed: 0.3 + gain, delayedMarks: 3, minutes: 10, durable, gain: durable ? gain : null,
  });
  const many = (n: number, intervention: string, cause: string | null, gain: number) => Array.from({ length: n }, (_, i) => chain(i, intervention, cause, gain));

  it("falls back from learner+cause to learner to neutral, never personalising from tiny samples", () => {
    const q1 = { kind: "technique-intervention" as const, cause: "unit-error" };
    expect(estimateEffectiveness({}, q1)).toMatchObject({ level: "neutral", weight: 1, uncertainty: "none" });
    const tiny = estimateEffectiveness({ chains: many(3, "technique-intervention", "unit-error", 0.5) }, q1);
    expect(tiny.weight).toBe(1);
    expect(tiny.level).toBe("neutral");
    expect(tiny.uncertainty).toBe("high");
    const learner = estimateEffectiveness({ chains: many(6, "technique-intervention", "arithmetic-slip", 0.4) }, q1);
    expect(learner.level).toBe("learner");
    const exact = estimateEffectiveness({ chains: [...many(6, "technique-intervention", "unit-error", 0.4), ...many(6, "technique-intervention", "arithmetic-slip", -0.2)] }, q1);
    expect(exact.level).toBe("learner-cause");
    expect(exact.weight).toBeGreaterThan(1);
    const pop = estimateEffectiveness({ population: { "technique-intervention": 1.1 } }, q1);
    expect(pop.level).toBe("population");
  });

  it("reduces a method that keeps failing and states a comparison only with enough durable chains", () => {
    const chains = [...many(6, "misconception-correction", "unit-error", -0.3), ...many(6, "technique-intervention", "unit-error", 0.35)];
    expect(estimateEffectiveness({ chains }, { kind: "misconception-correction", cause: "unit-error" }).weight).toBeLessThan(1);
    const claims = effectivenessClaims(chains);
    expect(claims[0]).toMatch(/unit errors.*technique.*misconception/s);
    expect(effectivenessClaims([...many(3, "misconception-correction", "unit-error", -0.3), ...many(3, "technique-intervention", "unit-error", 0.35)])).toEqual([]);
    expect(effectivenessClaims(chains.map((c) => ({ ...c, durable: false, gain: null })))).toEqual([]);
  });

  it("rebuilds a mission chain from attributed attempts, counting only independent verified different-question answers", () => {
    const questions = bank(PHY, "circuits", 8);
    const ms = [m("u1", PHY, "circuits", "physics-circuits-0", { marksLost: 3, attemptId: "src" })];
    const ctx = (stage: "repair" | "apply" | "delayed-proof") => ({ missionId: "mission:x", stage, intervention: stage === "repair" ? "technique-intervention" : "independent-set", targetCause: "unit-error", sourceMistakeIds: ["u1"] });
    const attempts = [
      a("src", PHY, "circuits", "physics-circuits-0", 0, iso("2026-09-10")),
      a("r", PHY, "circuits", "physics-circuits-1", 2, iso("2026-09-11"), { mission: ctx("repair"), hintTier: "cue" }),
      a("p", PHY, "circuits", "physics-circuits-2", 3, iso("2026-09-12"), { mission: ctx("apply") }),
      a("d", PHY, "circuits", "physics-circuits-3", 3, iso("2026-09-20"), { mission: ctx("delayed-proof") }),
    ];
    const [c] = missionChains({ attempts, mistakes: ms, questions });
    expect(c).toMatchObject({ intervention: "technique-intervention", cause: "unit-error", durable: true });
    expect(c!.gain).toBeCloseTo(1, 5);
    const hinted = attempts.map((x) => (x.id === "d" ? { ...x, hintTier: "cue" as const } : x));
    expect(missionChains({ attempts: hinted, mistakes: ms, questions })[0]!.durable).toBe(false);
  });
});

describe("marks recovered narrative", () => {
  const questions = bank(MATHS, "calculus", 6);
  const ms = [m("m1", MATHS, "calculus", "maths-calculus-0", { marksLost: 4, createdAt: iso("2026-09-10"), attemptId: "att-m1", ao: "AO2" }), m("m2", MATHS, "calculus", "maths-calculus-1", { marksLost: 2, createdAt: iso("2026-09-10"), attemptId: "att-m2" })];
  const ctx = { missionId: "mission:x", stage: "apply" as const, intervention: "independent-set", targetCause: "unit-error", sourceMistakeIds: ["m1"] };
  const attempts = [
    a("att-m1", MATHS, "calculus", "maths-calculus-0", 0, iso("2026-09-10")), a("att-m2", MATHS, "calculus", "maths-calculus-1", 0, iso("2026-09-10")),
    a("s1", MATHS, "calculus", "maths-calculus-2", 3, iso("2026-09-30"), { mission: ctx }),
  ];
  const r = buildMarkRecovery({ mistakes: ms, attempts, questions, now: NOW });

  it("summarises the week without counting activity as recovery", () => {
    const week = recoveryWindow(r.items, NOW, 7);
    expect(week.targeted).toBe(6);
    expect(week.provisional).toBe(6);
    expect(week.proven).toBe(0);
    expect(weekLines(week)).toEqual(["6 marks targeted", "6 marks provisionally recovered", "0 marks independently proven"]);
    expect(recoveryWindow(r.items, new Date("2026-12-01T00:00:00Z"), 7).empty).toBe(true);
  });

  it("lets the student see where marks came from", () => {
    const bySubject = recoveryBreakdown({ items: r.items, mistakes: ms, attempts, by: "subject" });
    expect(bySubject[0]).toMatchObject({ key: MATHS, lost: 6 });
    const byIntervention = recoveryBreakdown({ items: r.items, mistakes: ms, attempts, by: "intervention" });
    expect(byIntervention.find((x) => x.key === "independent-set")?.awaitingProof).toBe(6);
    expect(recoveryBreakdown({ items: r.items, mistakes: ms, attempts, by: "ao" }).map((x) => x.key)).toEqual(expect.arrayContaining(["AO2", "none"]));
    expect(recoveryBreakdown({ items: r.items, mistakes: ms, attempts, by: "cause" })[0]!.label).toMatch(/unit/);
  });
});

describe("paper recovery diagnosis", () => {
  it("separates knowledge from technique, flags repeats across papers and weakly evidenced areas", () => {
    const questions = [...bank(PHY, "circuits", 4), ...bank(PHY, "fields", 4)];
    const ms = [
      m("a", PHY, "circuits", "physics-circuits-0", { marksLost: 3, attemptId: "pa", createdAt: iso("2026-09-10") }),
      m("b", PHY, "fields", "physics-fields-0", { marksLost: 2, attemptId: "pb", category: "recall", workingErrorKind: undefined, createdAt: iso("2026-09-10") }),
      m("c", PHY, "circuits", "physics-circuits-1", { marksLost: 3, attemptId: "pc", createdAt: iso("2026-08-10") }),
    ];
    const attempts = [
      a("pa", PHY, "circuits", "physics-circuits-0", 0, iso("2026-09-10"), { paperId: "p1" }), a("pb", PHY, "fields", "physics-fields-0", 0, iso("2026-09-10"), { paperId: "p1" }),
      a("pf", PHY, "fields", "physics-fields-2", 3, iso("2026-09-10"), { paperId: "p1" }), a("pc", PHY, "circuits", "physics-circuits-1", 0, iso("2026-08-10"), { paperId: "p0" }),
    ];
    const recovery = buildMarkRecovery({ mistakes: ms, attempts, questions, now: NOW });
    const r = buildPaperRecovery({ paperId: "p1", title: "Paper 1", mistakes: ms, recovery, attempts, questions })!;
    expect(r.diagnosis.highestValue[0]).toMatchObject({ topicId: "circuits", marks: 3 });
    expect(r.diagnosis.techniqueMarks).toBe(3);
    expect(r.diagnosis.knowledgeMarks).toBe(2);
    expect(r.diagnosis.carelessMarks).toBe(3);
    expect(r.diagnosis.repeatedAcrossPapers[0]).toMatchObject({ otherPapers: 1 });
    expect(r.diagnosis.weaklyEvidencedTopics).toContain("fields");
  });
});

describe("end-to-end journeys", () => {
  const subjectIds = [MATHS];
  const questions = bank(MATHS, "calculus", 10);
  const ctx = (stage: "repair" | "practise" | "apply" | "delayed-proof", missionId: string) => ({ missionId, stage, intervention: "technique-intervention", targetCause: "unit-error", sourceMistakeIds: ["m1", "m2"] });
  const mistakes = [
    m("m1", MATHS, "calculus", "maths-calculus-0", { marksLost: 3, createdAt: iso("2026-09-10"), attemptId: "src1" }),
    m("m2", MATHS, "calculus", "maths-calculus-1", { marksLost: 3, createdAt: iso("2026-09-11"), attemptId: "src2" }),
  ];
  const source = [a("src1", MATHS, "calculus", "maths-calculus-0", 0, iso("2026-09-10")), a("src2", MATHS, "calculus", "maths-calculus-1", 0, iso("2026-09-11"))];
  const view = (attempts: Attempt[], now: Date) => {
    const input = engine({ questions, mistakes, attempts, subjectIds, examDates: [exam(MATHS, 40)], now });
    const recovery = buildMarkRecovery({ mistakes, attempts, questions, now });
    return { plan: rankRevisionActions({ ...input, recovery, now }), recovery };
  };

  it("mistake recovery: lost marks → mission → repair → awaiting proof → proven → regression → reopened", () => {
    // 1–4: marks lost, classified, a mission appears.
    let { plan, recovery } = view(source, NOW);
    expect(plan.top!.type).toBe("recurring-error");
    expect(plan.top!.mission!.stage).toBe("repair");
    const missionId = plan.top!.mission!.id;
    expect(recovery.totals.open).toBe(6);
    expect(plan.top!.proofStatus).toBe("needs-work");
    // 5–6: targeted repair, supported answer improves (hinted, so provisional at best).
    let attempts = [...source, a("r1", MATHS, "calculus", "maths-calculus-2", 3, iso("2026-09-12"), { mission: ctx("repair", missionId), hintTier: "cue" })];
    ({ plan, recovery } = view(attempts, new Date("2026-09-13T09:00:00Z")));
    expect(recovery.totals.proven).toBe(0);
    expect(plan.top!.mission!.stage).not.toBe("repair");
    // 7–8: a different independent question succeeds → awaiting proof, not proven.
    attempts = [...attempts, a("i1", MATHS, "calculus", "maths-calculus-3", 3, iso("2026-09-13"), { mission: ctx("apply", missionId) })];
    ({ plan, recovery } = view(attempts, new Date("2026-09-14T09:00:00Z")));
    expect(recovery.totals.awaitingProof).toBe(6);
    expect(recovery.totals.proven).toBe(0);
    expect(plan.deferred.some((d) => /Waiting for the delay/.test(d.reason))).toBe(true);
    expect(plan.actions.some((x) => x.type === "proof-check")).toBe(false);
    // 9–10: after the delay a proof check is offered; passing it proves the marks.
    ({ plan } = view(attempts, new Date("2026-09-20T09:00:00Z")));
    expect(plan.top!.type).toBe("proof-check");
    attempts = [...attempts, a("d1", MATHS, "calculus", "maths-calculus-4", 3, iso("2026-09-21"), { mission: ctx("delayed-proof", missionId) })];
    ({ plan, recovery } = view(attempts, new Date("2026-09-22T09:00:00Z")));
    expect(recovery.totals.proven).toBe(6);
    expect(plan.actions.some((x) => x.mission?.id === missionId)).toBe(false);
    // 11–12: a later failure reopens recovery.
    attempts = [...attempts, a("f1", MATHS, "calculus", "maths-calculus-5", 0, iso("2026-10-01"))];
    ({ plan, recovery } = view(attempts, new Date("2026-10-02T09:00:00Z")));
    expect(recovery.totals.regressed).toBeGreaterThan(0);
    expect(plan.top!.type).toBe("regression-recovery");
  });

  it("paper recovery: paper → autopsy → mission → repair → equivalent retest → delayed proof → closed", () => {
    const pq = [...bank(MATHS, "calculus", 8), ...bank(MATHS, "algebra", 8)];
    const ms = [
      m("a1", MATHS, "calculus", "maths-calculus-0", { marksLost: 3, attemptId: "pa1", createdAt: iso("2026-09-10") }),
      m("a2", MATHS, "algebra", "maths-algebra-0", { marksLost: 3, attemptId: "pa2", createdAt: iso("2026-09-10") }),
    ];
    const paper = [a("pa1", MATHS, "calculus", "maths-calculus-0", 0, iso("2026-09-10"), { paperId: "P" }), a("pa2", MATHS, "algebra", "maths-algebra-0", 0, iso("2026-09-10"), { paperId: "P" })];
    const stageOf = (attempts: Attempt[], now: Date) => {
      const recovery = buildMarkRecovery({ mistakes: ms, attempts, questions: pq, now });
      return buildPaperRecovery({ paperId: "P", title: "2025 Unit 1", mistakes: ms, recovery, attempts, questions: pq })!;
    };
    expect(stageOf(paper, NOW).stage).toBe("autopsy");
    const missions = collectMissions({ ...engine({ questions: pq, mistakes: ms, attempts: paper, subjectIds, examDates: [exam(MATHS, 40)] }) });
    expect(missions.some((x) => x.origin === "paper" && x.paperId === "P")).toBe(true);
    const first = [...paper, a("e1", MATHS, "calculus", "maths-calculus-1", 3, iso("2026-09-12")), a("e2", MATHS, "algebra", "maths-algebra-1", 3, iso("2026-09-12"))];
    expect(stageOf(first, new Date("2026-09-13T09:00:00Z")).stage).toBe("delayed-verification");
    const later = [...first, a("e3", MATHS, "calculus", "maths-calculus-2", 3, iso("2026-09-20")), a("e4", MATHS, "algebra", "maths-algebra-2", 3, iso("2026-09-20"))];
    const done = stageOf(later, new Date("2026-09-21T09:00:00Z"));
    expect(done.stage).toBe("closed");
    expect(done.totals.proven).toBe(6);
    // Revision activity alone never closes it.
    const sameQuestionOnly = [...paper, a("x1", MATHS, "calculus", "maths-calculus-0", 3, iso("2026-09-12")), a("x2", MATHS, "algebra", "maths-algebra-0", 3, iso("2026-09-20"))];
    expect(stageOf(sameQuestionOnly, new Date("2026-09-21T09:00:00Z")).stage).not.toBe("closed");
  });
});

describe("evidence classes and vocabulary", () => {
  it("keeps engineering validation apart from real-world evidence and never counts fixtures", async () => {
    const { realWorldEvidence, EVIDENCE_SOURCE_CLASS } = await import("@/domain/evidence-class");
    expect(EVIDENCE_SOURCE_CLASS["recommender-tournament"]).toBe("engineering-validation");
    expect(EVIDENCE_SOURCE_CLASS["recommendation-audit"]).toBe("real-world-evidence");
    const empty = realWorldEvidence({ attempts: [], mistakes: [], questions: [], interventionOutcomes: [], paperOutcomes: [] });
    expect(empty.sufficient).toBe(false);
    expect(empty.statement).toMatch(/still limited/);
    expect(empty.statement).toMatch(/Benchmarks and fixtures do not count/);
    expect(empty.rows.every((r) => r.count === 0)).toBe(true);
  });

  it("uses the six learner words for missions and recovery states", async () => {
    const { missionLearnerState, recoveryLearnerState, LEARNER_STATE_LABEL } = await import("@/domain/learner-state");
    const words = new Set(Object.values(LEARNER_STATE_LABEL));
    for (const status of ["not-started", "active", "awaiting-proof", "proven", "regressed", "blocked"] as const) expect(words.has(LEARNER_STATE_LABEL[missionLearnerState(status)])).toBe(true);
    expect(recoveryLearnerState("provisional")).toBe("improving");
    expect(recoveryLearnerState("targeted")).toBe("needs-work");
    expect(missionLearnerState("blocked")).toBe("needs-work");
    // Worked on but nothing has succeeded: not "improving".
    expect(missionLearnerState("active", { provisional: 0, awaitingProof: 0, proven: 0 })).toBe("needs-work");
    expect(missionLearnerState("active", { provisional: 3, awaitingProof: 0, proven: 0 })).toBe("improving");
  });

  it("closes a session with the standing marks position", async () => {
    const { buildSessionEvidence } = await import("@/domain/session-evidence");
    const { summariseRecovery } = await import("@/domain/mark-recovery");
    const none = summariseRecovery([], 0);
    const after = summariseRecovery([{ mistakeId: "x", topicId: "t", subjectId: "s", marks: 4, state: "awaiting-proof", reason: "" }, { mistakeId: "y", topicId: "t", subjectId: "s", marks: 2, state: "open", reason: "" }], 4);
    const s = buildSessionEvidence({ attempts: [], before: none, after });
    expect(s.marks).toEqual(expect.arrayContaining(["6 marks previously lost", "4 marks awaiting delayed proof", "0 marks proven recovered"]));
    expect(buildSessionEvidence({ attempts: [], before: none, after: none }).marks).toEqual([]);
  });
});

describe("due reviews are not a second decision", () => {
  it("does not offer a separate review for cards the adaptive session already retrieves", () => {
    const s = scenario();
    const adaptive = { subjectId: BIO, topicId: "cells", topicTitle: "cells", totalMinutes: 20, startHref: "/adaptive-session?topic=cells&start=1", reason: "r", score: 1, evidence: { dueCount: 16, dueCardIds: Array.from({ length: 16 }, (_, i) => `c${i}`), openMistakeIds: [], overdueCount: 0, openMistakes: 0, marksLost: 0, mastery: 0.5, retention: 0.5, daysSinceStudy: null, daysToExam: null, examUrgency: 0, questionCount: 0, attempts: 0, focus: "recall", focusState: "unknown", factors: {} } } as never;
    const base = engine({ ...s, subjectIds: [BIO], mistakes: [], attempts: [], adaptive, dueReviews: [{ subjectId: BIO, count: 16, overdue: 0 }] });
    expect(rankRevisionActions(base).actions.some((x) => x.type === "due-reviews")).toBe(false);
    const backlog = rankRevisionActions({ ...base, dueReviews: [{ subjectId: BIO, count: 90, overdue: 80 }] });
    expect(backlog.actions.some((x) => x.type === "due-reviews")).toBe(true);
    // A normal day's reviews never outrank the session that already includes retrieval.
    expect(rankRevisionActions({ ...base, dueReviews: [{ subjectId: BIO, count: 22, overdue: 0 }] }).top!.type).not.toBe("due-reviews");
    expect(backlog.top!.type).toBe("due-reviews");
    expect(rankRevisionActions(base).top!.route.href).toBe("/adaptive-session?topic=cells&start=1");
  });
});

describe("honest copy and consistent minutes", () => {
  it("says no marks are recovered yet instead of an empty range", () => {
    const r = buildMarkRecovery({ mistakes: [mkMistake("m1")], attempts: [], questions: [mkQuestion("q-a1", "algebra")], now: NOW }).totals;
    expect(r.statement).toBe("No marks recovered yet: 3 marks still open.");
  });

  it("shows the minutes the mission session will actually take", () => {
    const s = scenario();
    const input = engine({ ...s, subjectIds: [PHY] });
    const top = rankRevisionActions(input).top!;
    const mission = collectMissions(input).find((x) => x.id === top.mission!.id)!;
    expect(top.minutes).toBe(Math.max(3, Math.ceil(buildMissionSession(mission, { questions: s.questions, attempts: s.attempts, mistakes: input.mistakes }, top.mission!.stage).minutes)));
  });
});

describe("mission sessions do not leave a stale resume point", () => {
  it("keeps the generic practice queue from saving a checkpoint while a mission runs", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync("src/app/practice/page.tsx", "utf8");
    expect(src).toContain('const missionActive = Boolean(params.get("mission")) || recover || Boolean(autopsyRun) || weakExam || quickMinutes !== null;');
    expect(src).toMatch(/if \(missionActive\) return;\s+if \(closed \|\| !current\)/);
  });
});

describe("available session length", () => {
  const ids = (plan: ReturnType<typeof rankRevisionActions>) => plan.actions.map((x) => x.id);

  it("leaves ranking identical when the budget fits everything", () => {
    const s = scenario();
    const subjects = [PHY, BIO, MATHS, CHEM] as const;
    const base = rankRevisionActions(engine({ ...s, subjectIds: [...subjects] }));
    const ample = rankRevisionActions(engine({ ...s, subjectIds: [...subjects], availableMinutes: 1_000_000 }));
    expect(ids(ample)).toEqual(ids(base));
    expect(ample.top?.id).toBe(base.top?.id);
    expect(ample.deferred.map((d) => d.action.id)).toEqual(base.deferred.map((d) => d.action.id));
  });

  it("never empties Today for a very short session", () => {
    const s = scenario();
    const subjects = [PHY, BIO, MATHS, CHEM] as const;
    const full = rankRevisionActions(engine({ ...s, subjectIds: [...subjects] }));
    const tiny = rankRevisionActions(engine({ ...s, subjectIds: [...subjects], availableMinutes: 1 }));
    expect(tiny.top).not.toBeNull();
    expect(tiny.actions.length).toBeGreaterThan(0);
    // Either every kept action fits the minute, or nothing fit and the
    // ranking stands unchanged with durations shown honestly.
    const over = tiny.actions.filter((a) => a.minutes > 3);
    expect(over.length === 0 || ids(tiny).join() === ids(full).join()).toBe(true);
  });
});
