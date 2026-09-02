import { z } from "zod";

// Shared request/response contracts for every AI task. These are imported by
// both the browser and the route handler, so this module must stay free of
// server-only imports.

export const AI_TASKS = [
  "explain",
  "socratic",
  "mark",
  "generate-cards",
  "generate-questions",
  "summarise",
  "diagnose",
  "extract-questions",
  "ocr",
  "cards-from-notes",
  "video-lesson",
] as const;

export type AiTask = (typeof AI_TASKS)[number];

export const generatedCardSchema = z.object({
  front: z.string().min(3).max(600),
  back: z.string().min(1).max(1200),
  kind: z.enum(["basic", "cloze", "equation"]).default("basic"),
});

export const generatedPartSchema = z.object({
  label: z.string().max(12).default(""),
  prompt: z.string().min(5).max(800),
  marks: z.number().int().min(1).max(12),
  markScheme: z.array(z.string().min(2).max(300)).min(1).max(10),
  modelAnswer: z.string().min(2).max(2000),
});

export const generatedQuestionSchema = z.object({
  stem: z.string().min(5).max(1500),
  kind: z.enum(["mcq", "short", "structured", "calculation", "extended"]).default("short"),
  options: z.array(z.string().max(300)).max(6).optional(),
  correctIndex: z.number().int().min(0).max(5).optional(),
  difficulty: z.number().int().min(1).max(5).default(3),
  parts: z.array(generatedPartSchema).min(1).max(6),
});

export const markedPartSchema = z.object({
  partId: z.string(),
  awarded: z.number().min(0).max(30),
  max: z.number().min(0).max(30),
  creditedPoints: z.array(z.string()).default([]),
  missedPoints: z.array(z.string()).default([]),
  comment: z.string().max(1200).default(""),
});

export const markResponseSchema = z.object({
  marked: z.array(markedPartSchema).min(1),
  feedback: z.string().min(1).max(3000),
  /** Provider confidence in the mark; absence is preserved so escalation can be urgent. */
  confidence: z.number().min(0).max(1).optional(),
});

export const explainResponseSchema = z.object({
  explanation: z.string().min(1).max(6000),
  checkQuestion: z.string().max(600).optional(),
});

export const socraticResponseSchema = z.object({
  reply: z.string().min(1).max(3000),
  /** The one question the student should answer next. */
  nextQuestion: z.string().max(600).optional(),
});

export const diagnoseResponseSchema = z.object({
  headline: z.string().min(1).max(300),
  findings: z.array(z.string().min(1).max(500)).min(1).max(6),
  actions: z.array(z.string().min(1).max(300)).min(1).max(6),
});

export const ocrResponseSchema = z.object({
  /** Plain text transcription, with LaTeX for any mathematics. */
  text: z.string().max(20_000),
  /** 0-1 self-reported legibility; low values warn the student to check it. */
  confidence: z.number().min(0).max(1).default(0.5),
});

export const summariseResponseSchema = z.object({
  summary: z.string().min(1).max(4000),
  bullets: z.array(z.string().min(1).max(400)).max(10).default([]),
});

/** One scene of a video-style lesson: what is said, shown and for how long. */
export const videoLessonSceneSchema = z.object({
  title: z.string().min(1).max(120),
  /** The spoken voiceover for the scene. */
  narration: z.string().min(1).max(2000),
  /** The few words the viewer reads on screen. */
  onScreenText: z.string().min(1).max(300),
  /** What the animation or diagram shows while the narration plays. */
  visual: z.string().min(1).max(500),
  seconds: z.number().int().min(5).max(90),
  /** Role the scene plays; the player labels scenes with it. Optional so earlier generations still parse. */
  kind: z.enum(["intro", "teach", "misconception", "trap", "exam", "recap"]).optional(),
});

export const videoLessonResponseSchema = z.object({
  title: z.string().min(1).max(200),
  scenes: z.array(videoLessonSceneSchema).min(3).max(14),
});

/**
 * Salvage a near-miss model reply instead of discarding it: reasoning models
 * frequently return the right storyboard with small contract violations (a
 * 121-character title, seconds as a string, a scene missing its visual).
 * Coerce what is coercible, drop scenes that are beyond saving, and only give
 * up when fewer than three usable scenes remain.
 */
export function repairVideoLesson(raw: unknown): VideoLessonResponse | null {
  if (typeof raw !== "object" || raw === null) return null;
  const source = raw as Record<string, unknown>;
  if (!Array.isArray(source.scenes)) return null;

  const clamp = (value: unknown, max: number): string | null => {
    if (typeof value !== "string") return null;
    const text = value.trim();
    return text ? (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`) : null;
  };
  const seconds = (value: unknown): number | null => {
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(n)) return null;
    return Math.max(5, Math.min(90, Math.round(n)));
  };
  const kinds = ["intro", "teach", "misconception", "trap", "exam", "recap"] as const;
  const kind = (value: unknown): VideoLessonScene["kind"] => {
    if (typeof value !== "string") return undefined;
    return (kinds as readonly string[]).includes(value) ? (value as VideoLessonScene["kind"]) : undefined;
  };

  const scenes = source.scenes
    .map((scene): VideoLessonScene | null => {
      if (typeof scene !== "object" || scene === null) return null;
      const s = scene as Record<string, unknown>;
      const title = clamp(s.title, 120);
      const narration = clamp(s.narration, 2000);
      const onScreenText = clamp(s.onScreenText ?? s.title, 300);
      const visual = clamp(s.visual ?? "The key idea animates on screen.", 500);
      const secs = seconds(s.seconds) ?? durationEstimate(narration ?? "");
      if (!title || !narration || !onScreenText || !visual || !secs) return null;
      return { title, narration, onScreenText, visual, seconds: secs, kind: kind(s.kind) };
    })
    .filter((s): s is VideoLessonScene => s !== null)
    .slice(0, 14);

  if (scenes.length < 3) return null;
  const title = clamp(source.title, 200) ?? "Video lesson";
  return { title, scenes };
}

/** Rough spoken-length estimate used when a scene's duration is unusable. */
function durationEstimate(text: string): number {
  return Math.max(8, Math.min(60, Math.round(text.length / 13)));
}

/**
 * The response registry is shared by the server and browser. Keeping the
 * wrappers here prevents a provider or API change from widening one boundary
 * while the other still assumes the old shape.
 */
export const RESPONSE_SCHEMAS = {
  explain: explainResponseSchema,
  socratic: socraticResponseSchema,
  mark: markResponseSchema,
  "generate-cards": z.object({ cards: z.array(generatedCardSchema).min(1).max(20) }),
  "generate-questions": z.object({ questions: z.array(generatedQuestionSchema).min(1).max(5) }),
  summarise: summariseResponseSchema,
  diagnose: diagnoseResponseSchema,
  "extract-questions": z.object({ questions: z.array(generatedQuestionSchema).min(1).max(40) }),
  ocr: ocrResponseSchema,
  "cards-from-notes": z.object({ cards: z.array(generatedCardSchema).min(1).max(25) }),
  "video-lesson": videoLessonResponseSchema,
} satisfies Record<AiTask, z.ZodType>;

export type GeneratedCard = z.infer<typeof generatedCardSchema>;
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;
export type MarkResponse = z.infer<typeof markResponseSchema>;
export type ExplainResponse = z.infer<typeof explainResponseSchema>;
export type SocraticResponse = z.infer<typeof socraticResponseSchema>;
export type DiagnoseResponse = z.infer<typeof diagnoseResponseSchema>;
export type OcrResponse = z.infer<typeof ocrResponseSchema>;
export type SummariseResponse = z.infer<typeof summariseResponseSchema>;
export type VideoLessonScene = z.infer<typeof videoLessonSceneSchema>;
export type VideoLessonResponse = z.infer<typeof videoLessonResponseSchema>;

/** Every AI response carries how it was produced, and the UI always shows it. */
export interface AiEnvelope<T> {
  data: T;
  source: "ai" | "fallback";
  provider?: string | null;
  /** Present when the model was tried and failed. */
  note?: string;
}
