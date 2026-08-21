import { z } from "zod";

const id = z.string().trim().min(1);
const nonEmpty = z.string().trim().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoInstant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/);
const ao = z.enum(["AO1", "AO2", "AO3"]);

export const contentQuestionPartSchema = z.object({
  id,
  label: z.string(),
  prompt: nonEmpty,
  marks: z.number().int().min(1).max(30),
  markScheme: z.array(nonEmpty).min(1).max(30),
  modelAnswer: nonEmpty,
  aos: z.array(ao).optional(),
  specPointIds: z.array(id).optional(),
  learningClaims: z.array(nonEmpty).optional(),
}).passthrough();

export const contentQuestionSchema = z.object({
  id,
  subjectId: id,
  topicIds: z.array(id).min(1),
  kind: z.enum(["mcq", "short", "structured", "calculation", "extended"]),
  stem: nonEmpty,
  options: z.array(nonEmpty).max(6).optional(),
  correctIndex: z.number().int().min(0).optional(),
  parts: z.array(contentQuestionPartSchema).min(1).max(12),
  totalMarks: z.number().int().min(1).max(100),
  calculatorAllowed: z.boolean(),
  difficulty: z.number().int().min(1).max(5),
  origin: z.enum(["seed", "ai", "past-paper"]),
  createdAt: isoInstant,
}).passthrough().superRefine((question, ctx) => {
  const marks = question.parts.reduce((sum, part) => sum + part.marks, 0);
  if (question.totalMarks !== marks) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["totalMarks"], message: "totalMarks must equal the part allocations" });
  }
  if (question.kind === "mcq") {
    if (!question.options || question.options.length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "MCQs need at least two options" });
    }
    if (question.correctIndex === undefined || question.correctIndex >= (question.options?.length ?? 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["correctIndex"], message: "MCQs need an in-range correctIndex" });
    }
  }
});

export const contentCardSchema = z.object({
  id,
  userId: id,
  subjectId: id,
  topicId: id,
  kind: z.enum(["basic", "cloze", "image", "equation", "mistake", "audio"]),
  front: nonEmpty,
  back: nonEmpty,
  tags: z.array(nonEmpty),
  origin: z.enum(["seed", "manual", "ai", "document", "mistake", "import"]),
  due: isoDate,
  stability: z.number().finite().nonnegative(),
  difficulty: z.number().finite().nonnegative(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  state: z.number().int().nonnegative(),
  lastReviewedAt: z.union([isoInstant, z.null()]),
  createdAt: isoInstant,
  updatedAt: isoInstant,
}).passthrough();

export const contentTopicSchema = z.object({
  id,
  subjectId: id,
  unitId: id,
  title: nonEmpty,
  order: z.number().int().nonnegative(),
  intrinsicDifficulty: z.number().int().min(1).max(5),
  summary: nonEmpty,
  keyPoints: z.array(nonEmpty).min(1),
  commonErrors: z.array(nonEmpty).min(1),
}).passthrough();

export const CONTENT_SCHEMAS = {
  question: contentQuestionSchema,
  card: contentCardSchema,
  topic: contentTopicSchema,
} as const;
