import "server-only";
import { z } from "zod";
import { getTopic, subjectLabel } from "@/domain/curriculum";
import type { Question, Topic } from "@/domain/types";
import {
  diagnoseFallback,
  explainFallback,
  socraticExaminerFallback,
  generateCardsFallback,
  generateQuestionsFallback,
  markFallback,
  socraticFallback,
  summariseFallback,
  tutorFallback,
} from "./fallback";
import { extractJson, getProvider } from "./provider";
import { UNTRUSTED_RULE, untrusted } from "./untrusted";
import type { AiEnvelope, AiTask, SocraticExaminerPayload, SocraticResponse } from "./types";
import { RESPONSE_SCHEMAS, socraticExaminerPayloadSchema } from "./types";
import { checkSocraticReply } from "@/domain/socratic-examiner";

// ---------------------------------------------------------------------------
// One place where prompts live, one place where responses are validated, one
// place where failure degrades to the offline path. Callers get an envelope
// that always says which happened, so the UI never implies a model wrote
// something a rubric did.
// ---------------------------------------------------------------------------

// UNTRUSTED_RULE and untrusted() are imported from ./untrusted (see above).
// The canonical fence lives there so the on-device fallback
// (src/ai/local-model.ts) fences identically without importing server-only
// code.

const EXAMINER_VOICE = `You are an experienced A-level examiner and subject tutor for UK exam boards.
You are terse, accurate and specific. You never invent specification content.
You mark strictly to the mark scheme you are given: a point is credited only if
the student's answer actually contains it. You write feedback the way a real
examiner's report does — what was earned, what was dropped, what to do next.
Never flatter. Never pad. Use LaTeX between $ delimiters for any mathematics.
${UNTRUSTED_RULE}`;

const SOCRATIC_VOICE = `You are a Socratic A-level tutor. You do not give answers.
You ask one focused question at a time that moves the student toward the answer,
acknowledge what they got right, and name the misconception when they have one.
Keep every reply under 120 words and end with exactly one question.
${UNTRUSTED_RULE}`;

const TUTOR_VOICE = `You are Revise's A-level tutor. You teach one student interactively,
grounded only in the specification content you are given — you never invent
specification content. You know the mark-scheme points this student has already
lost: use them to decide what to teach, which misconception to confront, and
what to check next.
Method: name the plan in one line, teach the missing idea in plain language,
work one short example with the student, then ask them one question to answer
themselves. One question per reply. Never hand over a full model answer for an
exam question — build it with them, step by step.
Warm but direct. Short paragraphs. Use LaTeX between $ delimiters for any
mathematics. Keep every reply under 160 words.`;

function topicContext(topic: Topic | undefined): string {
  if (!topic) return "";
  return [
    `Subject: ${subjectLabel(topic.subjectId)}`,
    `Topic: ${topic.title}${topic.specRef ? ` (spec ${topic.specRef})` : ""}`,
    `Specification summary: ${topic.summary}`,
    `Points that earn marks:\n${topic.keyPoints.map((p) => `- ${p}`).join("\n")}`,
    `Errors students make here:\n${topic.commonErrors.map((p) => `- ${p}`).join("\n")}`,
  ].join("\n");
}

async function run<T>(
  schema: z.ZodType<T>,
  system: string,
  prompt: string,
  jsonHint: string,
  fallback: () => T,
  maxTokens = 1400,
  /** Task-specific salvage for a near-miss reply, tried before a model retry. */
  repair?: (raw: unknown) => T | null,
): Promise<AiEnvelope<T>> {
  const provider = getProvider();
  if (!provider) return { data: fallback(), source: "fallback", provider: null };

  const complete = async (extraFeedback?: string): Promise<T> => {
    const text = await provider.complete({
      system,
      messages: [
        { role: "user", content: prompt },
        // One corrective pass: reasoning models often break a strict schema on
        // the first try, and telling them which constraint failed fixes most
        // of those without a second full prompt.
        ...(extraFeedback ? [{ role: "user" as const, content: extraFeedback }] : []),
      ],
      jsonHint,
      maxTokens,
    });
    const raw = extractJson<unknown>(text);
    if (raw == null) throw new Error("no JSON in model reply");
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const salvaged = repair?.(raw);
      if (salvaged !== null && salvaged !== undefined) return salvaged;
      throw new Error(`schema: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    }
    return parsed.data;
  };

  try {
    let data: T;
    try {
      data = await complete();
    } catch (firstError) {
      // Retry once with the validation failure quoted back; anything that
      // fails twice was never going to parse, so fall through to offline.
      const message = firstError instanceof Error ? firstError.message : "AI request failed";
      if (!message.startsWith("schema:")) throw firstError;
      data = await complete(
        `Your previous reply did not match the required JSON contract: ${message}. Reply again with corrected JSON only — same shape, no prose around it.`,
      );
    }
    return { data, source: "ai", provider: provider.name };
  } catch (error) {
    // A model failure must never become a user-facing failure.
    return {
      data: fallback(),
      source: "fallback",
      provider: provider.name,
      note: error instanceof Error ? error.message : "AI request failed",
    };
  }
}

// --- payload contracts -----------------------------------------------------

export const payloadSchemas = {
  explain: z.object({ topicId: z.string(), question: z.string().max(1000).optional() }),
  socratic: z.object({
    topicId: z.string(),
    history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20),
    /**
     * Socratic-examiner mode (post-marking, < 100%): the dropped mark-scheme
     * points, the masked answer and the matched authored misconception. When
     * present the tutor asks exactly one guiding question about this answer.
     */
    examiner: socraticExaminerPayloadSchema.optional(),
  }),
  tutor: z.object({
    topicId: z.string(),
    history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(30),
    learner: z
      .object({
        position: z.string().max(200).optional(),
        masteryLine: z.string().max(200).optional(),
        openMistakes: z
          .array(
            z.object({
              point: z.string().max(600),
              category: z.string().max(30),
              marksLost: z.number().min(0).max(60),
            }),
          )
          .max(8)
          .default([]),
      })
      .default({ openMistakes: [] }),
  }),
  // Only the fields the marking prompt reads (see egress minimalMarkQuestion),
  // each bounded, so a request cannot smuggle an arbitrary object into a prompt.
  mark: z.object({
    question: z.object({
      id: z.string().max(200),
      subjectId: z.string().max(120).optional(),
      topicIds: z.array(z.string().max(200)).max(8),
      kind: z.string().max(30),
      stem: z.string().max(6000),
      totalMarks: z.number().min(0).max(200).optional(),
      difficulty: z.number().min(1).max(5).optional(),
      parts: z
        .array(
          z.object({
            id: z.string().max(200),
            label: z.string().max(40),
            prompt: z.string().max(4000),
            marks: z.number().min(0).max(30),
            markScheme: z.array(z.string().max(1000)).max(20),
          }),
        )
        .min(1)
        .max(12),
    }),
    answers: z.record(z.string().max(200), z.string().max(8000)),
  }),
  "generate-cards": z.object({ topicId: z.string(), count: z.number().int().min(1).max(20).default(8) }),
  "generate-questions": z.object({
    topicId: z.string(),
    count: z.number().int().min(1).max(5).default(2),
    difficulty: z.number().int().min(1).max(5).optional(),
  }),
  summarise: z.object({ topicId: z.string() }),
  diagnose: z.object({
    topicIds: z.array(z.string().max(200)).max(20),
    mistakes: z
      .array(
        z.object({
          category: z.string().max(60).optional(),
          description: z.string().max(2000).optional(),
          resolved: z.boolean().optional(),
          topicId: z.string().max(200).optional(),
        }),
      )
      .max(100),
  }),
  "extract-questions": z.object({ subjectId: z.string(), text: z.string().max(60_000) }),
  "cards-from-notes": z.object({
    text: z.string().max(20_000),
    subjectId: z.string().optional(),
    topicId: z.string().optional(),
    count: z.number().int().min(1).max(25).default(10),
  }),
  ocr: z.object({
    image: z.string().max(8_000_000),
    mediaType: z.string().max(60).default("image/jpeg"),
    hint: z.enum(["handwriting", "printed", "auto"]).default("auto"),
  }),
  "diagnose-error": z.object({
    prompt: z.string().max(2000),
    point: z.string().max(1000),
    answer: z.string().max(8000),
    awarded: z.number().min(0).max(30),
    maxMarks: z.number().min(0).max(30),
    command: z.string().max(30).nullable().optional(),
  }),
  "route-spec": z.object({ subjectId: z.string(), text: z.string().max(4000) }),
} satisfies Record<AiTask, z.ZodType>;

/**
 * Output validation beyond shape: a mark must cover exactly the question's
 * parts, each with the part's own tariff, and never award more than that.
 * A reply that breaks this is a schema failure, so it gets the one corrective
 * retry and then falls back to the deterministic rubric. The browser then
 * runs the full confidence checks (domain/marking-confidence.ts).
 */
export function markSchemaFor(question: Pick<Question, "parts">) {
  return RESPONSE_SCHEMAS.mark.superRefine((value, ctx) => {
    const ids = new Set(question.parts.map((p) => p.id));
    const seen = new Set<string>();
    for (const marked of value.marked) {
      const part = question.parts.find((p) => p.id === marked.partId);
      if (!part || !ids.has(marked.partId)) {
        ctx.addIssue({ code: "custom", message: `unknown partId ${marked.partId}` });
        continue;
      }
      if (seen.has(marked.partId)) ctx.addIssue({ code: "custom", message: `duplicate partId ${marked.partId}` });
      seen.add(marked.partId);
      if (marked.max !== part.marks) ctx.addIssue({ code: "custom", message: `part ${part.id} max must be ${part.marks}` });
      if (marked.awarded > part.marks) ctx.addIssue({ code: "custom", message: `part ${part.id} awarded exceeds ${part.marks}` });
    }
    for (const id of ids) if (!seen.has(id)) ctx.addIssue({ code: "custom", message: `missing partId ${id}` });
  });
}

// --- tasks -----------------------------------------------------------------

export async function explain(topicId: string, question?: string) {
  const topic = getTopic(topicId);
  return run(
    RESPONSE_SCHEMAS.explain,
    EXAMINER_VOICE,
    [
      topicContext(topic),
      "",
      question
        ? `The student asks the question below. Answer it directly, grounded in the specification content above.\n${untrusted("student question", question)}`
        : "Explain this topic to a student revising for the exam. Lead with what the exam actually asks for.",
      "Then give one short question they should be able to answer immediately afterwards.",
    ].join("\n"),
    `{ "explanation": string (markdown), "checkQuestion": string }`,
    () => explainFallback(topicId, question),
  );
}

const SOCRATIC_EXAMINER_VOICE = `You are a patient A-level examiner helping one student understand the
marks they just dropped. You never give the answer, never quote or paraphrase
the mark-scheme points back, and never write a model answer. You ask exactly ONE
short guiding question that would lead the student to notice the gap themselves,
built on the misconception you are given when there is one. If you are told the
misconception match is weak or absent, do not claim the student holds it; ask
about the gap in their answer instead. Optionally open with one calm sentence
acknowledging something they did right. No other question marks anywhere.
Plain, warm, specific. Under 70 words in total.
${UNTRUSTED_RULE}`;

/**
 * Output validation beyond shape for the examiner: exactly one question and no
 * restating of a dropped point. A reply that breaks it gets the one corrective
 * retry and then falls back to the authored misconception text.
 */
export function socraticExaminerSchemaFor(examiner: Pick<SocraticExaminerPayload, "markScheme">) {
  return RESPONSE_SCHEMAS.socratic.superRefine((value, ctx) => {
    const check = checkSocraticReply(value, examiner.markScheme);
    if (!check.ok) ctx.addIssue({ code: "custom", message: `examiner reply ${check.reason}` });
  });
}

/** The Socratic examiner: one guiding question about a just-marked answer. */
export async function socraticExaminer(
  topicId: string,
  examiner: SocraticExaminerPayload,
  history: { role: "user" | "assistant"; content: string }[] = [],
): Promise<AiEnvelope<SocraticResponse>> {
  const topic = getTopic(topicId);
  const misconceptionLines = examiner.misconception
    ? [
        `Matched misconception (match strength: ${examiner.matchStrength}${examiner.matchStrength === "weak" ? " — may not apply" : ""}):`,
        `- Belief: ${examiner.misconception.statement}`,
        `- Why it is wrong: ${examiner.misconception.explanation}`,
        `- What fixes it (do NOT tell the student this directly): ${examiner.misconception.correction}`,
      ]
    : ["No authored misconception matched this answer closely. Do not name one."];
  const transcript = history
    .map((m) => (m.role === "user" ? `Student:\n${untrusted("student turn", m.content)}` : `Examiner: ${m.content}`))
    .join("\n");
  return run(
    socraticExaminerSchemaFor(examiner),
    SOCRATIC_EXAMINER_VOICE,
    [
      topicContext(topic),
      "",
      `Question part: ${examiner.partPrompt}`,
      "Mark-scheme points the student dropped (for you only — never restate them):",
      untrusted("dropped mark-scheme points", examiner.markScheme.map((p) => `- ${p}`).join("\n")),
      "The student's answer:",
      untrusted("student answer", examiner.studentAnswer.trim() || "(no answer given)"),
      "",
      ...misconceptionLines,
      "",
      history.length ? "Conversation so far:" : "Ask your one guiding question now.",
      transcript,
    ]
      .filter((line) => line !== "")
      .join("\n"),
    `{ "reply": string (one optional sentence, no question mark), "nextQuestion": string (exactly one question, ending in ?) }`,
    () => socraticExaminerFallback(examiner),
    600,
  );
}

export async function socratic(
  topicId: string,
  history: { role: "user" | "assistant"; content: string }[],
  examiner?: SocraticExaminerPayload,
) {
  if (examiner) {
    const provider = getProvider();
    if (!provider) return { data: socraticExaminerFallback(examiner), source: "fallback" as const, provider: null };
    return socraticExaminer(topicId, examiner, history);
  }
  const topic = getTopic(topicId);
  const provider = getProvider();
  if (!provider) {
    return {
      data: socraticFallback(topicId, history.length),
      source: "fallback" as const,
      provider: null,
    };
  }
  const transcript = history
    .map((m) => (m.role === "user" ? `Student:\n${untrusted("student turn", m.content)}` : `Tutor: ${m.content}`))
    .join("\n");
  return run(
    RESPONSE_SCHEMAS.socratic,
    SOCRATIC_VOICE,
    [topicContext(topic), "", "Conversation so far:", transcript || "(the student has just opened the tutor)"].join("\n"),
    `{ "reply": string, "nextQuestion": string }`,
    () => socraticFallback(topicId, history.length),
    800,
  );
}

/**
 * The conversational tutor: teaches from the learner's exact position rather
 * than from the topic alone. The payload carries the curriculum position, the
 * topic's measured mastery and the mark-scheme points the student has actually
 * lost, so the model's first move is the student's weakest ground — not a
 * generic walkthrough. Grounding stays in the spec content on this device.
 */
export async function tutor(
  topicId: string,
  history: { role: "user" | "assistant"; content: string }[],
  learner: {
    position?: string;
    masteryLine?: string;
    openMistakes: { point: string; category: string; marksLost: number }[];
  },
) {
  const topic = getTopic(topicId);
  const provider = getProvider();
  if (!provider) {
    return {
      data: tutorFallback(topicId, history.length, learner),
      source: "fallback" as const,
      provider: null,
    };
  }
  const learnerLines = [
    learner.position ? `Curriculum position: ${learner.position}` : null,
    learner.masteryLine ? `Evidence so far: ${learner.masteryLine}` : null,
    learner.openMistakes.length
      ? `Marks this student has lost on this topic and not yet recovered:\n${learner.openMistakes
          .map((m) => `- ${m.category} slip (${m.marksLost} mark${m.marksLost === 1 ? "" : "s"}): ${m.point}`)
          .join("\n")}`
      : null,
  ].filter((line): line is string => line !== null);
  const transcript = history.map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`).join("\n");
  return run(
    RESPONSE_SCHEMAS.tutor,
    TUTOR_VOICE,
    [
      topicContext(topic),
      "",
      learnerLines.length ? [...learnerLines, ""].join("\n") : "",
      history.length
        ? "Conversation so far:"
        : "The student has just opened the tutor. Open with a one-line greeting and the plan for this topic — starting from the lost marks above when there are any — then ask your first question.",
      transcript || "(the student has not typed anything yet)",
    ]
      .filter(Boolean)
      .join("\n"),
    `{ "reply": string, "checkQuestion": string (optional), "suggestPractice": boolean }`,
    () => tutorFallback(topicId, history.length, learner),
    1000,
  );
}

export async function mark(question: Question, answers: Record<string, string>) {
  const topic = getTopic(question.topicIds[0] ?? "");
  const scheme = question.parts
    .map(
      (part) =>
        `Part id ${part.id} ${part.label} [${part.marks} marks]\nQuestion: ${part.prompt}\nMark scheme:\n${part.markScheme
          .map((s) => `  • ${s}`)
          .join("\n")}\nStudent answer:\n${untrusted(`answer to part ${part.id}`, answers[part.id]?.trim() || "(no answer given)")}`,
    )
    .join("\n\n");

  return run(
    markSchemaFor(question),
    EXAMINER_VOICE,
    [
      topicContext(topic),
      "",
      `Question: ${question.stem}`,
      "",
      scheme,
      "",
      "Mark each part. Credit a mark-scheme point only if the student's answer contains it —",
      "reward correct alternative wording, never reward what is merely implied.",
    "Return one entry per part with its exact partId, one overall examiner-style feedback paragraph, and confidence from 0 to 1 in the mark.",
    ].join("\n"),
    `{ "marked": [{ "partId": string, "awarded": number, "max": number, "creditedPoints": string[], "missedPoints": string[], "comment": string }], "feedback": string, "confidence": number }`,
    () => markFallback(question, answers),
    1800,
  );
}

/**
 * Cards from the student's own notes. Grounded in the notes rather than in the
 * specification: the point is to revise what their teacher actually taught,
 * so the model is told not to add material that is not in front of it.
 */
export async function cardsFromNotes(text: string, count: number, topicId?: string) {
  const topic = topicId ? getTopic(topicId) : undefined;
  return run(
    RESPONSE_SCHEMAS["cards-from-notes"],
    EXAMINER_VOICE,
    [
      topic ? topicContext(topic) : "",
      "",
      `Write up to ${count} flashcards from the notes below.`,
      "Use only what the notes contain — do not add facts they do not mention.",
      "One idea per card, answerable in under 20 seconds, phrased as a question.",
      "Skip headings, page numbers, references and anything that is not examinable content.",
      "",
      untrusted("student notes", text.slice(0, 18_000)),
    ].join("\n"),
    `{ "cards": [{ "front": string, "back": string, "kind": "basic" | "cloze" | "equation" }] }`,
    // Without a model there is no way to comprehend arbitrary notes, so the
    // caller is told plainly rather than handed unrelated spec cards.
    () => ({ cards: [] }),
    2400,
  );
}

export async function generateCards(topicId: string, count: number) {
  const topic = getTopic(topicId);
  return run(
    RESPONSE_SCHEMAS["generate-cards"],
    EXAMINER_VOICE,
    [
      topicContext(topic),
      "",
      `Write ${count} flashcards for spaced repetition on this topic.`,
      "Each card tests exactly one idea and is answerable in under 20 seconds.",
      "Prefer questions an examiner would actually ask over trivia. No card may restate another.",
    ].join("\n"),
    `{ "cards": [{ "front": string, "back": string, "kind": "basic" | "cloze" | "equation" }] }`,
    () => ({ cards: generateCardsFallback(topicId, count) }),
  );
}

export async function generateQuestions(topicId: string, count: number, difficulty?: number) {
  const topic = getTopic(topicId);
  return run(
    RESPONSE_SCHEMAS["generate-questions"],
    EXAMINER_VOICE,
    [
      topicContext(topic),
      "",
      `Write ${count} original exam-style question(s) on this topic${difficulty ? ` at difficulty ${difficulty}/5` : ""}.`,
      "Match the house style of a real paper: a stem, then parts with mark allocations.",
      "Every part needs a mark scheme with one bullet per awardable mark, and a model answer.",
      "Do not reproduce any real past paper question verbatim.",
    ].join("\n"),
    `{ "questions": [{ "stem": string, "kind": string, "options": string[]?, "correctIndex": number?, "difficulty": number, "parts": [{ "label": string, "prompt": string, "marks": number, "markScheme": string[], "modelAnswer": string }] }] }`,
    () => ({ questions: generateQuestionsFallback(topicId, count) }),
    2400,
  );
}

export async function summarise(topicId: string) {
  const topic = getTopic(topicId);
  return run(
    RESPONSE_SCHEMAS.summarise,
    EXAMINER_VOICE,
    [topicContext(topic), "", "Write a one-page revision summary a student could read the night before the exam."].join("\n"),
    `{ "summary": string (markdown), "bullets": string[] }`,
    () => summariseFallback(topicId),
  );
}

export async function diagnose(topicIds: string[], mistakes: unknown[]) {
  const topics = topicIds.map((id) => getTopic(id)).filter((t): t is Topic => Boolean(t));
  const mistakeLines = (mistakes as { description?: string; category?: string }[])
    .slice(0, 40)
    .map((m) => `- [${m.category ?? "?"}] ${m.description ?? ""}`)
    .join("\n");
  const fencedMistakes = mistakeLines ? untrusted("recorded mistakes", mistakeLines) : "(none recorded)";

  return run(
    RESPONSE_SCHEMAS.diagnose,
    EXAMINER_VOICE,
    [
      "Weak topics:",
      topics.map((t) => `- ${t.title}: ${t.summary}`).join("\n") || "(none flagged)",
      "",
      "Recent mistakes:",
      fencedMistakes,
      "",
      "Diagnose the underlying weakness — not a restatement of the list. Name the pattern,",
      "then give concrete actions for this week.",
    ].join("\n"),
    `{ "headline": string, "findings": string[], "actions": string[] }`,
    () => diagnoseFallback(topics, mistakes as never[]),
  );
}

/**
 * OCR and handwriting recognition, via the provider's vision capability.
 * There is no offline equivalent — an on-device OCR model would be a
 * multi-megabyte download for a feature that is optional — so the fallback is
 * an honest instruction to type the answer instead, and every other route into
 * the marking flow stays open.
 */
export async function ocr(image: string, mediaType: string, hint: "handwriting" | "printed" | "auto") {
  const provider = getProvider();
  const fallback = {
    text: "",
    confidence: 0,
  };
  if (!provider) {
    return {
      data: fallback,
      source: "fallback" as const,
      provider: null,
      note: "No AI provider configured — type or dictate your answer instead.",
    };
  }

  const instruction =
    hint === "handwriting"
      ? "This is a photograph of a student's handwritten exam answer. Transcribe it exactly, preserving part labels, line breaks, working and any mathematics as LaTeX ($...$) where legible."
      : hint === "printed"
        ? "This is a scan of a printed exam paper. Transcribe the text exactly, preserving question numbering and mark allocations."
        : "Transcribe all text in this image exactly, preserving structure.";

  try {
    const text = await provider.complete({
      system:
        "You transcribe exam material. You never answer, correct, complete or improve what is written — a transcription that fixes the student's mistakes destroys the thing being marked. Use LaTeX between $ delimiters for mathematics. Mark anything genuinely illegible as [illegible].",
      messages: [{ role: "user", content: instruction }],
      images: [{ mediaType, base64: image }],
      jsonHint: `{ "text": string, "confidence": number between 0 and 1 }`,
      maxTokens: 3000,
    });
    const raw = extractJson<unknown>(text);
    const parsed = RESPONSE_SCHEMAS.ocr.safeParse(raw);
    if (!parsed.success) throw new Error("could not read the transcription back");
    return { data: parsed.data, source: "ai" as const, provider: provider.name };
  } catch (error) {
    return {
      data: fallback,
      source: "fallback" as const,
      provider: provider.name,
      note: error instanceof Error ? error.message : "transcription failed",
    };
  }
}

/** Split uploaded past-paper text into questions with mark schemes. */
export async function extractQuestions(subjectId: string, text: string) {
  return run(
    RESPONSE_SCHEMAS["extract-questions"],
    EXAMINER_VOICE,
    [
      `The following is the text of a past paper for ${subjectLabel(subjectId)}.`,
      "Split it into individual questions. Preserve the original wording of each question exactly.",
      "Where a mark scheme is included, use it; where it is not, write one from the question's demands.",
      "",
      untrusted("uploaded paper text", text.slice(0, 40_000)),
    ].join("\n"),
    `{ "questions": [{ "stem": string, "kind": string, "difficulty": number, "parts": [{ "label": string, "prompt": string, "marks": number, "markScheme": string[], "modelAnswer": string }] }] }`,
    () => ({ questions: [] }),
    4000,
  );
}

/**
 * Post-marking error diagnosis via classifier.dev.
 * Only runs on incorrect/partial parts AFTER marking fixed awarded/max.
 * Never overrides the mark — returns an error-type label + remediation.
 */
export async function diagnoseError(input: {
  prompt: string; point: string; answer: string;
  awarded: number; maxMarks: number; command?: string | null;
}) {
  const { diagnoseError: runDiagnosis } = await import("./error-classifier");
  const result = await runDiagnosis({
    subjectId: "unknown", topicId: "unknown", questionId: "unknown", partId: "unknown",
    prompt: input.prompt, point: input.point, answer: input.answer,
    awarded: input.awarded, maxMarks: input.maxMarks,
  });
  return {
    data: {
      category: result.category, confidence: result.confidence, reasons: result.reasons,
      taxonomyVersion: result.taxonomyVersion, provenance: result.provenance,
      gated: result.gated, ...(result.rawLabel ? { rawLabel: result.rawLabel } : {}),
    },
    source: (result.provenance === "classifier-dev" ? "ai" : "fallback") as "ai" | "fallback",
    provider: result.provenance === "classifier-dev" ? "classifier.dev" : result.provenance,
  };
}

/** Hierarchical spec routing: subject -> topic -> small candidate set. */
export async function routeSpec(input: { subjectId: string; text: string }) {
  const { routeSpecPoints } = await import("@/domain/spec-routing");
  const route = routeSpecPoints(input.subjectId, input.text);
  return {
    data: {
      topics: route.topics.map((t) => t.id),
      candidates: route.candidates,
    },
    source: "fallback" as const,
    provider: "deterministic",
  };
}
