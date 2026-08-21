import { pointCoverage } from "./marking";
import type { Topic } from "./types";

// Explanation mastery is a retrieval check, not an essay grade. Each topic's
// authored key point is treated as an idea anchor, and the result shows which
// anchors were present in the learner's own explanation.

export type ExplanationPointStatus = "secure" | "developing" | "missing";
export type ExplanationMasteryBand = "secure" | "building" | "starting";

export interface ExplanationPointResult {
  point: string;
  coverage: number;
  status: ExplanationPointStatus;
}

export interface ExplanationAssessment {
  topicId: string;
  answerWordCount: number;
  score: number;
  secureCount: number;
  developingCount: number;
  missingCount: number;
  band: ExplanationMasteryBand;
  points: ExplanationPointResult[];
}

const SECURE_THRESHOLD = 0.5;
const DEVELOPING_THRESHOLD = 0.25;

function statusFor(coverage: number): ExplanationPointStatus {
  if (coverage >= SECURE_THRESHOLD) return "secure";
  if (coverage >= DEVELOPING_THRESHOLD) return "developing";
  return "missing";
}

function bandFor(secureCount: number, total: number): ExplanationMasteryBand {
  if (!total || secureCount / total < 0.4) return "starting";
  if (secureCount / total < 0.75) return "building";
  return "secure";
}

/**
 * Compare a free-text explanation with the topic's authored idea anchors.
 * Keeping this pure makes the feedback available offline and easy to test.
 */
export function assessExplanation(
  topic: Pick<Topic, "id" | "keyPoints">,
  answer: string,
): ExplanationAssessment {
  const trimmed = answer.trim();
  const points = topic.keyPoints.map((point) => {
    const coverage = pointCoverage(point, trimmed);
    return { point, coverage, status: statusFor(coverage) };
  });
  const secureCount = points.filter((point) => point.status === "secure").length;
  const developingCount = points.filter((point) => point.status === "developing").length;
  const missingCount = points.filter((point) => point.status === "missing").length;
  const score = points.length
    ? points.reduce((total, point) => total + point.coverage, 0) / points.length
    : 0;

  return {
    topicId: topic.id,
    answerWordCount: trimmed ? trimmed.split(/\s+/).length : 0,
    score,
    secureCount,
    developingCount,
    missingCount,
    band: bandFor(secureCount, points.length),
    points,
  };
}

export function explanationBandLabel(band: ExplanationMasteryBand): string {
  if (band === "secure") return "Secure explanation";
  if (band === "building") return "Building the links";
  return "Start with the core ideas";
}
