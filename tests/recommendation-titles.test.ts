import { describe, expect, it } from "vitest";
import { buildMarkRecovery } from "@/domain/mark-recovery";
import { missionActionTitle, rankRevisionActions } from "@/domain/revision-engine";
import { unseenSupplyByTopic } from "@/domain/supply";
import type { Attempt, Mistake, Question } from "@/domain/types";
import { attempt as mkAttempt, FLAGSHIP_FIXTURE_SUBJECT, flagshipAttempt, flagshipMistake, flagshipQuestion, mistake as mkMistake, question as mkQuestion } from "./helpers-recovery";

// Today's headline read "Recover 3 marks: Recover Motion marks" (twenty-fifth
// pass audit, production build at 360px). A generic mission is titled
// "Recover <topic> marks" and the action prefixed it with its own
// "Recover N marks: ". Titles are now composed from the mission's parts, so
// no recommendation says the same verb twice.

const PHY = "wjec-alevel-physics";
const DAY = 86_400_000;
const at = (days: number, hour = 10) => new Date(Date.parse("2026-10-01T00:00:00.000Z") + days * DAY + hour * 3_600_000).toISOString();
const questions: Question[] = Array.from({ length: 8 }, (_, i) => mkQuestion(`physics-motion-${i}`, "motion", { subjectId: PHY }));
const loss: Mistake = mkMistake("m1", { subjectId: PHY, topicId: "motion", questionId: "physics-motion-0", attemptId: "att-m1", marksLost: 3, createdAt: at(0, 9) });
const lossAttempt = mkAttempt("att-m1", "physics-motion-0", 0, 3, at(0, 9), { subjectId: PHY, topicIds: ["motion"] });

function titles(attempts: Attempt[], mistakes: Mistake[], day = 0) {
  const now = new Date(at(day, 12));
  const recovery = buildMarkRecovery({ mistakes, attempts, questions, now });
  const plan = rankRevisionActions({
    now, recovery, supplyByTopic: unseenSupplyByTopic(["motion"], questions, attempts), topicTitle: () => "Motion", subjectName: () => "Physics",
    mistakes, attempts, questions, subjectIds: [PHY], examDates: [],
  });
  return [...plan.actions, ...plan.deferred.map((d) => d.action)].map((a) => a.title)
    .concat(plan.deferred.map((d) => d.reason));
}

const repeatsAVerb = (title: string) => /\b(Recover|Prove|Check)\b.*\b\1\b/.test(title);

describe("recommendation titles say each verb once", () => {
  it("a fresh loss reads 'Recover 3 marks in Motion', not 'Recover 3 marks: Recover Motion marks'", () => {
    const all = titles([lossAttempt], [loss]);
    expect(all).toContain("Recover 3 marks in Motion");
    for (const t of all) expect(repeatsAVerb(t), t).toBe(false);
  });

  it("composes every mission form without a doubled verb", () => {
    const generic = { title: "Recover Motion marks", origin: "topic" as const, recoverFocus: "Motion" };
    const pattern = { title: "Eliminate unit-conversion errors in Motion", origin: "pattern" as const };
    const paper = { title: "Repair mistakes from Physics Paper 1", origin: "paper" as const };
    const base = { shown: 3, regressed: false, delayed: false, proofEligible: false };
    expect(missionActionTitle(generic, base)).toBe("Recover 3 marks in Motion");
    expect(missionActionTitle(generic, { ...base, shown: 0 })).toBe("Recover Motion marks");
    expect(missionActionTitle(generic, { ...base, regressed: true })).toBe("Recover 3 marks you lost again in Motion");
    expect(missionActionTitle(pattern, base)).toBe("Recover 3 marks: Eliminate unit-conversion errors in Motion");
    expect(missionActionTitle(paper, base)).toBe("Repair mistakes from Physics Paper 1");
    expect(missionActionTitle(paper, { ...base, regressed: true })).toBe("Recover 3 marks you lost again: Repair mistakes from Physics Paper 1");
    for (const m of [generic, pattern, paper]) for (const regressed of [false, true]) for (const delayed of [false, true]) for (const proofEligible of [false, true]) {
      const t = missionActionTitle(m, { shown: 2, regressed, delayed, proofEligible });
      expect(repeatsAVerb(t), t).toBe(false);
    }
  });

  it("a delayed check says 'Prove it' only when it would run on teacher-reviewed questions", () => {
    const generic = { title: "Recover Motion marks", origin: "topic" as const, recoverFocus: "Motion" };
    expect(missionActionTitle(generic, { shown: 3, regressed: false, delayed: true, proofEligible: true })).toBe("Prove it: Motion");
    expect(missionActionTitle(generic, { shown: 3, regressed: false, delayed: true, proofEligible: false })).toBe("Check it held: Motion");
  });

  it("a regressed topic reads 'Recover N marks you lost again in <topic>'", () => {
    // Reviewed flagship questions (fixture only): lost, fixed on another
    // question, held after the delay (proven), then lost again: a regression.
    const bank = Array.from({ length: 8 }, (_, i) => flagshipQuestion(`maths-calculus-${i}`, "calculus"));
    const m1 = flagshipMistake("m1", { topicId: "calculus", questionId: "maths-calculus-0", attemptId: "att-m1", marksLost: 4, createdAt: "2026-09-10T09:00:00.000Z" });
    const a = (id: string, q: number, awarded: number, day: string) => flagshipAttempt(id, `maths-calculus-${q}`, awarded, 3, `${day}T09:00:00.000Z`, { topicIds: ["calculus"] });
    const attempts = [a("att-m1", 0, 0, "2026-09-10"), a("s1", 2, 3, "2026-09-15"), a("s2", 3, 3, "2026-09-25"), a("s3", 4, 0, "2026-10-02")];
    const now = new Date("2026-10-03T12:00:00.000Z");
    const recovery = buildMarkRecovery({ mistakes: [m1], attempts, questions: bank, now });
    const plan = rankRevisionActions({
      now, recovery, supplyByTopic: unseenSupplyByTopic(["calculus"], bank, attempts), topicTitle: () => "Calculus", subjectName: () => "Maths",
      mistakes: [m1], attempts, questions: bank, subjectIds: [FLAGSHIP_FIXTURE_SUBJECT], examDates: [],
    });
    expect(plan.top!.type).toBe("regression-recovery");
    expect(plan.top!.title).toMatch(/^Recover [\d.]+ marks you lost again in Calculus$/);
    for (const t of [...plan.actions.map((x) => x.title), ...plan.deferred.map((d) => d.reason)]) expect(repeatsAVerb(t), t).toBe(false);
  });
});
