import type { Attempt, Id, Paper, Question, Subject } from "./types";

/** The existing mistake classifier uses the same exam-time baseline. */
export const DEFAULT_SECONDS_PER_MARK = 90;
const RUSHED_RATIO = 0.75;
const SLOW_RATIO = 1.35;
const MIN_SAMPLES = 3;

export type ResponseTimeStatus = "insufficient-data" | "rushed" | "calibrated" | "overthinking";
export type ResponseTimeQuality = "insufficient" | "emerging" | "stable";
export type ResponseTimeTiming = "rushed" | "on-target" | "slow";

export interface ResponseTimeObservation {
  attemptId: Id;
  questionId: Id;
  subjectId: Id;
  topicIds: Id[];
  mode: Attempt["mode"];
  createdAt: string;
  seconds: number;
  marks: number;
  awarded: number;
  accuracy: number;
  targetSecondsPerMark: number;
  secondsPerMark: number;
  ratio: number;
  timing: ResponseTimeTiming;
  paperId?: Id;
}

export interface ResponseTimeAggregate {
  attempts: number;
  measuredMarks: number;
  awardedMarks: number;
  lostMarks: number;
  accuracy: number | null;
  actualSecondsPerMark: number | null;
  targetSecondsPerMark: number;
  ratio: number | null;
  medianRatio: number | null;
  rushedAttempts: number;
  onTargetAttempts: number;
  slowAttempts: number;
  rushedAccuracy: number | null;
  onTargetAccuracy: number | null;
  slowAccuracy: number | null;
  status: ResponseTimeStatus;
  quality: ResponseTimeQuality;
}

export interface ResponseTimeTopicSummary extends ResponseTimeAggregate {
  topicId: Id;
}

export interface ResponseTimeSubjectSummary extends ResponseTimeAggregate {
  subjectId: Id;
  topics: ResponseTimeTopicSummary[];
  recommendation: string;
}

export interface ResponseTimeCalibrationReport {
  observations: ResponseTimeObservation[];
  rows: ResponseTimeSubjectSummary[];
  overall: ResponseTimeAggregate;
  totalAttempts: number;
}

export interface ResponseTimeCalibrationInput {
  attempts: Attempt[];
  questions: Question[];
  papers: Paper[];
  subjects: Subject[];
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function timingFor(ratio: number): ResponseTimeTiming {
  if (ratio < RUSHED_RATIO) return "rushed";
  if (ratio > SLOW_RATIO) return "slow";
  return "on-target";
}

function statusFor(sampleSize: number, medianRatio: number | null): ResponseTimeStatus {
  if (sampleSize < MIN_SAMPLES || medianRatio == null) return "insufficient-data";
  if (medianRatio < RUSHED_RATIO) return "rushed";
  if (medianRatio > SLOW_RATIO) return "overthinking";
  return "calibrated";
}

function qualityFor(sampleSize: number): ResponseTimeQuality {
  if (sampleSize < MIN_SAMPLES) return "insufficient";
  if (sampleSize < 8) return "emerging";
  return "stable";
}

function accuracyFor(observations: ResponseTimeObservation[]): number | null {
  const marks = observations.reduce((sum, observation) => sum + observation.marks, 0);
  if (!marks) return null;
  return observations.reduce((sum, observation) => sum + observation.awarded, 0) / marks;
}

function aggregate(observations: ResponseTimeObservation[], defaultTarget: number): ResponseTimeAggregate {
  const measuredMarks = observations.reduce((sum, observation) => sum + observation.marks, 0);
  const awardedMarks = observations.reduce((sum, observation) => sum + observation.awarded, 0);
  const targetSecondsPerMark = measuredMarks
    ? observations.reduce((sum, observation) => sum + observation.targetSecondsPerMark * observation.marks, 0) / measuredMarks
    : defaultTarget;
  const totalSeconds = observations.reduce((sum, observation) => sum + observation.seconds, 0);
  const actualSecondsPerMark = measuredMarks ? totalSeconds / measuredMarks : null;
  const ratios = observations.map((observation) => observation.ratio);
  const medianRatio = median(ratios);
  const byTiming = (timing: ResponseTimeTiming) => observations.filter((observation) => observation.timing === timing);
  const rushed = byTiming("rushed");
  const onTarget = byTiming("on-target");
  const slow = byTiming("slow");

  return {
    attempts: observations.length,
    measuredMarks,
    awardedMarks,
    lostMarks: measuredMarks - awardedMarks,
    accuracy: accuracyFor(observations),
    actualSecondsPerMark,
    targetSecondsPerMark,
    ratio: actualSecondsPerMark == null ? null : actualSecondsPerMark / targetSecondsPerMark,
    medianRatio,
    rushedAttempts: rushed.length,
    onTargetAttempts: onTarget.length,
    slowAttempts: slow.length,
    rushedAccuracy: accuracyFor(rushed),
    onTargetAccuracy: accuracyFor(onTarget),
    slowAccuracy: accuracyFor(slow),
    status: statusFor(observations.length, medianRatio),
    quality: qualityFor(observations.length),
  };
}

function targetFor(question: Question, subject: Subject | undefined, papersById: Map<Id, Paper>): number {
  const paper = question.paperId ? papersById.get(question.paperId) : undefined;
  const paperSpec = subject?.papers.find((candidate) => candidate.id === paper?.paperSpecId) ?? subject?.papers[0];
  if (!paper || !paper.totalMarks || !paperSpec?.durationMinutes) return DEFAULT_SECONDS_PER_MARK;
  return (paperSpec.durationMinutes * 60) / paper.totalMarks;
}

function recommendationFor(row: ResponseTimeSubjectSummary): string {
  if (row.status === "insufficient-data") {
    return "Complete three marked questions with the timer running before judging your pace.";
  }
  if (row.status === "rushed") {
    return row.rushedAccuracy != null && row.accuracy != null && row.rushedAccuracy < row.accuracy - 0.1
      ? "Your rushed answers are costing marks. Spend the first few seconds planning and leave a final check before submitting."
      : "You are answering ahead of the exam budget. Use the spare time to check units, command words and missed marks.";
  }
  if (row.status === "overthinking") {
    return row.slowAccuracy != null && row.accuracy != null && row.slowAccuracy >= row.accuracy
      ? "Your marks are holding up, but answers run long. Practise short timed sets and move on when the marks are covered."
      : "Long answers are not converting into enough marks. Write the method, answer the command word, then move on."
  }
  return "Your pace is close to the exam budget. Keep using short timed sets so accuracy and speed stay together.";
}

function topicSummaries(observations: ResponseTimeObservation[], defaultTarget: number): ResponseTimeTopicSummary[] {
  const byTopic = new Map<Id, ResponseTimeObservation[]>();
  for (const observation of observations) {
    const topicIds = observation.topicIds.length ? observation.topicIds : ["unknown"];
    for (const topicId of topicIds) {
      const list = byTopic.get(topicId) ?? [];
      list.push({
        ...observation,
        marks: observation.marks / topicIds.length,
        awarded: observation.awarded / topicIds.length,
      });
      byTopic.set(topicId, list);
    }
  }
  return [...byTopic.entries()]
    .map(([topicId, list]) => ({ topicId, ...aggregate(list, defaultTarget) }))
    .sort((a, b) => Math.abs((b.ratio ?? 0) - 1) - Math.abs((a.ratio ?? 0) - 1));
}

export function buildResponseTimeCalibration(input: ResponseTimeCalibrationInput): ResponseTimeCalibrationReport {
  const questionsById = new Map(input.questions.map((question) => [question.id, question] as const));
  const papersById = new Map(input.papers.map((paper) => [paper.id, paper] as const));
  const subjectsById = new Map(input.subjects.map((subject) => [subject.id, subject] as const));
  const observations: ResponseTimeObservation[] = [];

  for (const attempt of input.attempts) {
    const question = questionsById.get(attempt.questionId);
    const marks = Number(attempt.max);
    const elapsedMs = Number(attempt.elapsedMs);
    if (!question || !Number.isFinite(marks) || marks <= 0 || !Number.isFinite(elapsedMs) || elapsedMs <= 0) continue;
    const seconds = elapsedMs / 1000;
    const secondsPerMark = seconds / marks;
    const targetSecondsPerMark = targetFor(question, subjectsById.get(attempt.subjectId), papersById);
    const ratio = secondsPerMark / targetSecondsPerMark;
    observations.push({
      attemptId: attempt.id,
      questionId: attempt.questionId,
      subjectId: attempt.subjectId,
      topicIds: attempt.topicIds.length ? attempt.topicIds : question.topicIds,
      mode: attempt.mode,
      createdAt: attempt.createdAt,
      seconds,
      marks,
      awarded: Math.max(0, Math.min(marks, attempt.awarded)),
      accuracy: marks ? Math.max(0, Math.min(1, attempt.awarded / marks)) : 0,
      targetSecondsPerMark,
      secondsPerMark,
      ratio,
      timing: timingFor(ratio),
      paperId: question.paperId,
    });
  }

  const rows = input.subjects.map((subject) => {
    const subjectObservations = observations.filter((observation) => observation.subjectId === subject.id);
    const summary = aggregate(subjectObservations, DEFAULT_SECONDS_PER_MARK);
    const row: ResponseTimeSubjectSummary = {
      subjectId: subject.id,
      ...summary,
      topics: topicSummaries(subjectObservations, summary.targetSecondsPerMark),
      recommendation: "",
    };
    row.recommendation = recommendationFor(row);
    return row;
  });

  return {
    observations,
    rows,
    overall: aggregate(observations, DEFAULT_SECONDS_PER_MARK),
    totalAttempts: input.attempts.length,
  };
}
