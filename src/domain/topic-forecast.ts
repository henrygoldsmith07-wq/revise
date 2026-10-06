// ---------------------------------------------------------------------------
// Topic forecast — "what will the next paper most likely test?"
//
// Seneca-style apps sell a predicted paper. Revise can do better honestly:
// it cannot see the board's confidential papers, so it forecasts topics,
// not questions. The forecast is derived from the papers the student
// actually has, and every number it shows is backed by that sample or by
// published spec structure — never an invented statistic.
//
// Inputs, all measured:
//   paperSignals — how the papers in hand spread their marks across topics
//                  (marks split between a question's mapped topics, the same
//                  convention as mock-planning and the mock generator);
//   specPrior    — each topic's share of the specification's statements
//                  (topicShares), i.e. what the board says the exam covers;
//   risk         — the learner's current evidence on the topic: mastery,
//                  trusted accuracy, open mistakes and forgetting.
//
// Honesty rules:
//   — the forecast never invents probability: with zero papers the row is
//     prior-only and labelled as such;
//   — every topic row names its evidence ("across 3 papers", "no papers —
//     spec weight only");
//   — unseen topics get a neutral prior (0.5), never a fabricated weakness;
//   — confidence in the whole forecast grows with the number of papers the
//     sample holds and falls as their topics diverge from the spec mix.
// Pure domain: no React, no storage; `now` is passed in.
// ---------------------------------------------------------------------------

import { topicShares } from "./topic-weight";
import { trustworthyAttempt } from "./learning-evidence";
import type { Attempt, Id, Mistake, Paper, Question, Topic, TopicMastery } from "./types";

/** Topics displayed per forecast row list; UI panels slice to this. */
export const FORECAST_MAX_TOPICS = 8;
/** Papers held before the forecast stops being labelled provisional. */
export const FORECAST_CONFIDENT_PAPERS = 3;
/** Half-life in days for the forgetting part of the risk score. */
export const FORECAST_RETENTION_HALF_LIFE_DAYS = 14;
/** Measured accuracy below this counts a topic as risky. */
export const FORECAST_LOW_ACCURACY = 0.6;

export type ForecastEvidence = "papers" | "spec-only";

export interface TopicForecastRow {
  topicId: Id;
  title: string;
  unitId: Id;
  /** Expected share of the next paper's marks, 0–1 (prior blended with sample). */
  expectedShare: number;
  /** Share implied by the papers in hand alone, or null with no papers. */
  sampleShare: number | null;
  /** Share implied by the specification structure alone. */
  specShare: number;
  /** Marks on a typical 100-mark paper, rounded to the nearest half. */
  expectedMarks: number;
  /** 0–1: mastery, trusted accuracy and retention all pull it down. */
  risk: number;
  riskLabel: "secure" | "watch" | "at-risk";
  openMistakes: number;
  evidence: ForecastEvidence;
  evidenceNote: string;
  rationale: string;
}

export interface TopicForecast {
  subjectId: Id;
  /** Distinct papers behind the sample signal. */
  papersCount: number;
  questionsCount: number;
  /** Distinct topics the held papers actually test. */
  coveredTopics: number;
  /** 0–1: sample size and spec agreement behind the paper signal. */
  confidence: number;
  provisional: boolean;
  rows: TopicForecastRow[];
  /** One-line summary for the panel header. */
  headline: string;
  notes: string[];
}

export interface TopicForecastInput {
  subjectId: Id;
  papers: Paper[];
  questions: Question[];
  topics: Topic[];
  mastery: TopicMastery[];
  attempts: Attempt[];
  mistakes?: Mistake[];
  /** Blend of spec prior vs paper sample; default 0.5. */
  priorWeight?: number;
  now?: Date;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** How many distinct papers each question belongs to; a question sat in two papers counts once per paper. */
function paperQuestions(input: TopicForecastInput): { paperId: Id; question: Question }[] {
  const questionById = new Map(input.questions.map((question) => [question.id, question] as const));
  const rows: { paperId: Id; question: Question }[] = [];
  for (const paper of input.papers) {
    for (const questionId of paper.questionIds) {
      const question = questionById.get(questionId);
      if (question && question.subjectId === input.subjectId) rows.push({ paperId: paper.id, question });
    }
  }
  return rows;
}

/** Sample share of marks per topic across the held papers (multi-topic marks split evenly). */
function sampleShares(rows: { paperId: Id; question: Question }[], topicById: Map<Id, Topic>): Map<Id, number> {
  const acc = new Map<Id, number>();
  let total = 0;
  for (const { question } of rows) {
    const mapped = [...new Set(question.topicIds)].filter((topicId) => topicById.has(topicId));
    if (!mapped.length) continue;
    const share = question.totalMarks / mapped.length;
    for (const topicId of mapped) {
      acc.set(topicId, (acc.get(topicId) ?? 0) + share);
      total += share;
    }
  }
  const shares = new Map<Id, number>();
  for (const [topicId, marks] of acc) shares.set(topicId, total > 0 ? marks / total : 0);
  return shares;
}

/** Learner risk for one topic: missing mastery, weak trusted accuracy, open mistakes and decay. */
function topicRisk(input: {
  topicId: Id;
  subjectId: Id;
  masteryRow: TopicMastery | undefined;
  attempts: Attempt[];
  openMistakes: number;
  now: Date;
}): { risk: number; label: "secure" | "watch" | "at-risk" } {
  const masteryRow = input.masteryRow;
  const measured = masteryRow && masteryRow.attempts > 0 ? clamp01(masteryRow.mastery) : null;
  const scorable = input.attempts.filter((attempt) => attempt.max > 0);
  let accuracy: number | null = null;
  if (scorable.length) {
    const available = scorable.reduce((sum, attempt) => sum + attempt.max, 0);
    const awarded = scorable.reduce((sum, attempt) => sum + attempt.awarded, 0);
    if (available > 0) accuracy = clamp01(awarded / available);
  }
  // Forgetting: mastery decays with a 14-day half-life since last study.
  let retentionPenalty = 0;
  if (masteryRow?.lastStudiedAt) {
    const days = Math.max(0, (input.now.getTime() - Date.parse(masteryRow.lastStudiedAt)) / 86_400_000);
    if (Number.isFinite(days) && days > 0) {
      retentionPenalty = measured ?? 0.5;
      retentionPenalty *= 1 - 2 ** (-days / FORECAST_RETENTION_HALF_LIFE_DAYS);
    }
  }
  const mistakePenalty = Math.min(0.2, input.openMistakes * 0.07);
  const base = measured ?? accuracy ?? 0.5;
  const risk = clamp01(1 - base + retentionPenalty * 0.5 + mistakePenalty);
  const label: "secure" | "watch" | "at-risk" =
    risk >= 0.55 ? "at-risk" : risk >= 0.3 ? "watch" : "secure";
  return { risk: round(risk), label };
}

function riskRationale(row: { title: string; risk: number; label: "secure" | "watch" | "at-risk"; openMistakes: number }): string {
  if (row.label === "at-risk") {
    return row.openMistakes > 0
      ? `${row.openMistakes} open mistake${row.openMistakes === 1 ? "" : "s"} and weak measured evidence — revise before the paper lands on it.`
      : `Measured evidence is weak — treat ${row.title} as priority revision.`;
  }
  if (row.label === "watch") {
    return "Partly secure — a retrieval check per week keeps it out of the at-risk band.";
  }
  return "Currently secure — keep it warm, the paper will still sample it.";
}

/**
 * Forecast the topic mix of the next paper for one subject.
 *
 * Each topic's expected share blends the spec prior with the sample from the
 * papers in hand (`priorWeight` controls the blend; default 0.5). With no
 * papers the forecast is prior-only and every row says so. Confidence grows
 * with distinct papers and falls when the sample's topic mix diverges from
 * the spec mix — a small, odd sample should not shout.
 */
export function forecastNextPaper(input: TopicForecastInput): TopicForecast {
  const now = input.now ?? new Date();
  const priorWeight = clamp01(input.priorWeight ?? 0.5);
  const mistakes = input.mistakes ?? [];
  const topicById = new Map(input.topics.map((topic) => [topic.id, topic] as const));
  const masteryById = new Map(input.mastery.map((row) => [row.topicId, row] as const));

  const papers = input.papers.filter((paper) => paper.subjectId === input.subjectId && paper.questionIds.length > 0);
  const rows = paperQuestions(input);
  const sampled = sampleShares(rows, topicById);
  const spec = topicShares(input.topics.filter((topic) => topic.subjectId === input.subjectId));

  // Trusted attempts grouped by topic, for accuracy and mistake evidence.
  const questionById = new Map(input.questions.map((question) => [question.id, question] as const));
  const attemptsByTopic = new Map<Id, Attempt[]>();
  for (const attempt of input.attempts) {
    if (attempt.subjectId !== input.subjectId || !trustworthyAttempt(attempt)) continue;
    const question = questionById.get(attempt.questionId);
    if (!question) continue;
    for (const topicId of new Set(question.topicIds)) {
      const list = attemptsByTopic.get(topicId) ?? [];
      list.push(attempt);
      attemptsByTopic.set(topicId, list);
    }
  }

  const coveredTopics = sampled.size;
  const papersCount = papers.length;
  // Confidence: sample size (papers held) times agreement between the sample
  // mix and the spec mix. A one-paper sample, or one whose topic mix looks
  // nothing like the spec, stays provisional.
  let divergence = 0;
  for (const [topicId, sample] of sampled) {
    const specShare = spec.get(topicId) ?? 0;
    divergence += Math.abs(sample - specShare);
  }
  for (const [topicId, specShare] of spec) {
    if (!sampled.has(topicId)) divergence += specShare;
  }
  const sizeFactor = clamp01(papersCount / FORECAST_CONFIDENT_PAPERS);
  const agreement = clamp01(1 - divergence);
  const confidence = round(papersCount ? sizeFactor * (0.35 + 0.65 * agreement) : 0);

  const forecastRows: TopicForecastRow[] = input.topics
    .filter((topic) => topic.subjectId === input.subjectId)
    .map((topic) => {
      const specShare = spec.get(topic.id) ?? 0;
      const sampleShare = sampled.get(topic.id) ?? null;
      const evidence: ForecastEvidence = sampleShare != null ? "papers" : "spec-only";
      const blended = sampleShare != null
        ? (1 - priorWeight) * specShare + priorWeight * sampleShare
        : specShare;
      const riskRow = topicRisk({
        topicId: topic.id,
        subjectId: input.subjectId,
        masteryRow: masteryById.get(topic.id),
        attempts: attemptsByTopic.get(topic.id) ?? [],
        openMistakes: mistakes.filter(
          (mistake) => mistake.subjectId === input.subjectId && mistake.topicId === topic.id && !mistake.resolved,
        ).length,
        now,
      });
      const openMistakes = mistakes.filter(
        (mistake) => mistake.subjectId === input.subjectId && mistake.topicId === topic.id && !mistake.resolved,
      ).length;
      const evidenceNote = evidence === "papers"
        ? `Sampled across ${papersCount} paper${papersCount === 1 ? "" : "s"} in hand`
        : "No papers cover this topic yet — spec weight only";
      return {
        topicId: topic.id,
        title: topic.title,
        unitId: topic.unitId,
        expectedShare: round(blended, 4),
        sampleShare: sampleShare != null ? round(sampleShare, 4) : null,
        specShare: round(specShare, 4),
        expectedMarks: Math.round(blended * 100 * 2) / 2,
        risk: riskRow.risk,
        riskLabel: riskRow.label,
        openMistakes,
        evidence,
        evidenceNote,
        rationale: riskRationale({ title: topic.title, risk: riskRow.risk, label: riskRow.label, openMistakes }),
      };
    })
    .sort(
      (a, b) =>
        b.expectedShare * (1 + b.risk) - a.expectedShare * (1 + a.risk) ||
        a.title.localeCompare(b.title),
    );

  const provisional = papersCount < FORECAST_CONFIDENT_PAPERS;
  const atRisk = forecastRows.filter((row) => row.riskLabel === "at-risk");
  const lead = forecastRows[0];
  const headline = lead
    ? papersCount
      ? `Across ${papersCount} paper${papersCount === 1 ? "" : "s"} in hand, ${lead.title} looks most likely next${atRisk.length ? ` — and ${atRisk.length} high-share topic${atRisk.length === 1 ? " is" : "s are"} still at risk` : ""}.`
      : `No papers in hand yet — this is spec weighting only, not a sample.`
    : "No topics to forecast yet.";

  const notes: string[] = [];
  if (provisional && papersCount > 0) {
    notes.push(`Only ${papersCount} paper${papersCount === 1 ? "" : "s"} in hand — import more papers and the sample shar${papersCount === 1 ? "e sharpens" : "es sharpen"}.`);
  }
  if (coveredTopics < forecastRows.length) {
    notes.push(`${forecastRows.length - coveredTopics} topic${forecastRows.length - coveredTopics === 1 ? " has" : "s have"} never appeared in the papers you hold — forecast from spec weight only.`);
  }
  if (atRisk.length) {
    notes.push(`${atRisk.length} likely topic${atRisk.length === 1 ? "" : "s"} ${atRisk.length === 1 ? "is" : "are"} at risk — revise before the paper samples ${atRisk.length === 1 ? "it" : "them"}.`);
  }

  return {
    subjectId: input.subjectId,
    papersCount,
    questionsCount: rows.length,
    coveredTopics,
    confidence,
    provisional,
    rows: forecastRows,
    headline,
    notes,
  };
}
