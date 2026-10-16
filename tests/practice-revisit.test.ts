import { describe, expect, it } from "vitest";
import { buildMarkRecovery, PRACTICE_REVISIT_MAX_DAYS } from "@/domain/mark-recovery";
import { rankRevisionActions } from "@/domain/revision-engine";
import { unseenSupplyByTopic } from "@/domain/supply";
import type { Attempt, Mistake, Question } from "@/domain/types";
import { attempt as mkAttempt, mistake as mkMistake, question as mkQuestion, reviewed } from "./helpers-recovery";

// The returning student on a flagship. Every flagship question is still
// unreviewed, so a lost mark recovered on another question stays
// "provisional" for ever and its mission is blocked on proof supply. Before
// this pass the engine answered that with the same action on every visit —
// "Recover 3 marks", supported practice, straight away — an hour after the
// fix, the next day and a fortnight later: nothing was spaced and the
// Revisit step never happened. Now the topic waits, comes back for a spaced
// practice check, and the gap doubles each time the fix holds. Proof rules
// are untouched: none of this can mark anything proven.

const PHY = "wjec-alevel-physics";
const DAY = 86_400_000;
const at = (base: string, days: number, hour = 10) => new Date(Date.parse(`${base}T00:00:00.000Z`) + days * DAY + hour * 3_600_000).toISOString();
const START = "2026-10-01";

const questions: Question[] = Array.from({ length: 8 }, (_, i) => mkQuestion(`physics-circuits-${i}`, "circuits", { subjectId: PHY, kind: i % 2 ? "calculation" : "structured" }));
const loss: Mistake = mkMistake("p1", { subjectId: PHY, topicId: "circuits", questionId: "physics-circuits-0", attemptId: "att-p1", workingErrorKind: "unit-error", marksLost: 3, createdAt: at(START, 0, 9) });
const lossAttempt = mkAttempt("att-p1", "physics-circuits-0", 0, 3, at(START, 0, 9), { subjectId: PHY, topicIds: ["circuits"] });
const fix = mkAttempt("fix", "physics-circuits-2", 3, 3, at(START, 0, 10), { subjectId: PHY, topicIds: ["circuits"] });
const answer = (id: string, q: number, awarded: number, day: number, over: Partial<Attempt> = {}) =>
  mkAttempt(id, `physics-circuits-${q}`, awarded, 3, at(START, day), { subjectId: PHY, topicIds: ["circuits"], ...over });

function plan(attempts: Attempt[], day: number, bank: Question[] = questions, mistakes: Mistake[] = [loss]) {
  const now = new Date(at(START, day, 12));
  const recovery = buildMarkRecovery({ mistakes, attempts, questions: bank, now });
  return {
    recovery,
    plan: rankRevisionActions({
      now, recovery, supplyByTopic: unseenSupplyByTopic(["circuits"], bank, attempts), topicTitle: (id) => id, subjectName: (id) => id,
      mistakes, attempts, questions: bank, subjectIds: [PHY], examDates: [],
    }),
  };
}

describe("practice revisit schedule (mark recovery)", () => {
  it("schedules the first spaced check three days after a recovery on unreviewed questions", () => {
    const item = plan([lossAttempt, fix], 0).recovery.items[0]!;
    expect(item.state).toBe("provisional");
    expect(item.unverifiedOnly).toBe(true);
    expect(item.practiceRevisit).toEqual({ dueAt: at(START, 3, 10), heldChecks: 0, slipped: false });
  });

  it("doubles the gap each time an unaided check on another question holds, up to a cap", () => {
    const attempts = [lossAttempt, fix, answer("c1", 3, 3, 4), answer("c2", 4, 3, 11), answer("c3", 5, 3, 24)];
    const revisit = plan(attempts, 25).recovery.items[0]!.practiceRevisit!;
    expect(revisit.heldChecks).toBe(3);
    expect(revisit.lastHeldAt).toBe(at(START, 24));
    expect(revisit.dueAt).toBe(at(START, 24 + Math.min(PRACTICE_REVISIT_MAX_DAYS, 24)));
  });

  it("ignores hinted attempts, early attempts and repeats of the question it was fixed on", () => {
    const attempts = [lossAttempt, fix, answer("early", 3, 3, 1), answer("hinted", 4, 3, 4, { hintTier: "prompt" }), answer("same", 2, 3, 5)];
    const revisit = plan(attempts, 6).recovery.items[0]!.practiceRevisit!;
    expect(revisit.heldChecks).toBe(0);
    expect(revisit.dueAt).toBe(at(START, 3, 10));
  });

  it("stops scheduling when a spaced check loses marks (that loss opens its own repair)", () => {
    const revisit = plan([lossAttempt, fix, answer("slip", 3, 1, 4)], 5).recovery.items[0]!.practiceRevisit!;
    expect(revisit.slipped).toBe(true);
  });

  it("never applies to reviewed content and never changes a proof state", () => {
    const bank = questions.map(reviewed);
    const item = plan([lossAttempt, fix], 0, bank).recovery.items[0]!;
    expect(item.practiceRevisit).toBeUndefined();
    const held = plan([lossAttempt, fix, answer("c1", 3, 3, 4), answer("c2", 4, 3, 11)], 12).recovery;
    expect(held.items[0]!.state).toBe("provisional");
    expect(held.totals.proven).toBe(0);
  });
});

describe("the returning student's Today plan", () => {
  it("does not send the student straight back to a topic they just fixed; it waits and says when", () => {
    for (const day of [0, 1, 2]) {
      const { plan: p } = plan([lossAttempt, fix], day);
      expect(p.actions.some((a) => a.mission?.id === "mission:topic:circuits"), `day ${day}`).toBe(false);
      const waiting = p.deferred.find((d) => d.action.id.endsWith(":practice-revisit"));
      expect(waiting?.reason).toBe("Waiting for the delay to pass: recovered in practice, so Revise brings it back for a spaced check from 2026-10-04.");
    }
  });

  it("brings the topic back for a spaced, practice-only check once it is due", () => {
    const { plan: p } = plan([lossAttempt, fix], 4);
    const check = p.actions.find((a) => a.id.endsWith(":practice-revisit"));
    expect(check?.title).toBe("Check it held: circuits");
    expect(check?.route.href).toBe("/practice?mission=mission%3Atopic%3Acircuits&stage=practise");
    expect(check?.explanation.proves).toMatch(/practice, not proof/);
    expect(check?.explanation.why).toMatch(/4 days ago/);
    expect(check?.title).not.toMatch(/Recover|Prove/);
  });

  it("after a check holds, the next one waits twice as long", () => {
    const attempts = [lossAttempt, fix, answer("c1", 3, 3, 4)];
    const soon = plan(attempts, 7).plan;
    expect(soon.actions.some((a) => a.id.endsWith(":practice-revisit"))).toBe(false);
    expect(soon.deferred.find((d) => d.action.id.endsWith(":practice-revisit"))?.reason).toMatch(/from 2026-10-11\./);
    const due = plan(attempts, 11).plan;
    expect(due.actions.find((a) => a.id.endsWith(":practice-revisit"))?.explanation.whyNow).toMatch(/held on 1 spaced check/);
  });

  it("keeps open losses as repairs: a mission with an unrecovered mark is not a revisit", () => {
    const { plan: p } = plan([lossAttempt], 4);
    const action = p.actions.find((a) => a.mission?.id === "mission:topic:circuits");
    expect(action).toBeDefined();
    expect(action!.id.endsWith(":practice-revisit")).toBe(false);
  });
});
