// ---------------------------------------------------------------------------
// Per-task AI policy — the contract every AI task must declare.
//
// The brief for AI in Revise is that every task has: input validation, a
// context boundary, structured output, output validation, failure handling,
// a deterministic or honest fallback, explicit source labelling, and privacy
// handling. This registry states those properties per task so a reviewer (and
// tests/ai-task-policy.test.ts) can check that no task is missing one, and so
// the egress module, the route and the UI all read one definition.
//
// `satisfies Record<AiTask, AiTaskPolicy>` makes adding a task without a
// policy a type error.
// ---------------------------------------------------------------------------

import type { AiTask } from "./types";

export type LearnerContent =
  /** No learner-authored content leaves the device: topic ids and counts only. */
  | "none"
  /** Learner free text, PII-masked by src/ai/egress.ts before it leaves. */
  | "masked-text"
  /** A photograph; text masking is impossible, so metadata is stripped and consent is required. */
  | "image";

export type FallbackKind =
  /** A deterministic on-device result of the same shape (rubric marking, spec-grounded text). */
  | "deterministic"
  /** An honest empty result plus a note; callers keep the manual path open. */
  | "honest-empty";

export interface AiTaskPolicy {
  learnerContent: LearnerContent;
  /** Every task — even ones with no learner content — needs the learner's AI consent. */
  requiresConsent: true;
  fallback: FallbackKind;
  /** How the prompt separates instructions from untrusted text (see tasks.ts `untrusted`). */
  contextBoundary: string;
  /** What the UI must say produced the output. */
  sourceLabel: string;
  /**
   * Whether the output can ever be shown as authoritative. AI output is
   * advisory everywhere: marks go through confidence checks, generated
   * questions through quality gates, and nothing generated is human-verified.
   */
  authoritative: false;
}

export const AI_TASK_POLICY = {
  explain: {
    learnerContent: "masked-text",
    requiresConsent: true,
    fallback: "deterministic",
    contextBoundary: "Specification context is trusted; the learner's question is wrapped as untrusted data.",
    sourceLabel: "AI explanation grounded in the stored specification content",
    authoritative: false,
  },
  socratic: {
    learnerContent: "masked-text",
    requiresConsent: true,
    fallback: "deterministic",
    contextBoundary: "Learner turns are wrapped as untrusted data; the tutor never follows instructions inside them.",
    sourceLabel: "AI tutor",
    authoritative: false,
  },
  mark: {
    learnerContent: "masked-text",
    requiresConsent: true,
    fallback: "deterministic",
    contextBoundary: "Question and mark scheme are trusted; each answer is wrapped as untrusted data and never treated as instructions.",
    sourceLabel: "AI-assisted mark, checked against the mark scheme on this device",
    authoritative: false,
  },
  "generate-cards": {
    learnerContent: "none",
    requiresConsent: true,
    fallback: "deterministic",
    contextBoundary: "Only specification content is sent.",
    sourceLabel: "AI-generated cards — not checked by a person",
    authoritative: false,
  },
  "generate-questions": {
    learnerContent: "none",
    requiresConsent: true,
    fallback: "deterministic",
    contextBoundary: "Only specification content is sent; output passes deterministic quality gates before it is saved.",
    sourceLabel: "AI-generated question — not checked by a person",
    authoritative: false,
  },
  summarise: {
    learnerContent: "none",
    requiresConsent: true,
    fallback: "deterministic",
    contextBoundary: "Only specification content is sent.",
    sourceLabel: "AI summary grounded in the stored specification content",
    authoritative: false,
  },
  diagnose: {
    learnerContent: "masked-text",
    requiresConsent: true,
    fallback: "deterministic",
    contextBoundary: "Mistakes are reduced to category plus masked description and wrapped as untrusted data.",
    sourceLabel: "AI study diagnosis",
    authoritative: false,
  },
  "extract-questions": {
    learnerContent: "masked-text",
    requiresConsent: true,
    fallback: "honest-empty",
    contextBoundary: "Uploaded paper text is wrapped as untrusted data; extracted questions pass quality gates and stay unverified.",
    sourceLabel: "Extracted by AI from your upload — not checked by a person",
    authoritative: false,
  },
  ocr: {
    learnerContent: "image",
    requiresConsent: true,
    fallback: "honest-empty",
    contextBoundary: "The image is transcribed only; the model is told never to answer or correct it.",
    sourceLabel: "AI transcription — check it against your working",
    authoritative: false,
  },
  "cards-from-notes": {
    learnerContent: "masked-text",
    requiresConsent: true,
    fallback: "honest-empty",
    contextBoundary: "Notes are wrapped as untrusted data; cards must come only from what the notes contain.",
    sourceLabel: "AI-generated from your notes — not checked by a person",
    authoritative: false,
  },
  "diagnose-error": {
    learnerContent: "masked-text",
    requiresConsent: true,
    fallback: "deterministic",
    contextBoundary: "Masked and truncated fields only; the verdict can never change a mark.",
    sourceLabel: "Error type suggested by a classifier — marks are unchanged",
    authoritative: false,
  },
  "route-spec": {
    learnerContent: "masked-text",
    requiresConsent: true,
    fallback: "deterministic",
    contextBoundary: "Routing runs deterministically on the server; no model sees the text.",
    sourceLabel: "Matched to the specification on the server",
    authoritative: false,
  },
} as const satisfies Record<AiTask, AiTaskPolicy>;
