import { describe, expect, it } from "vitest";
import {
  efficiencyStatement, gainBand, measureOutcomes, MIN_DELAYED_CHECKS, recurrenceStatement, shareBand, statement,
  supportLevelOf, type InterventionMeasurement,
} from "@/domain/outcome-measurement";
import type { Attempt, Mistake, Question } from "@/domain/types";
import { attempt as mkAttempt, mistake as mkMistake, question as mkQuestion } from "./helpers-recovery";

const day = (n: number) => `2026-09-${String(n).padStart(2, "0")}T09:00:00.000Z`;
const SUBJECT = "physics";
const TOPIC = "circuits";

interface ChainOpts {
  user?: string;
  mission?: string;
  intervention?: string;
  /** Marks (of 3) on the delayed check; null omits it. */
  delayed?: number | null;
  delayedDay?: number;
  delayedQuestion?: string;
  repairHint?: Attempt["hintTier"];
  delayedOver?: Partial<Attempt>;
  repairAwarded?: number;
}

/** One complete mission chain: source loss (0/3), repair, apply, then an optional delayed check. */
function chain(i: number, o: ChainOpts = {}) {
  const user = o.user ?? "u1";
  const id = `${user}-${o.mission ?? `m${i}`}`;
  const ctx = (stage: "repair" | "apply" | "delayed-proof") => ({
    missionId: id, stage, intervention: o.intervention ?? "technique-intervention", targetCause: "unit-error", sourceMistakeIds: [`mis-${id}`],
  });
  const at = (qid: string, awarded: number, d: number, over: Partial<Attempt>): Attempt =>
    mkAttempt(`${qid}-att`, qid, awarded, 3, day(d), { userId: user, subjectId: SUBJECT, topicIds: [TOPIC], ...over });
  const questions = ["src", "rep", "app", "del"].map((k) => mkQuestion(`${id}-${k}`, TOPIC, { subjectId: SUBJECT }));
  const mistakes: Mistake[] = [mkMistake(`mis-${id}`, {
    userId: user, subjectId: SUBJECT, topicId: TOPIC, questionId: `${id}-src`, attemptId: `${id}-src-att`, marksLost: 3, workingErrorKind: "unit-error", createdAt: day(1),
  })];
  const attempts: Attempt[] = [
    at(`${id}-src`, 0, 1, {}),
    at(`${id}-rep`, o.repairAwarded ?? 3, 2, { mission: ctx("repair"), ...(o.repairHint ? { hintTier: o.repairHint } : {}) }),
    at(`${id}-app`, 3, 2, { mission: ctx("apply") }),
  ];
  if (o.delayed !== null) {
    const qid = o.delayedQuestion ?? `${id}-del`;
    attempts.push(at(`${id}-del`, o.delayed ?? 3, o.delayedDay ?? 9, { mission: ctx("delayed-proof"), questionId: qid, ...o.delayedOver }));
  }
  return { attempts, mistakes, questions };
}

function many(n: number, o: (i: number) => ChainOpts = () => ({})) {
  const parts = Array.from({ length: n }, (_, i) => chain(i, o(i)));
  return {
    attempts: parts.flatMap((p) => p.attempts), mistakes: parts.flatMap((p) => p.mistakes),
    questions: parts.flatMap((p) => p.questions),
  };
}

const overall = (input: ReturnType<typeof many>, user = "u1") => measureOutcomes(input).learners.find((l) => l.userId === user)!.overall;

describe("bands", () => {
  it("is wide with no data and narrows as the sample grows", () => {
    expect(shareBand([])).toMatchObject({ sample: 0, value: null, low: 0, high: 1 });
    const width = (n: number) => { const b = shareBand(Array.from({ length: n }, (_, i) => (i % 2 ? 1 : 0))); return b.high - b.low; };
    expect(width(4)).toBeGreaterThan(width(10));
    expect(width(10)).toBeGreaterThan(width(40));
    expect(width(40)).toBeGreaterThan(width(160));
  });

  it("matches the 90% Wilson interval and shrinks small samples toward neutral", () => {
    const b = shareBand([1, 1, 1, 1, 1]);
    expect(b.value).toBe(1);
    expect(b.low).toBeCloseTo(0.649, 3);
    expect(b.high).toBeCloseTo(1, 10);
    expect(b.centre!).toBeLessThan(1);
    expect(shareBand([1]).centre!).toBeLessThan(shareBand([1, 1, 1, 1, 1]).centre!);
  });

  it("clamps out-of-range shares", () => {
    expect(shareBand([2, -1]).value).toBeCloseTo(0.5, 10);
  });

  it("builds a gain band that straddles zero for tiny samples and clears it for strong ones", () => {
    const small = gainBand([1, 1], [0, 0]);
    expect(small.value).toBe(1);
    expect(small.low).toBeLessThan(0.5);
    const strong = gainBand(Array(30).fill(1), Array(30).fill(0));
    expect(strong.low).toBeGreaterThan(0.8);
    expect(gainBand([], [])).toMatchObject({ sample: 0, value: null, low: -1, high: 1 });
    const flat = gainBand([0.5, 0.5, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5, 0.5]);
    expect(flat.low).toBeLessThan(0);
    expect(flat.high).toBeGreaterThan(0);
  });
});

describe("support levels", () => {
  const base = mkAttempt("a", "q", 1, 3, day(2));
  it("maps recorded hint, teaching and intervention fields honestly", () => {
    expect(supportLevelOf(base)).toBe("unsupported");
    expect(supportLevelOf({ ...base, hintTier: "cue" })).toBe("hinted");
    expect(supportLevelOf({ ...base, hintTier: "prompt" })).toBe("hinted");
    expect(supportLevelOf({ ...base, hintTier: "scaffold" })).toBe("guided");
    expect(supportLevelOf({ ...base, hintTier: "worked-solution" })).toBe("guided");
    expect(supportLevelOf({ ...base, repairTeachingSeen: true })).toBe("guided");
    expect(supportLevelOf({ ...base, copiedAnswer: true })).toBe("guided");
    const intervention = { id: "i", kind: "guided" as const, capabilityId: "c", topicId: TOPIC, priorState: "weak" as const, plannedMinutes: 5 };
    expect(supportLevelOf({ ...base, intervention: { ...intervention, support: "scaffold" } })).toBe("guided");
    expect(supportLevelOf({ ...base, intervention: { ...intervention, support: "none" } })).toBe("unsupported");
  });

  it("counts chains by the most support used in repair", () => {
    const a = chain(0, { repairHint: "cue" }), b = chain(1, { repairHint: "worked-solution" }), c = chain(2);
    const input = { attempts: [a, b, c].flatMap((x) => x.attempts), mistakes: [a, b, c].flatMap((x) => x.mistakes), questions: [a, b, c].flatMap((x) => x.questions) };
    expect(overall(input).support).toEqual({ unsupported: 1, hinted: 1, guided: 1, unknown: 0 });
  });
});

describe("per-chain measurement", () => {
  it("reports baseline marks lost, immediate, unfamiliar and delayed shares", () => {
    const m = overall(many(1, () => ({ delayed: 2 })));
    expect(m).toMatchObject({ chains: 1, awaitingDelayed: 0, baselineMarksLost: 3 });
    expect(m.baselineShare.value).toBe(0);
    expect(m.immediateIndependent.value).toBe(1);
    expect(m.unfamiliar.value).toBe(1);
    expect(m.delayedIndependent.value).toBeCloseTo(2 / 3, 10);
    expect(m.gain.value).toBeCloseTo(2 / 3, 10);
    expect(m.marksRecovered).toBeCloseTo(2, 5);
  });

  it("excludes assisted success from independent metrics and reports it separately", () => {
    const m = overall(many(1, () => ({ repairHint: "cue", delayedOver: { hintTier: "cue" } })));
    expect(m.supportedImmediate.value).toBe(1);
    expect(m.immediateIndependent.sample).toBe(0);
    expect(m.delayedIndependent.sample).toBe(0);
    expect(m.gain.sample).toBe(0);
    expect(m.marksRecovered).toBeNull();
    expect(m.awaitingDelayed).toBe(1);
  });

  it("does not let copied answers, seen teaching, self-marking or low confidence count as delayed proof", () => {
    for (const over of [{ copiedAnswer: true }, { repairTeachingSeen: true }, { markedBy: "self" as const }, { markConfidence: 0.3 }]) {
      expect(overall(many(1, () => ({ delayedOver: over }))).delayedIndependent.sample).toBe(0);
    }
  });

  it("treats immediate success as not delayed proof", () => {
    const tooSoon = overall(many(1, () => ({ delayedDay: 4 })));
    expect(tooSoon.immediateIndependent.value).toBe(1);
    expect(tooSoon.unfamiliar.value).toBe(1);
    expect(tooSoon.delayedIndependent.sample).toBe(0);
    expect(tooSoon.marksRecovered).toBeNull();
    expect(statement(tooSoon).level).toBe("too-early");
    const onTime = overall(many(1, () => ({ delayedDay: 5 })));
    expect(onTime.delayedIndependent.sample).toBe(1);
  });

  it("measures the delay from the last contact, not the first", () => {
    const c = chain(0, { delayedDay: 9 });
    const late = { ...c, attempts: c.attempts.map((x) => (x.id.endsWith("-app-att") ? { ...x, createdAt: day(8) } : x)) };
    expect(overall(late).delayedIndependent.sample).toBe(0);
  });

  it("requires the delayed check to be on a question not met earlier in the chain", () => {
    const repeated = overall(many(1, (i) => ({ delayedQuestion: `u1-m${i}-rep` })));
    expect(repeated.delayedIndependent.sample).toBe(0);
    const sourceRepeat = overall(many(1, (i) => ({ delayedQuestion: `u1-m${i}-src` })));
    expect(sourceRepeat.delayedIndependent.sample).toBe(0);
  });

  it("excludes an unfamiliar answer that repeats a repair-stage question", () => {
    const c = chain(0);
    const reuse = { ...c, attempts: c.attempts.map((x) => (x.id.endsWith("-app-att") ? { ...x, questionId: "u1-m0-rep" } : x)) };
    expect(overall(reuse).unfamiliar.sample).toBe(0);
  });

  it("excludes same-family questions as unfamiliar", () => {
    const c = chain(0);
    const questions = c.questions.map((q) => (q.id.endsWith("-del") || q.id.endsWith("-rep") ? { ...q, learning: { familyId: "fam", contextId: "c", demand: "recall" as const, reasoningMoves: [] } } : q)) as Question[];
    expect(overall({ ...c, questions }).delayedIndependent.sample).toBe(0);
  });

  it("returns null baseline gain without a trustworthy source attempt", () => {
    const c = chain(0);
    const noSource = { ...c, attempts: c.attempts.map((x) => (x.id.endsWith("-src-att") ? { ...x, markedBy: "self" as const } : x)) };
    const m = overall(noSource);
    expect(m.baselineMarksLost).toBe(3);
    expect(m.delayedIndependent.sample).toBe(1);
    expect(m.gain.sample).toBe(0);
    expect(m.marksRecovered).toBeNull();
  });

  it("never reports negative marks recovered", () => {
    const m = overall(many(1, () => ({ delayed: 0 })));
    expect(m.gain.value).toBe(0);
    expect(m.marksRecovered).toBe(0);
  });

  it("ignores attempts outside any mission and missions without an intervention", () => {
    const c = chain(0);
    const bare = c.attempts.map((x) => (x.mission ? { ...x, mission: { ...x.mission, intervention: null } } : x));
    expect(measureOutcomes({ ...c, attempts: bare }).learners).toEqual([]);
    expect(measureOutcomes({ attempts: [mkAttempt("x", "q", 1, 3, day(2))], mistakes: [], questions: [] }).learners).toEqual([]);
  });
});

describe("minutes and marks per minute", () => {
  it("is null without delayed independent evidence even with perfect immediate success", () => {
    const m = overall(many(3, () => ({ delayed: null })));
    expect(m.immediateIndependent.value).toBe(1);
    expect(m.marksRecovered).toBeNull();
    expect(m.marksPerMinute).toMatchObject({ value: null, low: null, high: null, sample: 0 });
    expect(efficiencyStatement(m).level).toBe("too-early");
  });

  it("divides delayed-evidenced marks recovered by chain minutes", () => {
    const m = overall(many(1));
    expect(m.minutes).toBe(3);
    expect(m.marksPerMinute.value).toBeCloseTo(1, 10);
    expect(m.marksPerMinute.low!).toBeLessThan(1);
    expect(m.marksPerMinute.high!).toBeGreaterThanOrEqual(m.marksPerMinute.low!);
  });

  it("pools several chains and does not count minutes from chains still awaiting a delayed check", () => {
    const m = overall(many(4, (i) => (i === 3 ? { delayed: null } : {})));
    expect(m.minutes).toBe(11);
    expect(m.marksRecovered).toBeCloseTo(9, 5);
    expect(m.marksPerMinute.value).toBeCloseTo(1, 10);
    expect(m.marksPerMinute.sample).toBe(3);
  });

  it("is null when no minutes were recorded", () => {
    const c = chain(0);
    const zero = { ...c, attempts: c.attempts.map((x) => ({ ...x, elapsedMs: 0 })) };
    expect(overall(zero).marksPerMinute.value).toBeNull();
    expect(overall(zero).marksRecovered).toBeCloseTo(3, 5);
  });

  it("narrows the per-minute band as delayed checks accumulate", () => {
    const width = (n: number) => { const e = overall(many(n)).marksPerMinute; return e.high! - e.low!; };
    expect(width(5)).toBeLessThan(width(2));
    expect(width(20)).toBeLessThan(width(5));
  });
});

describe("recurrence", () => {
  const withLater = (extra: Mistake[], later: Attempt[] = []) => {
    const c = chain(0);
    return { ...c, mistakes: [...c.mistakes, ...extra], attempts: [...c.attempts, ...later] };
  };
  const again = (id: string, over: Partial<Mistake> = {}) =>
    mkMistake(id, { subjectId: SUBJECT, topicId: TOPIC, workingErrorKind: "unit-error", createdAt: day(20), attemptId: `${id}-att`, ...over });

  it("detects the same cause on the same topic recorded after the repair", () => {
    const m = overall(withLater([again("r1")]));
    expect(m.recurrence).toMatchObject({ observed: 1, recurred: 1 });
  });

  it("ignores earlier mistakes, other causes, other topics, other learners and the source itself", () => {
    for (const extra of [
      again("r1", { createdAt: day(1) }), again("r2", { workingErrorKind: "arithmetic-slip" }),
      again("r3", { topicId: "fields" }), again("r4", { userId: "u2" }),
    ]) {
      expect(overall(withLater([extra])).recurrence.recurred).toBe(0);
    }
  });

  it("does not count mistakes made inside the mission's own repair attempts", () => {
    const own = again("r1", { attemptId: "u1-m0-rep-att", createdAt: day(20) });
    expect(overall(withLater([own])).recurrence.recurred).toBe(0);
  });

  it("observes a clean chain only when a later independent attempt on the topic exists", () => {
    const quiet = overall(chain(0));
    expect(quiet.recurrence).toMatchObject({ observed: 1, recurred: 0 });
    const c = chain(0, { delayed: null });
    expect(overall(c).recurrence.observed).toBe(0);
    const hintedLater = mkAttempt("later", "other-q", 3, 3, day(25), { userId: "u1", subjectId: SUBJECT, topicIds: [TOPIC], hintTier: "cue" });
    expect(overall({ ...c, attempts: [...c.attempts, hintedLater] }).recurrence.observed).toBe(0);
  });

  it("matches on the source cause when the mission records none", () => {
    const c = chain(0);
    const untargeted = { ...c, attempts: c.attempts.map((x) => (x.mission ? { ...x, mission: { ...x.mission, targetCause: null } } : x)), mistakes: [...c.mistakes, again("r1")] };
    expect(overall(untargeted).recurrence.recurred).toBe(1);
  });

  it("is honest about small samples in its statement", () => {
    expect(recurrenceStatement(overall(withLater([again("r1")]))).text).toMatch(/Too early/);
    const s = recurrenceStatement({ ...overall(many(1)), recurrence: { observed: 6, recurred: 2, rate: shareBand([1, 1, 0, 0, 0, 0]) } });
    expect(s.text).toMatch(/2 of 6/);
  });
});

describe("statements", () => {
  it("never says 'works well' for tiny samples, however good they look", () => {
    for (let n = 0; n < MIN_DELAYED_CHECKS; n++) {
      const s = statement(overall(many(n === 0 ? 1 : n, n === 0 ? () => ({ delayed: null }) : () => ({}))));
      expect(s.level).not.toBe("works-well");
      expect(s.text).not.toMatch(/worked well/);
    }
  });

  it("uses plain, non-alarming wording while data is thin", () => {
    const one = statement(overall(many(1)));
    expect(one.text).toMatch(/Too early to tell/);
    expect(one.text).toMatch(/1 later check completed; 4 more later checks needed before Revise can judge this reliably/);
    expect(one.text).not.toMatch(/error|fail|chance|confidence|interval|p-value/i);
    expect(statement(overall(many(1, () => ({ delayed: null })))).text).toMatch(/^Too early to tell/);
  });

  it("flips at exactly five independent delayed checks, not four", () => {
    const four = statement(overall(many(4)));
    const five = statement(overall(many(5)));
    expect(four.level).toBe("early-signs");
    expect(four.text).toMatch(/Too early to tell/);
    expect(four.text).toMatch(/4 later checks completed; 1 more later check needed before Revise can judge this reliably/);
    expect(five.level).toBe("works-well");
    expect(five.text).toMatch(/not that it was the cause/);
    expect(five.text).toMatch(/90%/);
  });

  it("counts five chains with a delayed check but one missing baseline as four", () => {
    const m = overall(many(5));
    const without = { ...m, gain: gainBand(Array(4).fill(1), Array(4).fill(0)) };
    expect(statement(without).level).toBe("early-signs");
  });

  it("is not swayed by immediate supported success", () => {
    const supportedOnly = overall(many(8, () => ({ repairHint: "worked-solution", delayed: null })));
    expect(supportedOnly.supportedImmediate.value).toBe(1);
    expect(statement(supportedOnly).level).toBe("too-early");
    const mixed = overall(many(6, (i) => (i < 3 ? { delayed: null, repairHint: "cue" as const } : {})));
    expect(statement(mixed).level).toBe("early-signs");
  });

  it("reports no clear gain when five delayed checks do not beat baseline", () => {
    const flat = overall(many(5, () => ({ delayed: 0 })));
    expect(statement(flat).level).toBe("no-clear-gain");
    const s = statement(flat);
    expect(s.text).not.toMatch(/worked well/);
  });

  it("requires the lower band, not the average, to clear zero", () => {
    const noisy = overall(many(5, (i) => ({ delayed: i < 2 ? 3 : 0 })));
    expect(noisy.gain.value!).toBeGreaterThan(0);
    expect(statement(noisy).level).toBe("no-clear-gain");
  });

  it("labels the overall row and known interventions", () => {
    const m = overall(many(5));
    expect(statement(m).text).toMatch(/^Your revision overall/);
    const by = measureOutcomes(many(5)).learners[0]!.byIntervention[0]!;
    expect(statement(by).text).not.toMatch(/^technique-intervention/);
  });

  it("gives an early marks-per-minute statement below five checks and a ranged one at five", () => {
    expect(efficiencyStatement(overall(many(2))).text).toMatch(/Early signs only/);
    const five = efficiencyStatement(overall(many(5)));
    expect(five.text).toMatch(/marks per 10 minutes/);
  });
});

describe("grouping and determinism", () => {
  it("separates learners and intervention kinds, and keeps an overall row", () => {
    const parts = [
      chain(0, { user: "u1", intervention: "technique-intervention" }),
      chain(1, { user: "u1", intervention: "retrieval-set", delayed: null }),
      chain(2, { user: "u2", intervention: "technique-intervention" }),
    ];
    const out = measureOutcomes({ attempts: parts.flatMap((p) => p.attempts), mistakes: parts.flatMap((p) => p.mistakes), questions: parts.flatMap((p) => p.questions) });
    expect(out.learners.map((l) => l.userId)).toEqual(["u1", "u2"]);
    const u1 = out.learners[0]!;
    expect(u1.overall.chains).toBe(2);
    expect(u1.byIntervention.map((r) => [r.kind, r.chains, r.awaitingDelayed])).toEqual([["retrieval-set", 1, 1], ["technique-intervention", 1, 0]]);
    expect(out.learners[1]!.overall.chains).toBe(1);
  });

  it("gives identical output whatever order the inputs arrive in", () => {
    const input = many(7, (i) => ({ delayed: i % 3 === 0 ? 1 : 3, user: i % 2 ? "u1" : "u2", intervention: i % 2 ? "retrieval-set" : "technique-intervention" }));
    const baseline = JSON.stringify(measureOutcomes(input));
    const rotate = <T,>(xs: T[], k: number) => [...xs.slice(k), ...xs.slice(0, k)];
    for (const k of [1, 5, 11]) {
      const shuffled = { attempts: rotate([...input.attempts].reverse(), k), mistakes: rotate([...input.mistakes].reverse(), k), questions: rotate([...input.questions].reverse(), k) };
      expect(JSON.stringify(measureOutcomes(shuffled))).toBe(baseline);
    }
  });

  it("does not mutate its inputs", () => {
    const input = many(2);
    const copy = JSON.stringify(input);
    measureOutcomes(input);
    expect(JSON.stringify(input)).toBe(copy);
  });
});

describe("types", () => {
  it("exposes the minimum delayed-check threshold", () => {
    const m: InterventionMeasurement = overall(many(1));
    expect(MIN_DELAYED_CHECKS).toBe(5);
    expect(m.gain.level).toBe(0.9);
  });
});
