// Validated content pipeline: source → schema → provenance → spec mapping → runtime.
//
// Giant TypeScript content modules are hard to review and easy to drift.
// The pipeline lets flagship content live as reviewable structured source
// (JSON/YAML) while keeping the same type safety and curriculum guarantees:
//
//   source JSON → contentQuestionSchema/contentTopicSchema (shape)
//     → provenance validation (source/verification/reviewer/lastChecked/specVersion)
//     → spec-mapping validation (specPointIds + learningClaims 1:1 with markScheme)
//     → typed runtime (Question/Topic, stable ids preserved)
//
// Existing TS modules stay supported: they are validated through the same
// functions in tests, so migration is incremental per subject.

import { z } from "zod";
import { contentQuestionSchema, contentTopicSchema } from "./schema";
import type { Question, Topic } from "@/domain/types";

const AO = z.enum(["AO1", "AO2", "AO3"]);
const VERIFICATION = z.enum(["unverified", "checked", "verified"]);
const SOURCE = z.enum(["authored", "licensed", "generated", "past-paper", "import", "adapted", "unreviewed"]);

const specPointSourceSchema = z.object({
  id: z.string().min(1),
  ref: z.string().min(1),
  text: z.string().min(1),
  aos: z.array(AO).min(1),
  source: SOURCE.optional(),
  verification: VERIFICATION.optional(),
  reviewer: z.string().nullable().optional(),
  lastChecked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  specVersion: z.string().min(1).optional(),
});

export const topicProvenanceSchema = contentTopicSchema.extend({
  specPoints: z.array(specPointSourceSchema).optional(),
  aos: z.array(AO).optional(),
  source: SOURCE.optional(),
  verification: VERIFICATION.optional(),
  reviewer: z.string().nullable().optional(),
  lastChecked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  specVersion: z.string().min(1).optional(),
  specRef: z.string().optional(),
});

export const questionProvenanceSchema = contentQuestionSchema.extend({
  source: SOURCE.optional(),
  verification: VERIFICATION.optional(),
  reviewer: z.string().nullable().optional(),
  lastChecked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  specVersion: z.string().min(1).optional(),
  specPointIds: z.array(z.string().min(1)).optional(),
});

export interface ProvenanceIssue {
  id: string;
  code:
    | "missing-source"
    | "missing-verification"
    | "missing-reviewer"
    | "missing-last-checked"
    | "missing-spec-version"
    | "stale-provenance";
  message: string;
}

const STALE_DAYS = 365;

/** Provenance must be complete and fresh; unknown stays unknown, never verified. */
export function validateProvenance(input: {
  id: string;
  source?: string | null;
  verification?: string | null;
  reviewer?: string | null;
  lastChecked?: string | null;
  specVersion?: string | null;
  now?: Date;
}): ProvenanceIssue[] {
  const issues: ProvenanceIssue[] = [];
  const { id, source, verification, reviewer, lastChecked, specVersion, now } = input;
  if (!source) issues.push({ id, code: "missing-source", message: "missing source" });
  if (!verification) issues.push({ id, code: "missing-verification", message: "missing verification" });
  if (verification === "verified" || verification === "checked") {
    if (!reviewer) issues.push({ id, code: "missing-reviewer", message: "verified content needs a reviewer" });
    if (!lastChecked) issues.push({ id, code: "missing-last-checked", message: "verified content needs lastChecked" });
    if (!specVersion) issues.push({ id, code: "missing-spec-version", message: "verified content needs specVersion" });
  }
  if (lastChecked && Number.isFinite(Date.parse(lastChecked))) {
    const days = Math.round(((now ?? new Date()).getTime() - new Date(lastChecked).getTime()) / 86_400_000);
    if (days > STALE_DAYS) issues.push({ id, code: "stale-provenance", message: `lastChecked ${lastChecked} is ${days}d old` });
  }
  return issues;
}

export interface SpecMappingIssue {
  questionId: string;
  partId: string;
  code: "missing-spec-points" | "missing-learning-claims" | "claims-mismatch-markscheme";
  message: string;
}

/**
 * Spec-mapping validation: any part that declares specPointIds must also
 * declare learningClaims 1:1 with its markScheme points, so coverage can name
 * which statement each mark tests.
 */
export function validateSpecMapping(question: Pick<Question, "id" | "parts">): SpecMappingIssue[] {
  const issues: SpecMappingIssue[] = [];
  for (const part of question.parts) {
    const ids = part.specPointIds ?? [];
    if (!ids.length) continue;
    const claims = part.learningClaims ?? [];
    if (!claims.length) {
      issues.push({
        questionId: question.id,
        partId: part.id,
        code: "missing-learning-claims",
        message: "specPointIds present but missing learningClaims",
      });
      continue;
    }
    if (claims.length > part.markScheme.length) {
      issues.push({
        questionId: question.id,
        partId: part.id,
        code: "claims-mismatch-markscheme",
        message: `learningClaims (${claims.length}) must not exceed markScheme points (${part.markScheme.length})`,
      });
    }
  }
  return issues;
}

export interface PipelineResult<T> {
  ok: boolean;
  data: T | null;
  schemaIssues: string[];
  provenanceIssues: ProvenanceIssue[];
  mappingIssues: SpecMappingIssue[];
}

/** Run the full pipeline for one topic record (JSON source or TS runtime). */
export function pipelineTopic(input: unknown, now = new Date()): PipelineResult<Topic> {
  const parsed = topicProvenanceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      data: null,
      schemaIssues: parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`),
      provenanceIssues: [],
      mappingIssues: [],
    };
  }
  const topic = parsed.data as unknown as Topic;
  const provenanceIssues = validateProvenance(
    {
      id: topic.id,
      source: topic.source ?? null,
      verification: topic.verification ?? null,
      reviewer: topic.reviewer ?? null,
      lastChecked: topic.lastChecked ?? null,
      specVersion: topic.specVersion ?? null,
      now,
    },
  );
  return { ok: provenanceIssues.length === 0, data: topic, schemaIssues: [], provenanceIssues, mappingIssues: [] };
}

/** Run the full pipeline for one question record. */
export function pipelineQuestion(input: unknown, now = new Date()): PipelineResult<Question> {
  const parsed = questionProvenanceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      data: null,
      schemaIssues: parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`),
      provenanceIssues: [],
      mappingIssues: [],
    };
  }
  const question = parsed.data as unknown as Question;
  const provenanceIssues = validateProvenance({
    id: question.id,
    source: (question as Question).source ?? null,
    verification: question.verification ?? null,
    reviewer: question.reviewer ?? null,
    lastChecked: question.lastChecked ?? null,
    specVersion: question.specVersion ?? null,
    now,
  });
  const mappingIssues = validateSpecMapping(question);
  return {
    ok: provenanceIssues.length === 0 && mappingIssues.length === 0,
    data: question,
    schemaIssues: [],
    provenanceIssues,
    mappingIssues,
  };
}
