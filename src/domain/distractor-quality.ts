import type {
  Attempt,
  DistractorOptionQuality,
  DistractorQualityIssue,
  DistractorQualityReport,
  DistractorQualityStatus,
  Id,
  Question,
} from "./types";

export interface DistractorQualityOptions {
  /** Minimum valid responses before response-distribution warnings are reliable. Defaults to 5. */
  minResponses?: number;
}

export interface ValidateDistractorQualityInput {
  question: Question;
  attempts?: Attempt[];
  minResponses?: number;
  options?: DistractorQualityOptions;
}

const DEFAULT_MIN_RESPONSES = 5;

function normaliseOption(option: string): string {
  return option.trim().replace(/\s+/g, " ").toLowerCase();
}

function latestAttemptsForQuestion(question: Question, attempts: Attempt[]): Attempt[] {
  const latest = new Map<Id, Attempt>();
  for (const attempt of attempts) {
    if (attempt.questionId !== question.id || attempt.subjectId !== question.subjectId) continue;
    const current = latest.get(attempt.userId);
    if (!current || attempt.createdAt > current.createdAt) latest.set(attempt.userId, attempt);
  }
  return [...latest.values()];
}

function issue(code: DistractorQualityIssue["code"], message: string, severity: DistractorQualityIssue["severity"]): DistractorQualityIssue {
  return { code, message, severity };
}

function reportStatus(
  applicable: boolean,
  responseCount: number,
  minResponses: number,
  issues: DistractorQualityIssue[],
): DistractorQualityStatus {
  if (!applicable) return "not-applicable";
  if (issues.some((item) => item.severity === "error")) return "needs-review";
  if (responseCount === 0) return "unmeasured";
  if (responseCount < minResponses) return "insufficient-data";
  return issues.length ? "needs-review" : "healthy";
}

function emptyReport(question: Question): DistractorQualityReport {
  return {
    questionId: question.id,
    applicable: false,
    optionCount: 0,
    distractorCount: 0,
    responseCount: 0,
    reliable: false,
    status: "not-applicable",
    ok: true,
    issues: [],
    options: [],
  };
}

/**
 * Validate MCQ distractors structurally and, when attempts are supplied,
 * against the observed response distribution. Response checks use one latest
 * answer per learner so repeated practice cannot make a distractor look more
 * useful than it is.
 */
export function validateDistractorQuality(input: ValidateDistractorQualityInput): DistractorQualityReport {
  if (input.question.kind !== "mcq") return emptyReport(input.question);

  const texts = input.question.options ?? [];
  const requestedMinResponses = input.options?.minResponses ?? input.minResponses ?? DEFAULT_MIN_RESPONSES;
  const minResponses = Number.isFinite(requestedMinResponses)
    ? Math.max(2, Math.floor(requestedMinResponses))
    : DEFAULT_MIN_RESPONSES;
  const correctIndex = Number.isInteger(input.question.correctIndex)
    && input.question.correctIndex! >= 0
    && input.question.correctIndex! < texts.length
    ? input.question.correctIndex!
    : null;
  const issues: DistractorQualityIssue[] = [];
  const normalised = texts.map(normaliseOption);
  const byText = new Map<string, number[]>();

  for (const [index, value] of normalised.entries()) {
    if (!value) continue;
    const indexes = byText.get(value) ?? [];
    indexes.push(index);
    byText.set(value, indexes);
  }
  for (const indexes of byText.values()) {
    if (indexes.length > 1) {
      issues.push(issue(
        "duplicate-option",
        `${input.question.id}: options ${indexes.map((index) => String.fromCharCode(65 + index)).join(", ")} are duplicates after normalisation`,
        "error",
      ));
    }
  }
  normalised.forEach((value, index) => {
    if (!value) issues.push(issue("blank-option", `${input.question.id}: option ${String.fromCharCode(65 + index)} is blank`, "error"));
  });

  const selectionCounts = texts.map(() => 0);
  const answerKey = input.question.parts[0]?.id ?? input.question.id;
  const responses = input.attempts ? latestAttemptsForQuestion(input.question, input.attempts) : [];
  let responseCount = 0;
  for (const attempt of responses) {
    const raw = attempt.answers[answerKey];
    if (typeof raw !== "string" || !raw.trim()) continue;
    const selectedIndex = Number(raw);
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= texts.length) continue;
    selectionCounts[selectedIndex] += 1;
    responseCount += 1;
  }

  const reliable = responseCount >= minResponses;
  const optionQuality: DistractorOptionQuality[] = texts.map((text, index) => ({
    index,
    text,
    isCorrect: correctIndex === index,
    selectionCount: selectionCounts[index],
    selectionRate: responseCount ? selectionCounts[index] / responseCount : null,
    status: correctIndex === index ? "correct" : reliable ? "healthy" : "unmeasured",
  }));

  if (reliable && correctIndex !== null) {
    const correctRate = selectionCounts[correctIndex] / responseCount;
    for (const option of optionQuality) {
      if (option.isCorrect) continue;
      if (option.selectionCount === 0) {
        option.status = "unused";
        issues.push(issue(
          "unattractive-distractor",
          `${input.question.id}: distractor ${String.fromCharCode(65 + option.index)} was never selected across ${responseCount} valid responses`,
          "warning",
        ));
      } else if ((option.selectionRate ?? 0) > correctRate) {
        option.status = "overselected";
        issues.push(issue(
          "overselected-distractor",
          `${input.question.id}: distractor ${String.fromCharCode(65 + option.index)} was selected more often than the keyed answer`,
          "warning",
        ));
      }
    }
  }

  const structuralIssueIndexes = new Set<number>();
  for (const [index, value] of normalised.entries()) {
    if (!value || (byText.get(value)?.length ?? 0) > 1) structuralIssueIndexes.add(index);
  }
  for (const option of optionQuality) {
    if (structuralIssueIndexes.has(option.index)) option.status = "invalid";
  }

  const status = reportStatus(true, responseCount, minResponses, issues);
  return {
    questionId: input.question.id,
    applicable: true,
    optionCount: texts.length,
    distractorCount: correctIndex === null ? texts.length : Math.max(0, texts.length - 1),
    responseCount,
    reliable,
    status,
    ok: issues.every((item) => item.severity !== "error"),
    issues,
    options: optionQuality,
  };
}
