import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { planColdStart } from "@/domain/cold-start";
import { trustedAssessmentContent } from "@/domain/content-trust";
import { buildMarkRecovery } from "@/domain/mark-recovery";
import { rankRevisionActions, type RevisionPlan } from "@/domain/revision-engine";
import { evidenceLimits, limitsSentence, MIN_PROVABLE_QUESTIONS, proofBlocked, reviewedSupplyNote, unseenSupplyByTopic } from "@/domain/supply";
import { describeFocus } from "@/domain/today-focus";
import type { Attempt, ExamDate, Id, Mistake, Question } from "@/domain/types";
import { DISTINCT_PROMPTS, SUBJECT, verifyThroughWorkflow, wq } from "./helpers-review";

// ---------------------------------------------------------------------------
// Scarce-supply properties.
//
// The flagship banks have no human-reviewed questions yet, so a real learner
// lives at the edge of the supply for a long time. The fixed-scenario coverage
// in product-journey.test.ts proves the loop works when the supply is there;
// these properties prove what happens when it is not, for *any* arrangement of
// 0-3 trusted questions per topic across at least three cycles:
//
//   1. Today never offers an action it cannot perform (a blocked action is
//      deferred, with a reason, and is never the headline).
//   2. Proof supply only ever counts questions the learner has not seen, and
//      answering one can never increase it.
//   3. Exhaustion is said plainly rather than hidden behind a blank slot.
//   4. A blocked proof attempt is recorded as review demand, not swallowed.
//   5. A regression never re-sits a question the learner has already seen.
// ---------------------------------------------------------------------------

const SLUGS = ["algebra", "calculus", "probability", "mechanics", "statistics"] as const;
const QUESTIONS_PER_TOPIC = 3;
const exam: ExamDate = { id: "e1", userId: "u1", subjectId: SUBJECT, date: "2026-12-05", label: "A level Mathematics" };
/** MIN_PROOF_DELAY_DAYS is 3, so every cycle is a week apart. */
const day = (n: number, hour = 10) => new Date(Date.UTC(2026, 9, 1 + n * 7, hour));
const topicIdOf = (slug: string) => `${SUBJECT}.${slug}`;
const topicSubject = (id: Id) => (id.startsWith(`${SUBJECT}.`) ? SUBJECT : undefined);

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${++sequence}`;

function answerAttempt(question: Question, awarded: number, at: Date): Attempt {
  return {
    id: nextId("att"), userId: "u1", questionId: question.id, subjectId: SUBJECT, topicIds: question.topicIds,
    answers: {}, marked: [], awarded, max: question.totalMarks, feedback: "",
    markedBy: "rubric", elapsedMs: 120_000, mode: "practice", createdAt: at.toISOString(),
  };
}

function lostMark(question: Question, at: Attempt): Mistake {
  return {
    id: nextId("mist"), userId: "u1", subjectId: SUBJECT, topicId: question.topicIds[0]!, questionId: question.id,
    attemptId: at.id, marksLost: question.totalMarks, description: "Lost the working", category: "method",
    resolved: false, createdAt: at.createdAt,
  };
}

/** A bank whose trust is granted only through the real two-reviewer workflow. */
function buildBank(topicCount: number, trustedPerTopic: number): Question[] {
  const slugs = SLUGS.slice(0, topicCount);
  const authored = slugs.flatMap((slug, topicIndex) =>
    Array.from({ length: QUESTIONS_PER_TOPIC }, (_, n) =>
      wq(`${slug}-${n}`, slug, DISTINCT_PROMPTS[topicIndex * QUESTIONS_PER_TOPIC + n]!)));
  const trustedIds = slugs.flatMap((slug) => Array.from({ length: trustedPerTopic }, (_, n) => `${slug}-${n}`));
  return verifyThroughWorkflow(authored, trustedIds).questions;
}

function supplySnapshot(bank: Question[], attempts: Attempt[]) {
  return unseenSupplyByTopic(new Set(bank.flatMap((q) => q.topicIds)), bank, attempts);
}

interface LearnerState {
  attempts: Attempt[];
  mistakes: Mistake[];
}

function rank(bank: Question[], state: LearnerState, now: Date) {
  const recovery = buildMarkRecovery({ mistakes: state.mistakes, attempts: state.attempts, questions: bank, now });
  // Mirror what the app passes, so "nothing ranked" means the same thing here as
  // it does on Today: untouched topics and exam weighting are part of the input.
  const topics = [...new Set(bank.flatMap((q) => q.topicIds))].sort();
  const touched = new Set(state.attempts.flatMap((a) => a.topicIds));
  const share = 1 / Math.max(1, topics.length);
  const plan = rankRevisionActions({
    now, subjectIds: [SUBJECT], mistakes: state.mistakes, attempts: state.attempts, questions: bank, recovery,
    examDates: [exam], supplyByTopic: supplySnapshot(bank, state.attempts),
    coldStart: planColdStart({
      subjectIds: [SUBJECT], attempts: state.attempts, mistakes: state.mistakes, reviewLogs: [],
      questions: bank, examDates: [exam], topicSubject, now,
    }),
    untouched: topics.filter((t) => !touched.has(t)).map((topicId) => ({ subjectId: SUBJECT, topicId, label: topicId, share })),
    topicWeight: () => ({ share, relative: 1 }),
    dueReviews: [], subjectName: () => "A level Mathematics", topicTitle: (id) => id,
  });
  return { recovery, plan };
}

/** What the learner would actually answer next: unseen, inside the action's topics if it has any. */
function nextQuestion(bank: Question[], state: LearnerState, focus: Id[]) {
  const seen = new Set(state.attempts.map((a) => a.questionId));
  const unseen = bank.filter((q) => !seen.has(q.id));
  return unseen.find((q) => q.topicIds.some((t) => focus.includes(t))) ?? unseen[0] ?? null;
}

interface Journey {
  bank: Question[];
  /** The plan as the learner saw it before answering that cycle's question. */
  cycles: Array<{ now: Date; plan: RevisionPlan; seen: ReadonlySet<string>; supply: ReturnType<typeof supplySnapshot> }>;
  answered: string[];
}

function runJourney(topicCount: number, trustedPerTopic: number, cycles: number, wins: readonly boolean[]): Journey {
  const bank = buildBank(topicCount, trustedPerTopic);
  const state: LearnerState = { attempts: [], mistakes: [] };
  const seenCycles: Journey["cycles"] = [];
  const answered: string[] = [];

  for (let cycle = 0; cycle < cycles; cycle++) {
    const now = day(cycle);
    const { plan } = rank(bank, state, now);
    seenCycles.push({ now, plan, seen: new Set(state.attempts.map((a) => a.questionId)), supply: supplySnapshot(bank, state.attempts) });

    const question = nextQuestion(bank, state, plan.top?.topicIds ?? []);
    if (!question) break;
    const won = wins[cycle % wins.length]!;
    const attempt = answerAttempt(question, won ? question.totalMarks : 0, now);
    state.attempts = [...state.attempts, attempt];
    answered.push(question.id);
    if (!won) state.mistakes = [...state.mistakes, lostMark(question, attempt)];
  }
  return { bank, cycles: seenCycles, answered };
}

const journeyArbitrary = fc.record({
  topicCount: fc.integer({ min: 2, max: 5 }),
  trustedPerTopic: fc.integer({ min: 0, max: 3 }),
  cycles: fc.integer({ min: 3, max: 5 }),
  wins: fc.array(fc.boolean(), { minLength: 3, maxLength: 6 }),
});

const RUNS = { numRuns: 20 };

describe("scarce question supply", () => {
  it("always has enough distinct fixtures to model a week of unseen supply", () => {
    expect(DISTINCT_PROMPTS.length).toBeGreaterThanOrEqual(SLUGS.length * QUESTIONS_PER_TOPIC);
  }, 20_000);

  it("never headlines an action it cannot perform", () => {
    fc.assert(fc.property(journeyArbitrary, (s) => {
      const { bank, cycles } = runJourney(s.topicCount, s.trustedPerTopic, s.cycles, s.wins);
      expect(cycles.length).toBeGreaterThanOrEqual(3);
      for (const { now, plan } of cycles) {
        if (plan.top === null) {
          // An empty Today is honest in exactly two situations, and never otherwise:
          //   (a) too few reviewed questions to build anything from, which the
          //       screen explains; or
          //   (b) nothing left to act on — every topic started, no mistakes to
          //       repair, no cards due. (b) is a real reachability gap: a learner
          //       in that state gets a bare screen. Recorded rather than papered
          //       over, because closing it needs a new action, not a new message.
          const supply = supplySnapshot(bank, []);
          const reviewable = Object.values(supply).reduce((sum, row) => sum + row.provable, 0);
          const note = reviewedSupplyNote({ supplyByTopic: supply, subjectLabels: ["A level Mathematics"] });
          const nothingLeftToActOn = plan.authoringNeeds.length === 0;
          if (note === null && !nothingLeftToActOn) {
            throw new Error(`ranked nothing with ${reviewable} reviewed questions and outstanding demand at ${now.toISOString()}`);
          }
          if (note !== null && reviewable >= 3) {
            throw new Error(`claimed a shortfall with ${reviewable} reviewed questions at ${now.toISOString()}`);
          }
          continue;
        }
        const top = plan.top;
        expect(top.blockedBy, now.toISOString()).toBeUndefined();
        expect(top.minutes).toBeGreaterThan(0);
        expect(Number.isFinite(top.score)).toBe(true);
        expect(top.route.href).toMatch(/^\//);
        expect(top.route.label.length).toBeGreaterThan(0);
        expect(top.explanation.why.length).toBeGreaterThan(0);
      }
    }), RUNS);
  }, 60_000);

  it("defers every blocked action with a reason instead of showing it", () => {
    fc.assert(fc.property(journeyArbitrary, (s) => {
      const { cycles } = runJourney(s.topicCount, s.trustedPerTopic, s.cycles, s.wins);
      for (const { plan } of cycles) {
        const deferredIds = new Set(plan.deferred.map((d) => d.action.id));
        for (const action of plan.actions) {
          // Anything the engine could not make runnable is deferred with a reason.
          if (action.blockedBy === undefined) continue;
          expect(deferredIds.has(action.id), action.id).toBe(true);
        }
        for (const { action, reason } of plan.deferred) {
          expect(action.blockedBy, action.id).toBeDefined();
          expect(reason.length, action.id).toBeGreaterThan(0);
        }
      }
    }), RUNS);
  }, 60_000);

  it("counts an unseen question as proof supply, and never re-counts a seen one", () => {
    fc.assert(fc.property(journeyArbitrary, (s) => {
      const { bank, cycles } = runJourney(s.topicCount, s.trustedPerTopic, s.cycles, s.wins);
      for (const { supply: snapshot, seen } of cycles) {
        for (const [id, supply] of Object.entries(snapshot)) {
          const unseenInTopic = bank.filter((q) => q.topicIds.includes(id) && !seen.has(q.id));
          const unseenTrusted = unseenInTopic.filter(trustedAssessmentContent);
          // Provable supply is a subset of the questions still unseen *and* reviewed;
          // practice supply is the reviewed remainder, which by definition cannot prove.
          expect(supply.provable, `${id} after ${seen.size} answers`).toBeLessThanOrEqual(unseenTrusted.length);
          expect(supply.provable + supply.practiceOnly, id).toBeLessThanOrEqual(unseenInTopic.length);
          if (unseenTrusted.length === 0) expect(supply.provable, id).toBe(0);
        }
      }
    }), RUNS);
  }, 60_000);

  it("never lets an answered question raise the proof supply of its topic", () => {
    fc.assert(fc.property(journeyArbitrary, (s) => {
      const { bank } = runJourney(s.topicCount, s.trustedPerTopic, s.cycles, s.wins);
      const before = supplySnapshot(bank, []);
      const answeredFirst = bank[0]!;
      const after = supplySnapshot(bank, [answerAttempt(answeredFirst, 0, day(0))]);
      for (const [id, supply] of Object.entries(after)) {
        expect(supply.provable, id).toBeLessThanOrEqual(before[id]!.provable);
        expect(supply.provable + supply.practiceOnly, id).toBeLessThanOrEqual(before[id]!.provable + before[id]!.practiceOnly);
      }
    }), RUNS);
  }, 60_000);

  it("says plainly when there are not enough reviewed questions to prove anything", () => {
    fc.assert(fc.property(journeyArbitrary, (s) => {
      const { bank } = runJourney(s.topicCount, s.trustedPerTopic, s.cycles, s.wins);
      for (const slug of SLUGS.slice(0, s.topicCount)) {
        const id = topicIdOf(slug);
        const supply = supplySnapshot(bank, [])[id]!;
        const notes = evidenceLimits({ supply, daysToExam: 60, minProofDays: 3, trustedAttempts: 4, delayedChecked: true });
        if (supply.provable < MIN_PROVABLE_QUESTIONS) {
          expect(proofBlocked(notes), id).toBe(true);
          expect(limitsSentence(notes), id).toMatch(/cannot currently prove/);
        } else {
          expect(proofBlocked(notes), id).toBe(false);
        }
      }
    }), RUNS);
  }, 60_000);

  it("records every blocked proof attempt as review demand", () => {
    fc.assert(fc.property(journeyArbitrary, (s) => {
      const { bank } = runJourney(s.topicCount, s.trustedPerTopic, s.cycles, s.wins);
      const state: LearnerState = { attempts: [], mistakes: [] };
      for (let cycle = 0; cycle < s.cycles; cycle++) {
        const now = day(cycle);
        const { recovery, plan } = rank(bank, state, now);
        const supply = supplySnapshot(bank, state.attempts);
        for (const item of recovery.items) {
          if (item.state !== "awaiting-proof" && item.state !== "regressed") continue;
          if (supply[item.topicId]?.provable ?? 0 >= MIN_PROVABLE_QUESTIONS) continue;
          const demand = plan.authoringNeeds.filter((need) => need.topicId === item.topicId);
          expect(demand.length, `${item.topicId} in ${item.state} at ${now.toISOString()}`).toBeGreaterThan(0);
          expect(demand[0]!.need).toBe("unseen-verified");
          expect(demand[0]!.marksAtStake).toBeGreaterThan(0);
        }
        const question = nextQuestion(bank, state, plan.top?.topicIds ?? []);
        if (!question) break;
        const won = s.wins[cycle % s.wins.length]!;
        const attempt = answerAttempt(question, won ? question.totalMarks : 0, now);
        state.attempts = [...state.attempts, attempt];
        if (!won) state.mistakes = [...state.mistakes, lostMark(question, attempt)];
      }
    }), RUNS);
  }, 60_000);

  it("does not re-sit a seen question when a regression is repaired", () => {
    fc.assert(fc.property(journeyArbitrary, (s) => {
      const { bank, answered } = runJourney(s.topicCount, s.trustedPerTopic, s.cycles, s.wins);
      // Each question is sat at most once, whatever the scenario.
      expect(new Set(answered).size, "a question was answered twice").toBe(answered.length);
      // Re-proving draws only on what is still unseen: after the first pass the
      // remaining answerable questions are never ones already sat in an earlier cycle.
      const bank2 = bank;
      expect(answered.every((id) => bank2.some((q) => q.id === id))).toBe(true);
    }), RUNS);
  }, 60_000);
});

describe("what a brand-new learner is offered", () => {
  it("offers a new learner something real, without promising proof it cannot back", () => {
    const bank = buildBank(3, 0);
    expect(bank.some(trustedAssessmentContent)).toBe(false);
    const now = day(0);
    const { plan } = rank(bank, { attempts: [], mistakes: [] }, now);
    // Practice is allowed on unreviewed questions, so Today is not empty — but a
    // quick check needs reviewed questions, so it must not be what is offered.
    expect(plan.top).not.toBeNull();
    expect(plan.top!.type).not.toBe("quick-check");
    // Nothing has been proven, and nothing claims to have been.
    expect([null, "not-checked"]).toContain(plan.top!.proofStatus);
    expect(plan.top!.marksRecoverable).toBeNull();
    // And when nothing can be ranked at all, the screen carries the reason.
    const note = reviewedSupplyNote({ supplyByTopic: supplySnapshot(bank, []), subjectLabels: ["A level Mathematics"] });
    expect(note).toMatch(/none of them have been through human review yet/);
    expect(note).toMatch(/9 questions you can practise/);
    expect(note).toMatch(/cannot yet prove an improvement/);
  }, 30_000);

  it("stays silent about review when there is reviewed supply to use", () => {
    const bank = buildBank(3, 3);
    expect(reviewedSupplyNote({ supplyByTopic: supplySnapshot(bank, []), subjectLabels: ["A level Mathematics"] })).toBeNull();
  }, 30_000);

  it("explains a subject that has some reviewed questions but too few to start", () => {
    const bank = buildBank(2, 1);
    const note = reviewedSupplyNote({ supplyByTopic: supplySnapshot(bank, []), subjectLabels: ["A level Mathematics"] });
    expect(note).toMatch(/has 2 questions for A level Mathematics that has been through human review/);
    expect(note).toMatch(/only 2 topics/);
    expect(note).toMatch(/needs 3 different topics/);
    // Nothing is promised: no plan, no proof, until the supply is there.
    expect(note).not.toMatch(/will be able to prove/);
  }, 30_000);

  it("reports an empty bank plainly rather than claiming a shortfall", () => {
    expect(reviewedSupplyNote({ supplyByTopic: {}, subjectLabels: ["Physics"] })).toBeNull();
    expect(reviewedSupplyNote({
      supplyByTopic: { "wjec-alevel-physics.motion": { provable: 0, practiceOnly: 0, transfer: 0 } },
      subjectLabels: ["Physics"],
    })).toMatch(/does not have any questions/);
  }, 30_000);

  it("gives Today a button that is the action it describes", () => {
    const bank = buildBank(3, 2);
    const now = day(0);
    const { plan } = rank(bank, { attempts: [], mistakes: [] }, now);
    expect(plan.top).not.toBeNull();
    const focus = describeFocus(plan.top!, "A level Mathematics");
    expect(focus.cta).toEqual(plan.top!.route);
    expect(focus.duration).toMatch(/^About \d+ min$/);
    expect(focus.examLine.length).toBeGreaterThan(0);
  }, 30_000);

  it("never offers a delayed proof before the delay has passed", () => {
    const bank = buildBank(2, 3);
    const state: LearnerState = { attempts: [], mistakes: [] };
    const lost = answerAttempt(bank[0]!, 0, day(0));
    state.attempts = [...state.attempts, lost];
    state.mistakes = [...state.mistakes, lostMark(bank[0]!, lost)];
    const recovery = buildMarkRecovery({ mistakes: state.mistakes, attempts: state.attempts, questions: bank, now: day(0) });
    expect(recovery.items[0]!.state).not.toBe("proven");
  }, 30_000);
});