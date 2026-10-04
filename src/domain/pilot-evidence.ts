// Internal cohort evidence, derived from the real local-first records. No new
// learner score or event store. All shares use distinct learner denominators.
import type { FunnelEvent } from "./funnel";
import { sessionCount } from "./product-outcomes";
import { buildMarkRecovery } from "./mark-recovery";
import { independentAttempt, isTransferQuestion, trustedAssessmentAttempt, trustedAssessmentMistake, unseenQuestion } from "./learning-evidence";
import { trustedAssessmentContent } from "./content-trust";
import type { Attempt, Mistake, Question } from "./types";

export const MIN_PILOT_LEARNERS = 10;
const DAY = 86_400_000;
export interface PilotLearner {
  anonId: string;
  source: "learner-pilot";
  consented: true;
  capturedAt: string;
  events: readonly FunnelEvent[];
  attempts: readonly Attempt[];
  mistakes: readonly Mistake[];
}
export const PILOT_STEPS = ["onboarded", "diagnostic-reached", "diagnostic-resolved", "recommendation-shown", "recommendation-started", "attempted", "mistake-detected", "repaired", "independent-practice", "transfer", "proof-eligible", "proof-attempted", "proven-recovery", "later-revisit"] as const;
export type PilotStep = typeof PILOT_STEPS[number];
const time = (s: string | undefined) => Date.parse(s ?? "");
const first = (values: number[], after = -Infinity) => values.filter(t => Number.isFinite(t) && t >= after).sort((a, b) => a - b)[0] ?? null;

export function pilotLearnerEvidence(input: PilotLearner, questions: readonly Question[]) {
  const end = time(input.capturedAt);
  if (!input.anonId.trim() || input.source !== "learner-pilot" || input.consented !== true || !Number.isFinite(end)) throw new Error("Pilot requires a consented pseudonymous learner and observation timestamp.");
  if (input.events.some(e => e.anonId !== input.anonId) || input.attempts.some(a => a.userId !== input.anonId) || input.mistakes.some(m => m.userId !== input.anonId)) throw new Error("Mixed-owner pilot records rejected.");
  const events = input.events.filter(e => Number.isFinite(time(e.at)) && time(e.at) <= end);
  const attempts = [...new Map(input.attempts.filter(a => Number.isFinite(time(a.createdAt)) && time(a.createdAt) <= end && Number.isFinite(a.max) && a.max > 0 && Number.isFinite(a.awarded) && a.awarded >= 0 && a.awarded <= a.max).map(a => [a.id, a])).values()].sort((a, b) => time(a.createdAt) - time(b.createdAt));
  const mistakes = [...new Map(input.mistakes.filter(m => time(m.createdAt) <= end).map(m => [m.id, m])).values()];
  const trustedMistakes = mistakes.filter(m => trustedAssessmentMistake(m, questions, attempts));
  const recovery = buildMarkRecovery({ mistakes: trustedMistakes, attempts, questions, now: new Date(end) });
  const byId = new Map(questions.map(q => [q.id, q]));
  const isIndependent = (a: Attempt) => independentAttempt(a) && trustedAssessmentAttempt(a, byId.get(a.questionId), attempts, questions);
  const stages = Object.fromEntries(PILOT_STEPS.map(s => [s, null])) as Record<PilotStep, number | null>;
  const eventTimes = (type: FunnelEvent["type"]) => events.filter(e => e.type === type).map(e => time(e.at));
  stages.onboarded = first(eventTimes("onboarding_completed"));
  const enter = (stage: PilotStep, previous: PilotStep, values: number[]) => { const at = stages[previous]; if (at !== null) stages[stage] = first(values, at); };
  enter("diagnostic-reached", "onboarded", [...eventTimes("diagnostic_started"), ...eventTimes("diagnostic_skipped")]);
  enter("diagnostic-resolved", "diagnostic-reached", [...eventTimes("diagnostic_completed"), ...eventTimes("diagnostic_skipped")]);
  const personalised = (e: FunnelEvent) => e.type === "recommendation_displayed" && !!e.detail && !/action:(quick-check|learn):/.test(e.detail);
  enter("recommendation-shown", "diagnostic-resolved", events.filter(personalised).map(e => time(e.at)));
  const accepted = events.filter(e => e.type === "recommendation_accepted" && e.detail && events.some(shown => shown.type === "recommendation_displayed" && shown.detail === e.detail && time(shown.at) <= time(e.at)));
  const completed = events.filter(e => e.type === "recommendation_completed" && accepted.some(a => a.detail === e.detail && time(e.at) >= time(a.at)));
  enter("recommendation-started", "recommendation-shown", accepted.map(e => time(e.at)));
  const recommendedAttempts = attempts.filter(a => accepted.some(e => time(a.createdAt) >= time(e.at) && time(a.createdAt) - time(e.at) <= 45 * 60_000 &&
    (a.mission ? e.detail === `action:${a.mission.missionId}:${a.mission.stage}` : a.topicIds.some(t => e.detail === `action:adaptive:${t}`))));
  enter("attempted", "recommendation-started", recommendedAttempts.map(a => time(a.createdAt)));
  enter("mistake-detected", "attempted", trustedMistakes.map(m => time(m.createdAt)));
  // Follow one actual repair chain per learner rather than splicing unrelated
  // topic successes into a fictitious completed loop.
  const chain = recovery.items.filter(i => i.firstSuccessAt && time(i.firstSuccessAt) >= (stages["mistake-detected"] ?? Infinity))
    .sort((a, b) => time(a.firstSuccessAt) - time(b.firstSuccessAt))[0];
  enter("repaired", "mistake-detected", chain ? [time(chain.firstSuccessAt)] : []);
  const related = chain ? attempts.filter(a => a.topicIds.includes(chain.topicId) &&
    (a.retestMistakeId === chain.mistakeId || a.mission?.sourceMistakeIds.includes(chain.mistakeId) || a.id === chain.provenAttemptId)) : [];
  enter("independent-practice", "repaired", related.filter(isIndependent).map(a => time(a.createdAt)));
  enter("transfer", "independent-practice", related.filter(a => isIndependent(a) && byId.has(a.questionId) && isTransferQuestion(byId.get(a.questionId)!)).map(a => time(a.createdAt)));
  const due = chain && ["awaiting-proof", "proven", "regressed"].includes(chain.state) ? time(chain.proofDueAt) : NaN;
  const proofCandidates = related.filter(a => a.mission?.stage === "delayed-proof" && isIndependent(a) && time(a.createdAt) >= due);
  enter("proof-eligible", "transfer", due <= end ? [due] : []);
  enter("proof-attempted", "proof-eligible", [...proofCandidates.map(a => time(a.createdAt)), ...(chain?.provenAt ? [time(chain.provenAt)] : [])]);
  enter("proven-recovery", "proof-attempted", chain?.state === "proven" ? [time(chain.provenAt)] : []);
  enter("later-revisit", "proven-recovery", related.filter(a => time(a.createdAt) > (stages["proven-recovery"] ?? Infinity) + DAY).map(a => time(a.createdAt)));
  const pending = recovery.items.filter(i => (i.state === "awaiting-proof" || i.state === "provisional") && !!i.firstSuccessAt);
  const blockedTopics = [...new Set(pending.filter(i => !questions.some(q => q.subjectId === i.subjectId && q.topicIds.includes(i.topicId) && trustedAssessmentContent(q) && unseenQuestion(q, attempts, questions))).map(i => i.topicId))];
  const allProofAttempts = attempts.filter(a => a.mission?.stage === "delayed-proof" && isIndependent(a));
  const minutes = attempts.reduce((n, a) => n + (Number.isFinite(a.elapsedMs) ? Math.max(0, Math.min(a.elapsedMs, 45 * 60_000)) / 60_000 : 0), 0);
  const firstStudy = attempts[0] ? time(attempts[0].createdAt) : NaN;
  const retention = (day: number) => ({ eligible: Number.isFinite(firstStudy) && end >= firstStudy + (day + 1) * DAY,
    returned: attempts.some(a => time(a.createdAt) >= firstStudy + day * DAY && time(a.createdAt) < firstStudy + (day + 1) * DAY) });
  return { anonId: input.anonId, stages, diagnosticCompleted: events.some(e => e.type === "diagnostic_completed"), diagnosticSkipped: events.some(e => e.type === "diagnostic_skipped"),
    secondSession: sessionCount(attempts) >= 2, recommendationsCompleted: completed.length > 0,
    marksLost: attempts.reduce((n, a) => n + a.max - a.awarded, 0), trustedMarksLost: recovery.totals.previouslyLost,
    marksRepairedInPractice: recovery.totals.provisional + recovery.totals.proven,
    marksProvenRecovered: recovery.totals.proven, studyMinutes: minutes,
    delayedProofsAttempted: allProofAttempts.length, delayedProofsPassed: allProofAttempts.filter(a => recovery.items.some(i => i.provenAttemptId === a.id)).length,
    daysToRecovery: recovery.items.filter(i => i.state === "proven").map(i => (time(i.provenAt) - time(trustedMistakes.find(m => m.id === i.mistakeId)?.createdAt)) / DAY),
    blockedTopics, day1: retention(1), day7: retention(7),
    reliability: { markedAttempts: attempts.filter(a => a.markedBy !== "self").length, escalations: attempts.filter(a => a.markedBy !== "self" && !!a.markEscalation).length } };
}

export function buildPilotReport(learners: readonly PilotLearner[], questions: readonly Question[], minLearners = MIN_PILOT_LEARNERS) {
  if (!Number.isInteger(minLearners) || minLearners < MIN_PILOT_LEARNERS) throw new Error(`Minimum pilot denominator is ${MIN_PILOT_LEARNERS} distinct learners.`);
  const ids = new Set<string>();
  for (const l of learners) { if (ids.has(l.anonId)) throw new Error("Duplicate learner export; merge observations before reporting."); ids.add(l.anonId); }
  const rows = learners.map(l => pilotLearnerEvidence(l, questions));
  const rate = (num: number, den: number) => ({ numerator: num, denominator: den, value: den >= minLearners ? num / den : null, state: den >= minLearners ? "OBSERVED" : "INSUFFICIENT DATA" });
  const count = (step: PilotStep) => rows.filter(r => r.stages[step] !== null).length;
  const funnel = PILOT_STEPS.map((step, i) => {
    const reached = count(step), advanced = i < PILOT_STEPS.length - 1 ? count(PILOT_STEPS[i + 1]!) : reached;
    const blocked = ["independent-practice", "transfer", "proof-eligible"].includes(step) ? rows.filter(r => r.stages[step] !== null && r.stages[PILOT_STEPS[i + 1]!] === null && r.blockedTopics.length > 0).length : 0;
    // Proof that is not due and a successful answer with no mistake are not dropout.
    const waiting = step === "transfer" ? rows.filter(r => r.stages.transfer !== null && r.stages["proof-eligible"] === null && !r.blockedTopics.length).length : 0;
    const notApplicable = step === "attempted" ? reached - advanced : 0;
    return { step, reached, advanced, supplyBlocked: blocked, waitingForDelay: waiting, notApplicable,
      behaviouralDropoff: Math.max(0, reached - advanced - blocked - waiting - notApplicable), conversion: rate(advanced, reached - blocked - waiting - notApplicable) };
  });
  const sum = (key: "marksLost" | "marksRepairedInPractice" | "marksProvenRecovered" | "studyMinutes" | "delayedProofsAttempted" | "delayedProofsPassed") => rows.reduce((n, r) => n + r[key], 0);
  const retention = (key: "day1" | "day7") => { const eligible = rows.filter(r => r[key].eligible); return rate(eligible.filter(r => r[key].returned).length, eligible.length); };
  const proofLearners = rows.filter(r => r.delayedProofsAttempted > 0);
  const minutes = sum("studyMinutes");
  return { learners: rows.length, minLearners,
    operational: { onboarding: rate(count("onboarded"), rows.length), diagnosticCompleted: rows.filter(r => r.diagnosticCompleted).length, diagnosticSkipped: rows.filter(r => r.diagnosticSkipped).length,
      recommendationStart: rate(count("recommendation-started"), count("recommendation-shown")), recommendationCompletion: rate(rows.filter(r => r.stages["recommendation-started"] !== null && r.recommendationsCompleted).length, count("recommendation-started")),
      secondSession: rate(rows.filter(r => r.secondSession).length, rows.filter(r => r.studyMinutes > 0).length) },
    learning: { marksLost: sum("marksLost"), marksRepairedInPractice: sum("marksRepairedInPractice"), marksProvenRecovered: sum("marksProvenRecovered"), studyMinutes: minutes,
      provenMarksPerHour: rows.filter(r => r.studyMinutes > 0).length >= minLearners && minutes > 0 ? sum("marksProvenRecovered") / (minutes / 60) : null,
      daysFromLossToProvenRecovery: rows.filter(r => r.daysToRecovery.length > 0).length >= minLearners ? rows.flatMap(r => r.daysToRecovery) : null },
    proof: { attempted: sum("delayedProofsAttempted"), passed: sum("delayedProofsPassed"), passRate: proofLearners.length >= minLearners ? rate(sum("delayedProofsPassed"), sum("delayedProofsAttempted")) : { ...rate(0, 0), numerator: sum("delayedProofsPassed"), denominator: sum("delayedProofsAttempted") },
      learnersBlockedBySupply: rows.filter(r => r.blockedTopics.length > 0).length, blockedTopics: [...new Set(rows.flatMap(r => r.blockedTopics))] },
    retention: { day1: retention("day1"), day7: retention("day7"), definition: "Return in [24h,48h) / [7d,8d) after first answer; denominator includes only fully observed windows." },
    reliability: { lowConfidenceEscalation: rate(rows.filter(r => r.reliability.markedAttempts > 0 && r.reliability.escalations > 0).length, rows.filter(r => r.reliability.markedAttempts > 0).length) },
    funnel, note: "Observed pilot outcomes are not causal evidence that Revise improves learning. Legacy exports missing milestones stay unobserved; they are never backfilled as completed journeys.",
  };
}
export type PilotReport = ReturnType<typeof buildPilotReport>;
