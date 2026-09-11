import { describe, expect, it } from "vitest";
import { wjecCapabilities } from "@/content/capabilities";
import { wjecRepairDepthQuestions as rawBank } from "@/content/questions/wjec-repair-depth";
import { contentQuestionSchema } from "@/content/schema";
import { allTopics } from "@/domain/curriculum";
import { deriveSkillEvidence, smallestUnprovenCapability, validateCapabilityGraph } from "@/domain/capability-graph";
import { advanceMistakeRepair, REPAIR_RETENTION_DELAY_MS } from "@/domain/repair-evidence";
import { mistakesFromAttempt } from "@/domain/mistakes";
import { repairProgress } from "@/domain/mistake-repair";
import { independentAttempt, isTransferQuestion, unseenQuestion } from "@/domain/learning-evidence";
import { selectLearningAction } from "@/domain/learning-action";
import { auditLearningDepth } from "@/domain/learning-depth";
import { buildAdaptiveSession, replanAdaptiveSession } from "@/domain/adaptive-session";
import { markPart } from "@/domain/marking";
import { applyHumanVerification, physicsContentFingerprint } from "@/domain/physics-content-review";
import type { Attempt, Question } from "@/domain/types";

// The trust gate now covers all four WJEC flagships, so the repair bank must
// carry test-only human approvals before it can move repair evidence. No
// production content is approved by these fixtures.
const approve = (question: Question): Question => applyHumanVerification(question, {
  status: "approved", reviewerId: "test-only", reviewedAt: "2026-09-08T00:00:00Z",
  contentFingerprint: physicsContentFingerprint(question),
  checks: { question: true, marking: true, workedSolution: true, capabilityMapping: true, specificationMapping: true, examRealism: true },
});
const bank: Question[] = rawBank.map(approve);

const START = Date.parse("2026-09-08T09:00:00Z");
const q = (slug: string) => bank.find((item) => item.id === `cnt:question:repair-depth-${slug}`)!;
function answer(question: Question, id: string, offset: number, overrides: Partial<Attempt> = {}): Attempt {
  return { id, userId: "learner", questionId: question.id, subjectId: question.subjectId,
    topicIds: question.topicIds, answers: Object.fromEntries(question.parts.map((p) => [p.id, p.modelAnswer])),
    marked: question.parts.map((p) => ({ partId: p.id, awarded: p.marks, max: p.marks, creditedPoints: p.markScheme, missedPoints: [], comment: "" })),
    awarded: question.totalMarks, max: question.totalMarks, feedback: "", markedBy: "rubric", elapsedMs: 90_000,
    mode: "practice", createdAt: new Date(START + offset).toISOString(), ...overrides };
}
function setup() {
  const source = q("bio-inhibitor-recall");
  const original = answer(source, "original", 0);
  original.awarded = 0;
  original.marked = source.parts.map((p) => ({ partId: p.id, awarded: 0, max: p.marks, creditedPoints: [], missedPoints: p.markScheme, comment: "" }));
  let nextId = 0;
  const mistake = mistakesFromAttempt(original, source, () => `id-${++nextId}`, new Date(START))[0]!.mistake;
  return { source, original, mistake };
}
function progressed() {
  const { source, original, mistake } = setup();
  const guided = answer(source, "guided", 60_000, { repairTeachingSeen: true, retestMistakeId: mistake.id });
  const m1 = advanceMistakeRepair(mistake, source, guided, [original], bank);
  const independent = answer(q("bio-inhibitor-application"), "independent", 120_000);
  const m2 = advanceMistakeRepair(m1, q("bio-inhibitor-application"), independent, [original, guided], bank);
  const transfer = answer(q("bio-inhibitor-transfer"), "transfer", 180_000);
  const m3 = advanceMistakeRepair(m2, q("bio-inhibitor-transfer"), transfer, [original, guided, independent], bank);
  return { source, original, mistake, guided, independent, transfer, m1, m2, m3, history: [original, guided, independent, transfer] };
}

describe("durable mistake repair", () => {
  it("requires guided, unseen independent, transfer and a full seven-day delay in order", () => {
    const { m1, m2, m3, history } = progressed();
    expect(m1.repair?.stage).toBe("guided-success");
    expect(m2.repair?.stage).toBe("independent-success");
    expect(m3.repair?.stage).toBe("transfer");
    expect([m1, m2, m3].every((m) => !m.resolved)).toBe(true);
    const later = answer(q("bio-inhibitor-retention"), "retention", 180_000 + REPAIR_RETENTION_DELAY_MS);
    const resolved = advanceMistakeRepair(m3, q("bio-inhibitor-retention"), later, history, bank);
    expect(resolved.resolved).toBe(true);
    expect(repairProgress(resolved).canClose).toBe(true);
    expect(resolved.repair?.evidence.map((e) => e.stage)).toEqual(["detected", "diagnosed", "taught", "guided-success", "independent-success", "transfer", "delayed-retention", "resolved"]);
  });
  it("does not turn a perfect same-question retry into independent evidence", () => {
    const { source, m1, history } = progressed();
    const retry = answer(source, "retry", 200_000);
    expect(advanceMistakeRepair(m1, source, retry, history, bank).repair?.stage).toBe("guided-success");
  });
  it.each(["cue", "prompt", "scaffold", "worked-solution"] as const)("%s support cannot prove independent success", (hintTier) => {
    const { m1, history } = progressed();
    const attempt = answer(q("bio-inhibitor-data"), "hinted", 200_000, { hintTier });
    expect(advanceMistakeRepair(m1, q("bio-inhibitor-data"), attempt, history, bank).repair?.stage).toBe("guided-success");
    expect(independentAttempt(attempt)).toBe(false);
  });
  it("viewing a complete solution does not count as guided success", () => {
    const { mistake, source, original } = setup();
    const copied = answer(source, "copied", 60_000, { hintTier: "worked-solution" });
    expect(advanceMistakeRepair(mistake, source, copied, [original], bank).repair?.stage).toBe("taught");
  });
  it("restarts the retention clock after an early rehearsal", () => {
    const { m3, history } = progressed();
    const early = answer(q("bio-inhibitor-retention"), "early", 180_000 + REPAIR_RETENTION_DELAY_MS - 1);
    const updated = advanceMistakeRepair(m3, q("bio-inhibitor-retention"), early, history, bank);
    expect(updated.resolved).toBe(false);
    expect(Date.parse(updated.repair!.dueAt!)).toBe(Date.parse(early.createdAt) + REPAIR_RETENTION_DELAY_MS);
  });
  it("reopens the diagnosis after a later failure", () => {
    const { m3, history } = progressed();
    const item = q("bio-inhibitor-retention");
    const fail = answer(item, "failed-later", REPAIR_RETENTION_DELAY_MS + 200_000);
    fail.awarded = 0;
    fail.marked = fail.marked.map((p) => ({ ...p, awarded: 0, creditedPoints: [], missedPoints: item.parts[0]!.markScheme }));
    const updated = advanceMistakeRepair(m3, item, fail, history, bank);
    expect(updated.repair?.stage).toBe("diagnosed");
    expect(updated.repair?.dueAt).toBeUndefined();
    expect(updated.resolved).toBe(false);
  });
  it("ignores duplicate, stale, uncertain and other-user attempts", () => {
    const { m1, source, guided, history } = progressed();
    expect(advanceMistakeRepair(m1, source, guided, history, bank)).toBe(m1);
    const uncertain = answer(source, "uncertain", 200_000, { markedBy: "self" });
    expect(advanceMistakeRepair(m1, source, uncertain, history, bank)).toBe(m1);
    expect(advanceMistakeRepair(m1, source, { ...uncertain, markedBy: "rubric", userId: "other" }, history, bank)).toBe(m1);
    expect(advanceMistakeRepair(m1, source, { ...guided, id: "stale", createdAt: new Date(START - 1).toISOString() }, history, bank)).toBe(m1);
  });
  it("does not award repair from another skill in the same topic", () => {
    const { m1, history } = progressed();
    const item = q("bio-site-probe");
    expect(advanceMistakeRepair(m1, item, answer(item, "unrelated", 200_000), history, bank)).toBe(m1);
  });
  it("treats a reskinned question family as familiar", () => {
    const { independent } = progressed();
    const variant = { ...q("bio-inhibitor-application"), id: "variant" };
    expect(unseenQuestion(variant, [independent], [...bank, variant])).toBe(false);
  });
  it("does not label a hard or past-paper question as transfer without authored evidence", () => {
    expect(isTransferQuestion({ ...q("bio-inhibitor-application"), difficulty: 5, origin: "past-paper", learning: undefined })).toBe(false);
  });
});

describe("smallest skill diagnosis and live action choice", () => {
  it("validates the prerequisite graph and detects a cycle", () => {
    expect(validateCapabilityGraph(wjecCapabilities)).toEqual([]);
    const first = wjecCapabilities[0]!;
    expect(validateCapabilityGraph([{ ...first, prerequisites: [first.id] }])).toContain(`Cycle at ${first.id}`);
  });
  it("does not infer another skill's strength from the overall question score", () => {
    const item = q("bio-inhibitor-application");
    const report = deriveSkillEvidence(wjecCapabilities, bank, [answer(item, "a", 0)]);
    expect(report.get("bio.active-site")?.state).toBe("unknown");
    expect(report.get("bio.inhibition")?.accuracy).toBe(1);
  });
  it("counts duplicate and same-family independent encounters only once", () => {
    const item = q("bio-inhibitor-application");
    const a = answer(item, "a", 0);
    const report = deriveSkillEvidence(wjecCapabilities, bank, [a, a, { ...a, id: "b" }]);
    expect(report.get("bio.inhibition")?.independentFamilies).toBe(1);
    expect(report.get("bio.inhibition")?.state).toBe("developing");
  });
  it("probes an unmeasured prerequisite before diagnosing the target as weak", () => {
    const report = deriveSkillEvidence(wjecCapabilities, bank, []);
    expect(smallestUnprovenCapability(["bio.inhibition"], wjecCapabilities, report)?.id).toBe("bio.active-site");
  });
  it("chooses a due retention check and returns a disclosed policy prior", () => {
    const { m3, history } = progressed();
    const attempts = [...history, answer(q("bio-site-probe"), "site", -2000), answer(q("bio-saturation-probe"), "sat", -1000)];
    const action = selectLearningAction({ topicId: m3.topicId, nodes: wjecCapabilities, questions: bank, attempts, mistakes: [m3], now: new Date(START + 180_000 + REPAIR_RETENTION_DELAY_MS) });
    expect(action?.kind).toBe("retention");
    expect(action?.calibrated).toBe(false);
    expect(action?.teaching).toBe(false);
  });
  it("does not bring a retention check forward to fill a session", () => {
    const { m3, history } = progressed();
    const action = selectLearningAction({ topicId: m3.topicId, nodes: wjecCapabilities, questions: bank, attempts: history, mistakes: [m3], now: new Date(START + 200_000) });
    expect(action?.kind).not.toBe("retention");
    expect(action?.capabilityId).not.toBe("bio.inhibition");
  });
  it("enforces the remaining time budget", () => {
    expect(selectLearningAction({ topicId: "wjec-alevel-biology.enzymes", nodes: wjecCapabilities, questions: bank, attempts: [], mistakes: [], now: new Date(START), remainingMinutes: 0.1 })).toBeUndefined();
  });
  it("integrates the mapped policy into the actual session planner and replanner", () => {
    const topic = allTopics().find((t) => t.id === "wjec-alevel-biology.enzymes")!;
    const plan = buildAdaptiveSession({ topics: [topic], questions: bank, cards: [], reviewLogs: [], attempts: [], mistakes: [], mastery: [], exams: [], subjectIds: [topic.subjectId], now: new Date(START) })!;
    expect(plan.learningPolicy).toBe("capability-evidence-v1");
    expect(plan.steps[0]?.capabilityId).toBe("bio.active-site");
    const step = plan.steps[0]!;
    const item = bank.find((q) => q.id === step.questionIds[0])!;
    const attempt = answer(item, "first-check", 60_000);
    const next = replanAdaptiveSession({ plan, completed: [{ stepId: step.id, kind: step.kind, minutes: step.minutes, result: "passed-independent", awardedMarks: attempt.awarded, maxMarks: attempt.max, hintTier: null, itemId: item.id, elapsedMs: 60_000 }], questions: bank, cards: [], mistakes: [], attempts: [attempt], now: new Date(START + 60_000) });
    expect(next.steps[0]?.questionIds).not.toContain(item.id);
    expect(next.steps[0]?.capabilityId).toBe("bio.saturation");
  });
});

describe("WJEC content depth and trust", () => {
  it("credits valid later working after an arithmetic slip without restoring the lost accuracy mark", () => {
    const part = q("phys-drag-calculation").parts[0]!;
    const marked = markPart(part, "F = 4.90 - 3.40 = 2.50 N\na = 2.50 / 0.50 = 5.0 m s⁻²");
    expect(marked.awarded).toBe(4);
    expect(marked.evidence?.[1]?.status).toBe("missed");
    expect(marked.evidence?.[2]?.explanation).toContain("error carried forward");
  });
  it("separates unit and precision marks from the numerical method", () => {
    const part = q("phys-drag-calculation").parts[0]!;
    const marked = markPart(part, "F = 4.90 - 3.40 = 1.50 N\na = 1.50 / 0.50 = 3 kg");
    expect(marked.awarded).toBe(3);
    expect(marked.evidence?.[3]?.status).toBe("missed");
    expect(marked.evidence?.[4]?.status).toBe("missed");
  });
  it("requests review for ambiguous working and does not award method marks for a coincidental number", () => {
    const part = q("phys-drag-calculation").parts[0]!;
    expect(markPart(part, "F = 1.50 + 0 = 1.50 N\na = 1.50 / 0.50 = 3.0 m s⁻²").awarded).toBe(4);
    expect(markPart(part, "The acceleration is about three").comment).toContain("provisional");
    const contradictory = markPart(part, "F = 4.9 - 3.4 = 1.50 N\nF = 5.0 N\na = F / 0.50 = 3.0 m s⁻²");
    expect(contradictory.evidence?.some((e) => e.status === "unreported")).toBe(true);
  });
  it("has forty individually authored mapped questions and no invented external verification", () => {
    expect(bank).toHaveLength(40);
    const ids = new Set(allTopics().flatMap((t) => t.specPoints?.map((p) => p.id) ?? []));
    for (const item of rawBank) {
      expect(contentQuestionSchema.safeParse(item).success, item.id).toBe(true);
      // No production content ships verified; the approvals above are test-only.
      expect(item.verification).toBe("unverified");
      for (const p of item.parts) {
        expect(p.learningClaims).toHaveLength(p.markScheme.length);
        p.specPointIds?.forEach((id) => expect(ids.has(id), id).toBe(true));
      }
    }
  });
  it.each(rawBank)("accepts the complete authored answer for $id", (item) => {
    for (const p of item.parts) expect(markPart(p, p.modelAnswer).awarded).toBe(p.marks);
  });
  it("reports real remaining specification and demand gaps", () => {
    const report = auditLearningDepth(allTopics().filter((t) => t.subjectId.startsWith("wjec-alevel-")), bank, wjecCapabilities);
    expect(report.statements).toBeGreaterThan(200);
    expect(report.statementsWithFullDepth).toBe(0);
    expect(report.rows.some((r) => r.capabilityIds.length && r.families.transfer >= 2)).toBe(true);
    // Every statement now maps to a capability, so the honest gap signal is a
    // statement with no authored question family for any demand.
    expect(report.rows.some((r) => r.gaps.length === 7)).toBe(true);
  });
});
