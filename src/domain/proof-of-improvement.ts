// ---------------------------------------------------------------------------
// Proof of improvement — did the revision work, on questions that count?
//
// Same-session performance and repeated questions are not evidence that the
// exam will go better. A gain is *proven* only when it shows up on
//
//   · different questions   (first exposure only: the answer was not seen)
//   · answered unaided      (no hint, no worked solution, no copied answer)
//   · after a delay         (at least MIN_PROOF_DELAY_DAYS since the student's
//                            last study of the topic and since the baseline)
//
// For each topic the earliest such answers form the baseline and the latest
// delayed ones the follow-up. A gain needs the follow-up's 80% lower bound to
// clear the baseline, so two lucky answers do not count.
//
// The same data exposes "looks learned": a topic answered well when the
// questions are familiar but poorly on new ones. That is the pattern a
// confident student most needs to hear about.
//
// The ledger also yields the learner's own conversion rate (how much of the
// available headroom a revision cycle has actually closed), which replaces a
// product default as the evidence grows.
//
// Pure domain: no React, no storage, no network.
// ---------------------------------------------------------------------------

import { trustedAdaptiveEvidence } from "./adaptive-scoring";
import { exposureWeights } from "./evidence-weights";
import { betaInterval } from "./marks-value";
import { topicShares } from "./topic-weight";
import type { Attempt, Id, IsoDate, IsoInstant, Question, ReviewLog, Topic } from "./types";

export const MIN_PROOF_DELAY_DAYS = 3;
/** Earliest independent first answers used as the baseline. */
export const BASELINE_QUESTIONS = 3;
/** Latest delayed answers used as the follow-up. */
export const FOLLOW_UP_QUESTIONS = 5;
/** Answers needed on each side before a comparison is made. */
export const MIN_PER_WINDOW = 2;
/** Smallest change in score treated as a real gain or loss. */
export const MEANINGFUL_CHANGE = 0.15;
/** A topic already this strong that stays this strong is "held", not "gained". */
const HELD_RATE = 0.75;
/** Familiar-question score and unseen-question score this far apart is "looks learned". */
const ILLUSION_FAMILIAR = 0.8;
const ILLUSION_UNSEEN = 0.55;
/** The headroom a revision cycle closes, before this learner has any observed cycles. */
export const CONVERSION_PRIOR = 0.4;
const CONVERSION_PRIOR_PAIRS = 3;

const DAY_MS = 86_400_000;

export type ProofStatus = "proven-gain" | "held" | "no-clear-change" | "declined" | "awaiting-proof" | "untested";

export interface ProofWindow {
  rate: number;
  low: number;
  high: number;
  questions: number;
  from: IsoInstant;
  to: IsoInstant;
}

export interface TopicProof {
  topicId: Id;
  subjectId: Id;
  /** Share of the subject's assessed content (see topic-weight). */
  share: number;
  status: ProofStatus;
  before: ProofWindow | null;
  after: ProofWindow | null;
  /** After minus before, as a share of marks; null until both windows exist. */
  gain: number | null;
  /** Days between the end of the baseline and the start of the follow-up. */
  delayDays: number | null;
  /** First day a delayed unseen answer would count; null when no study has happened yet. */
  provableFrom: IsoDate | null;
  /** The delay has passed and the topic has no follow-up yet: an unseen test is due. */
  proofDue: boolean;
  /** Score on independent repeats of questions already seen, and on new ones. */
  familiarRate: number | null;
  unseenRate: number | null;
  illusory: boolean;
  /** Marks on a 100-mark exam: gain × share × 100 for proven gains and declines, else 0. */
  markPoints: number;
}

export interface SubjectProof {
  provenMarks: number;
  declinedMarks: number;
  proven: number;
  awaiting: number;
  illusory: number;
}

export interface ProofLedger {
  topics: TopicProof[];
  conversion: { rate: number; pairs: number; observed: boolean };
  bySubject: Record<Id, SubjectProof>;
  provenMarks: number;
  proven: number;
  declined: number;
  awaiting: number;
  /** Topics whose delay has passed and that still have no follow-up: a test on new questions is due. */
  due: number;
  illusory: number;
  headline: string;
}

export interface ProofInput {
  topics: readonly Topic[];
  attempts: readonly Attempt[];
  questions: readonly Question[];
  reviewLogs?: readonly ReviewLog[];
  now?: Date;
}

interface Observation {
  at: number;
  iso: IsoInstant;
  rate: number;
}

function round(value: number, places = 3): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function windowOf(observations: readonly Observation[]): ProofWindow | null {
  const first = observations[0];
  const last = observations[observations.length - 1];
  if (!first || !last) return null;
  const successes = observations.reduce((sum, row) => sum + row.rate, 0);
  const { low, high } = betaInterval(successes, observations.length);
  return { rate: round(successes / observations.length), low: round(low), high: round(high), questions: observations.length, from: first.iso, to: last.iso };
}

function isoDay(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

function independent(attempt: Attempt): boolean {
  return !attempt.hintTier && !attempt.repairTeachingSeen && !attempt.copiedAnswer;
}

export function buildProofLedger(input: ProofInput): ProofLedger {
  const nowMs = (input.now ?? new Date()).getTime();
  const shares = topicShares(input.topics);
  const exposure = exposureWeights(input.attempts);
  const trusted = trustedAdaptiveEvidence({ attempts: input.attempts, mistakes: [], questions: [...input.questions] }).attempts;

  const byTopic = new Map<Id, Attempt[]>();
  for (const attempt of trusted) {
    if (attempt.max <= 0) continue;
    for (const topicId of new Set(attempt.topicIds)) {
      const list = byTopic.get(topicId);
      if (list) list.push(attempt);
      else byTopic.set(topicId, [attempt]);
    }
  }
  const reviewsByTopic = new Map<Id, number[]>();
  for (const log of input.reviewLogs ?? []) {
    const at = Date.parse(log.reviewedAt);
    if (!Number.isFinite(at)) continue;
    const list = reviewsByTopic.get(log.topicId);
    if (list) list.push(at);
    else reviewsByTopic.set(log.topicId, [at]);
  }

  const rows: TopicProof[] = input.topics.map((topic) => {
    const attempts = (byTopic.get(topic.id) ?? [])
      .filter((attempt) => Number.isFinite(Date.parse(attempt.createdAt)))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

    const unseen: Observation[] = [];
    const familiar: Observation[] = [];
    // Anything that is not an unaided first answer is study: it can teach, so it resets the delay clock.
    const study: number[] = [...(reviewsByTopic.get(topic.id) ?? [])];
    for (const attempt of attempts) {
      const observation = { at: Date.parse(attempt.createdAt), iso: attempt.createdAt, rate: Math.min(1, Math.max(0, attempt.awarded / attempt.max)) };
      const first = (exposure.get(attempt.id) ?? 1) === 1;
      if (attempt.mode === "recall" || !independent(attempt)) study.push(observation.at);
      else if (first) unseen.push(observation);
      else {
        familiar.push(observation);
        study.push(observation.at);
      }
    }
    study.sort((a, b) => a - b);

    const share = shares.get(topic.id) ?? 0;
    const baseline = unseen.slice(0, BASELINE_QUESTIONS);
    const baselineEnd = baseline[baseline.length - 1]?.at ?? null;
    const lastStudy = study[study.length - 1] ?? null;
    const delayMs = MIN_PROOF_DELAY_DAYS * DAY_MS;

    // A follow-up answer counts only if the baseline and the most recent study before it are both old enough.
    const delayed = baselineEnd === null ? [] : unseen.slice(baseline.length).filter((row) => {
      if (row.at - baselineEnd < delayMs) return false;
      const priorStudy = [...study].reverse().find((time) => time < row.at);
      return priorStudy === undefined || row.at - priorStudy >= delayMs;
    });
    const followUp = delayed.slice(-FOLLOW_UP_QUESTIONS);
    const before = baseline.length >= MIN_PER_WINDOW ? windowOf(baseline) : null;
    const after = followUp.length >= MIN_PER_WINDOW ? windowOf(followUp) : null;

    const anchor = Math.max(baselineEnd ?? 0, lastStudy ?? 0);
    const provableFromMs = before && anchor ? anchor + delayMs : null;
    const gain = before && after ? round(after.rate - before.rate) : null;

    let status: ProofStatus;
    if (!before) status = "untested";
    else if (!after || gain === null) status = "awaiting-proof";
    else if (gain >= MEANINGFUL_CHANGE && after.low > before.rate) status = "proven-gain";
    else if (gain <= -MEANINGFUL_CHANGE && after.high < before.rate) status = "declined";
    else if (before.rate >= HELD_RATE && after.rate >= HELD_RATE) status = "held";
    else status = "no-clear-change";

    const recent = unseen.slice(-FOLLOW_UP_QUESTIONS);
    const familiarRate = familiar.length >= MIN_PER_WINDOW ? round(familiar.reduce((sum, row) => sum + row.rate, 0) / familiar.length) : null;
    const unseenRate = recent.length >= MIN_PER_WINDOW ? round(recent.reduce((sum, row) => sum + row.rate, 0) / recent.length) : null;
    const illusory = familiarRate !== null && unseenRate !== null && familiarRate >= ILLUSION_FAMILIAR && unseenRate <= ILLUSION_UNSEEN;
    const counted = status === "proven-gain" || status === "declined";

    return {
      topicId: topic.id,
      subjectId: topic.subjectId,
      share: round(share, 4),
      status,
      before,
      after,
      gain,
      delayDays: before && after ? Math.floor((Date.parse(after.from) - Date.parse(before.to)) / DAY_MS) : null,
      provableFrom: provableFromMs ? isoDay(provableFromMs) : null,
      proofDue: status === "awaiting-proof" && provableFromMs !== null && nowMs >= provableFromMs,
      familiarRate,
      unseenRate,
      illusory,
      markPoints: counted && gain !== null ? round(gain * share * 100, 2) : 0,
    };
  });

  const order: Record<ProofStatus, number> = { "proven-gain": 0, declined: 1, "awaiting-proof": 2, held: 3, "no-clear-change": 4, untested: 5 };
  rows.sort((a, b) => Number(b.illusory) - Number(a.illusory) || order[a.status] - order[b.status] || Math.abs(b.markPoints) - Math.abs(a.markPoints) || a.topicId.localeCompare(b.topicId));

  // The learner's own rate of closing headroom, shrunk toward the product prior while pairs are few.
  const realised = rows
    .filter((row) => row.before && row.after && row.before.rate < 0.85)
    .map((row) => Math.min(1, Math.max(0, ((row.after?.rate ?? 0) - (row.before?.rate ?? 0)) / (1 - (row.before?.rate ?? 0)))));
  const conversionRate = (CONVERSION_PRIOR * CONVERSION_PRIOR_PAIRS + realised.reduce((sum, value) => sum + value, 0)) / (CONVERSION_PRIOR_PAIRS + realised.length);

  const bySubject: Record<Id, SubjectProof> = {};
  for (const row of rows) {
    const subject = (bySubject[row.subjectId] ??= { provenMarks: 0, declinedMarks: 0, proven: 0, awaiting: 0, illusory: 0 });
    if (row.status === "proven-gain") {
      subject.provenMarks = round(subject.provenMarks + row.markPoints, 2);
      subject.proven += 1;
    }
    if (row.status === "declined") subject.declinedMarks = round(subject.declinedMarks + Math.abs(row.markPoints), 2);
    if (row.status === "awaiting-proof") subject.awaiting += 1;
    if (row.illusory) subject.illusory += 1;
  }

  const proven = rows.filter((row) => row.status === "proven-gain").length;
  const declined = rows.filter((row) => row.status === "declined").length;
  const awaiting = rows.filter((row) => row.status === "awaiting-proof").length;
  const due = rows.filter((row) => row.proofDue).length;
  const illusory = rows.filter((row) => row.illusory).length;
  const provenMarks = round(rows.filter((row) => row.status === "proven-gain").reduce((sum, row) => sum + row.markPoints, 0), 1);

  return {
    topics: rows,
    conversion: { rate: round(conversionRate), pairs: realised.length, observed: realised.length > 0 },
    bySubject,
    provenMarks,
    proven,
    declined,
    awaiting,
    due,
    illusory,
    headline: headlineFor({ proven, provenMarks, awaiting, due, illusory, declined }),
  };
}

function headlineFor(input: { proven: number; provenMarks: number; awaiting: number; due: number; illusory: number; declined: number }): string {
  const { proven, provenMarks, awaiting, due, illusory, declined } = input;
  if (proven) {
    return `Proven on new questions after a delay: about +${provenMarks} marks across ${proven} topic${proven === 1 ? "" : "s"}.${declined ? ` ${declined} topic${declined === 1 ? " has" : "s have"} slipped.` : ""}`;
  }
  if (declined) return `${declined} topic${declined === 1 ? " has" : "s have"} slipped on new questions since your first answers.`;
  if (due) return `Nothing proven yet. ${due} topic${due === 1 ? " is" : "s are"} ready to be proven on new questions.`;
  if (awaiting) return "Nothing proven yet. A few topics have a baseline and are waiting for new questions after a delay.";
  if (illusory) return "Nothing proven yet, and some topics look learned only on familiar questions.";
  return "Nothing proven yet. Proof needs new questions answered unaided, days after you studied.";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "2026-10-04" → "4 Oct", independent of locale and time zone. */
export function shortDate(iso: IsoDate): string {
  const [, month, day] = iso.split("-");
  const name = MONTHS[Number(month) - 1];
  return name && day ? `${Number(day)} ${name}` : iso;
}

/** One honest sentence on where a topic stands, shared by Today and the session debrief. */
export function proofLine(proof?: Pick<TopicProof, "status" | "provableFrom" | "proofDue" | "gain" | "illusory">): string {
  if (proof?.status === "proven-gain" && proof.gain !== null) {
    return `Already proven here: up ${Math.round(proof.gain * 100)} points on new questions after a delay.`;
  }
  if (proof?.illusory) return "Looks learned on familiar questions but not on new ones. New questions will show which it is.";
  if (proof?.proofDue) return "Proof is due: unaided answers to new questions will show whether the earlier work has stuck.";
  if (proof?.status === "awaiting-proof" && proof.provableFrom) {
    return `New questions from ${shortDate(proof.provableFrom)} will show whether this has stuck.`;
  }
  return "Unaided answers to new questions today become the baseline that later sessions are measured against.";
}
