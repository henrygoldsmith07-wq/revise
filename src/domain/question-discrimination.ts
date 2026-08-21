import type {
  Attempt,
  Id,
  Question,
  QuestionDiscriminationBand,
  QuestionDiscriminationMeasurement,
} from "./types";

export interface QuestionDiscriminationOptions {
  /** Minimum usable learners before a correlation is reported. Defaults to 5. */
  minSampleSize?: number;
  /** Lower bound for an acceptable positive discriminator. Defaults to 0.2. */
  acceptableThreshold?: number;
  /** Lower bound for a strong positive discriminator. Defaults to 0.3. */
  strongThreshold?: number;
}

export interface MeasureQuestionDiscriminationInput {
  question: Pick<Question, "id" | "subjectId">;
  attempts: Attempt[];
  /** Ability scores should exclude the target question when supplied. */
  abilityByUserId?: ReadonlyMap<Id, number> | Readonly<Record<Id, number>>;
  options?: QuestionDiscriminationOptions;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function scoreOf(attempt: Attempt): number | null {
  if (!Number.isFinite(attempt.awarded) || !Number.isFinite(attempt.max) || attempt.max <= 0) return null;
  return Math.max(0, Math.min(1, attempt.awarded / attempt.max));
}

function latestByUserAndQuestion(attempts: Attempt[]): Attempt[] {
  const latest = new Map<string, Attempt>();
  for (const attempt of attempts) {
    const key = `${attempt.userId}\u0000${attempt.questionId}`;
    const current = latest.get(key);
    if (!current || attempt.createdAt > current.createdAt) latest.set(key, attempt);
  }
  return [...latest.values()];
}

function readAbility(
  abilityByUserId: MeasureQuestionDiscriminationInput["abilityByUserId"],
  userId: Id,
): number | null {
  if (!abilityByUserId) return null;
  const value =
    typeof (abilityByUserId as ReadonlyMap<Id, number>).get === "function"
      ? (abilityByUserId as ReadonlyMap<Id, number>).get(userId)
      : (abilityByUserId as Readonly<Record<Id, number>>)[userId];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let numerator = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index] - meanX;
    const dy = ys[index] - meanY;
    numerator += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  const denominator = Math.sqrt(varianceX * varianceY);
  if (denominator === 0) return null;
  return Math.max(-1, Math.min(1, numerator / denominator));
}

function confidenceInterval(
  correlation: number,
  sampleSize: number,
): { standardError: number; lower: number; upper: number } | null {
  if (sampleSize <= 3) return null;
  const standardError = 1 / Math.sqrt(sampleSize - 3);
  const bounded = Math.max(-0.999999, Math.min(0.999999, correlation));
  const fisherZ = Math.atanh(bounded);
  const margin = 1.96 * standardError;
  return {
    standardError: round(standardError),
    lower: round(Math.max(-1, Math.min(1, Math.tanh(fisherZ - margin)))),
    upper: round(Math.max(-1, Math.min(1, Math.tanh(fisherZ + margin)))),
  };
}

function bandFor(
  correlation: number,
  acceptableThreshold: number,
  strongThreshold: number,
): QuestionDiscriminationBand {
  if (correlation < 0) return "reverse";
  if (correlation < acceptableThreshold) return "weak";
  if (correlation < strongThreshold) return "acceptable";
  return "strong";
}

function emptyMeasurement(
  question: Pick<Question, "id" | "subjectId">,
  sampleSize: number,
  usableSampleSize: number,
  facility: number | null,
  abilitySource: QuestionDiscriminationMeasurement["abilitySource"],
  band: QuestionDiscriminationBand,
): QuestionDiscriminationMeasurement {
  return {
    questionId: question.id,
    subjectId: question.subjectId,
    sampleSize,
    usableSampleSize,
    facility,
    discrimination: null,
    standardError: null,
    confidenceInterval: null,
    band,
    reliable: false,
    abilitySource,
  };
}

/**
 * Measure how well one question separates stronger from weaker learners.
 *
 * The item score is awarded/max, so partial-credit questions are supported.
 * Without an ability map, ability is the learner's mean score on their latest
 * attempts at other questions in the same subject; this prevents circularity.
 */
export function measureQuestionDiscrimination(
  input: MeasureQuestionDiscriminationInput,
): QuestionDiscriminationMeasurement {
  const minSampleSize = Math.max(2, Math.floor(input.options?.minSampleSize ?? 5));
  const acceptableThreshold = input.options?.acceptableThreshold ?? 0.2;
  const strongThreshold = Math.max(acceptableThreshold, input.options?.strongThreshold ?? 0.3);
  const latestAttempts = latestByUserAndQuestion(input.attempts);
  const targetAttempts = latestAttempts.filter(
    (attempt) => attempt.questionId === input.question.id && attempt.subjectId === input.question.subjectId,
  );
  const scoredTargetAttempts = targetAttempts
    .map((attempt) => ({ attempt, score: scoreOf(attempt) }))
    .filter((row): row is { attempt: Attempt; score: number } => row.score != null);
  const sampleSize = scoredTargetAttempts.length;
  const facility = sampleSize ? round(scoredTargetAttempts.reduce((sum, row) => sum + row.score, 0) / sampleSize) : null;

  const hasProvidedAbility = input.abilityByUserId != null;
  let derivedAbilityByUserId = new Map<Id, number>();
  if (!hasProvidedAbility) {
    const scoresByUserId = new Map<Id, number[]>();
    for (const attempt of latestAttempts) {
      if (attempt.subjectId !== input.question.subjectId || attempt.questionId === input.question.id) continue;
      const score = scoreOf(attempt);
      if (score == null) continue;
      const scores = scoresByUserId.get(attempt.userId) ?? [];
      scores.push(score);
      scoresByUserId.set(attempt.userId, scores);
    }
    derivedAbilityByUserId = new Map(
      [...scoresByUserId.entries()].map(([userId, scores]) => [
        userId,
        scores.reduce((sum, score) => sum + score, 0) / scores.length,
      ]),
    );
  }

  const abilitySource: QuestionDiscriminationMeasurement["abilitySource"] = hasProvidedAbility
    ? "provided"
    : derivedAbilityByUserId.size
      ? "leave-one-question-out"
      : "none";
  const usable = scoredTargetAttempts.flatMap((row) => {
    const ability = hasProvidedAbility
      ? readAbility(input.abilityByUserId, row.attempt.userId)
      : derivedAbilityByUserId.get(row.attempt.userId) ?? null;
    return ability == null ? [] : [{ itemScore: row.score, ability }];
  });
  const usableSampleSize = usable.length;

  if (sampleSize < minSampleSize || usableSampleSize < minSampleSize) {
    return emptyMeasurement(input.question, sampleSize, usableSampleSize, facility, abilitySource, "insufficient-data");
  }

  const itemScores = usable.map((row) => row.itemScore);
  const abilityScores = usable.map((row) => row.ability);
  const discrimination = pearson(itemScores, abilityScores);
  if (discrimination == null) {
    return emptyMeasurement(input.question, sampleSize, usableSampleSize, facility, abilitySource, "no-variance");
  }

  const interval = confidenceInterval(discrimination, usableSampleSize);
  const band = bandFor(discrimination, acceptableThreshold, strongThreshold);
  return {
    questionId: input.question.id,
    subjectId: input.question.subjectId,
    sampleSize,
    usableSampleSize,
    facility,
    discrimination: round(discrimination),
    standardError: interval?.standardError ?? null,
    confidenceInterval: interval ? { lower: interval.lower, upper: interval.upper } : null,
    band,
    reliable: true,
    abilitySource,
  };
}

export function measureQuestionBankDiscrimination(input: {
  questions: Array<Pick<Question, "id" | "subjectId">>;
  attempts: Attempt[];
  abilityByUserId?: ReadonlyMap<Id, number> | Readonly<Record<Id, number>>;
  options?: QuestionDiscriminationOptions;
}): QuestionDiscriminationMeasurement[] {
  return input.questions.map((question) =>
    measureQuestionDiscrimination({
      question,
      attempts: input.attempts,
      abilityByUserId: input.abilityByUserId,
      options: input.options,
    }),
  );
}
