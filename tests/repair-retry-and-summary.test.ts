import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessLowConfidenceMark } from "@/domain/mark-escalation";
import type { RecoveryTotals } from "@/domain/mark-recovery";
import { missionRetryParts } from "@/domain/repair-evidence";
import { buildSessionEvidence } from "@/domain/session-evidence";
import type { Attempt, Mistake, Question } from "@/domain/types";

// A struggling student's journey after a wrong repair answer: the debt must
// not grow because a repair failed, the summary must not contradict itself,
// and a mark made on the device must not be described as an AI mark that a
// person will review.

const q = (id: string, points: string[], topic = "t1"): Question => ({
  id, subjectId: "s", topicIds: [topic], kind: "short", stem: `Stem ${id}`, totalMarks: 3, calculatorAllowed: true, difficulty: 2, origin: "seed", createdAt: "2026-01-01T00:00:00.000Z",
  parts: [{ id: `${id}.a`, label: "", prompt: "Explain.", marks: 3, markScheme: ["a", "b", "c"], modelAnswer: "a b c", specPointIds: points }],
} as unknown as Question);
const mistake = (id: string, questionId: string, over: Partial<Mistake> = {}): Mistake => ({
  id, userId: "u", subjectId: "s", topicId: "t1", questionId, partId: `${questionId}.a`, marksLost: 3, description: "", category: "recall", resolved: false, createdAt: "2026-11-01T10:00:00.000Z", ...over,
} as Mistake);
const mission = (stage: NonNullable<Attempt["mission"]>["stage"], ids: string[]): Attempt["mission"] => ({ missionId: "m", stage, intervention: null, targetCause: "missing-knowledge", sourceMistakeIds: ids });

describe("missionRetryParts", () => {
  const source = q("source", ["sp-02"]);
  const sibling = q("sibling", ["sp-02"]);
  const other = q("other", ["sp-05"], "t2");
  const sameTopic = q("same-topic-other-point", ["sp-05"]);
  const bank = [source, sibling, other, sameTopic];
  const open = [mistake("m1", "source")];

  it("a repair question on the same point is another go at the open mistake, not a new one", () => {
    expect([...missionRetryParts({ mission: mission("repair", ["m1"]), subjectId: "s" }, sibling, open, bank)]).toEqual(["sibling.a"]);
    expect([...missionRetryParts({ mission: mission("practise", ["m1"]), subjectId: "s" }, sibling, open, bank)]).toEqual(["sibling.a"]);
  });

  it("so is a question the mission serves from the mistake's topic, whatever point it is on", () => {
    // Supported practice is chosen by topic; its failures are the mission's work, not a second debt.
    expect(missionRetryParts({ mission: mission("practise", ["m1"]), subjectId: "s" }, sameTopic, open, bank).size).toBe(1);
  });

  it("a question from another topic on another point still opens its own mistake", () => {
    expect(missionRetryParts({ mission: mission("repair", ["m1"]), subjectId: "s" }, other, open, bank).size).toBe(0);
  });

  it("only supported mission stages count: an unaided check that fails is new evidence", () => {
    for (const stage of ["apply", "transfer", "delayed-proof", "diagnose"] as const) {
      expect(missionRetryParts({ mission: mission(stage, ["m1"]), subjectId: "s" }, sibling, open, bank).size, stage).toBe(0);
    }
    expect(missionRetryParts({ subjectId: "s" }, sibling, open, bank).size).toBe(0);
  });

  it("ignores resolved mistakes, mistakes the mission does not target and other subjects", () => {
    expect(missionRetryParts({ mission: mission("repair", ["m1"]), subjectId: "s" }, sibling, [mistake("m1", "source", { resolved: true })], bank).size).toBe(0);
    expect(missionRetryParts({ mission: mission("repair", ["mX"]), subjectId: "s" }, sibling, open, bank).size).toBe(0);
    expect(missionRetryParts({ mission: mission("repair", ["m1"]), subjectId: "s" }, { ...sibling, subjectId: "other" }, open, bank).size).toBe(0);
  });

  it("an untagged source is matched by its topic", () => {
    const untagged = q("untagged", []);
    const sameTopic = q("same-topic", []);
    const elsewhere = q("elsewhere", [], "t2");
    const mistakes = [mistake("m2", "untagged")];
    expect(missionRetryParts({ mission: mission("repair", ["m2"]), subjectId: "s" }, sameTopic, mistakes, [untagged, sameTopic, elsewhere]).size).toBe(1);
    expect(missionRetryParts({ mission: mission("repair", ["m2"]), subjectId: "s" }, elsewhere, mistakes, [untagged, sameTopic, elsewhere]).size).toBe(0);
  });

  it("the store drops those parts before creating mistakes and cards", () => {
    const store = readFileSync("src/state/store.tsx", "utf8");
    expect(store).toContain("missionRetryParts(attempt, question, snapshot?.mistakes ?? [], snapshot?.questions ?? [question])");
    expect(store).toContain("!retryParts.has(draft.mistake.partId)");
  });
});

const totals = (over: Partial<RecoveryTotals> = {}): RecoveryTotals => ({ previouslyLost: 12, targeted: 2, open: 12, provisional: 0, awaitingProof: 0, proven: 0, regressed: 0, evidence: "thin", ...over } as RecoveryTotals);
const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  id: "a", userId: "u", questionId: "q", subjectId: "s", topicIds: ["t1"], answers: {}, marked: [], awarded: 0, max: 3, feedback: "", markedBy: "rubric", elapsedMs: 1000, mode: "practice", createdAt: "2026-11-10T10:00:00.000Z", ...over,
} as Attempt);
const provisional = attempt({ markConfidence: 0.45, markEscalation: { status: "pending", reason: "low-confidence", priority: "standard", target: "human-review", confidence: 0.45, threshold: 0.6, requestedAt: "2026-11-10T10:00:00.000Z" } });

describe("session summary after answers that could not be counted", () => {
  it("does not say nothing was marked when an answer was marked provisionally", () => {
    const s = buildSessionEvidence({ attempts: [provisional], before: totals(), after: totals() });
    expect(s.headline.state).toBe("not-checked");
    expect(s.headline.text).not.toMatch(/Nothing was marked/);
    expect(s.headline.text).toMatch(/could not be sure of the mark/);
    expect(s.evidence.lines.join(" ")).toMatch(/1 answer has a provisional mark and is not counted either way/);
    expect(buildSessionEvidence({ attempts: [], before: totals(), after: totals() }).headline.text).toMatch(/Nothing was marked/);
  });

  it("does not promise to build on early success after a session that had none", () => {
    const standing = totals({ provisional: 1, open: 8 });
    expect(buildSessionEvidence({ attempts: [provisional], before: standing, after: standing }).next).toMatch(/another repair on the open mistakes/);
    // A session that did move a mark forward still says so.
    expect(buildSessionEvidence({ attempts: [attempt({ awarded: 3 })], before: totals(), after: totals({ provisional: 3, open: 9 }) }).next).toMatch(/turn early success into evidence/);
    // Nothing open: the standing success is the thing to build on.
    expect(buildSessionEvidence({ attempts: [attempt({ awarded: 3 })], before: standing, after: totals({ provisional: 1, open: 0 }) }).next).toMatch(/turn early success into evidence/);
  });

  it("counts helped answers in the singular and the plural", () => {
    const one = buildSessionEvidence({ attempts: [attempt({ hintTier: "cue" })], before: totals(), after: totals() });
    expect(one.evidence.lines).toContain("1 answer used help and counts as practice only");
    const two = buildSessionEvidence({ attempts: [attempt({ id: "a1", hintTier: "cue" }), attempt({ id: "a2", hintTier: "scaffold" })], before: totals(), after: totals() });
    expect(two.evidence.lines).toContain("2 answers used help and count as practice only");
  });
});

describe("an uncertain mark made on the device", () => {
  it("is not described as an AI mark or as sent for human review", () => {
    const device = assessLowConfidenceMark({ markedBy: "rubric", confidence: 0.45 });
    expect(device.escalate).toBe(true);
    expect(device.message).not.toMatch(/AI mark|human review/i);
    expect(device.message).toMatch(/left out of your progress either way/);
    // An AI mark names the AI marker, promises no review either, and the
    // record is the same either way.
    const ai = assessLowConfidenceMark({ markedBy: "ai", confidence: 0.45 });
    expect(ai.message).toMatch(/The AI marker was only 45% sure of this mark/);
    expect(ai.message).not.toMatch(/human review/i);
    expect({ ...device, message: "" }).toEqual({ ...ai, message: "" });
  });

  it("the marked result keeps a separate box for AI marks, and neither promises a review", () => {
    const view = readFileSync("src/components/QuestionMarkedResult.tsx", "utf8");
    expect(view).toContain("AI mark not counted");
    expect(view).not.toContain(">Human review requested<");
    expect(view).toContain('{result.escalation && result.source === "ai" ? (');
    expect(view).toContain('const deviceMarkUnsure = Boolean(result.escalation) && result.source !== "ai";');
  });
});

describe("Continue after a mission step", () => {
  it("starts a fresh run when the next step is the page already open", () => {
    const mode = readFileSync("src/components/MissionSessionMode.tsx", "utf8");
    expect(mode).toContain("sameMissionStep(plan.top.route.href, missionId, stage, session?.stage) ? { onStart: onRestart } : {}");
    expect(mode).toContain("<MissionSessionRun key={run}");
    const set = readFileSync("src/components/QuestionSetSession.tsx", "utf8");
    expect(set).toContain("nextStep.onStart ? (");
    expect(set).toContain("window.location.reload();");
  });
});
