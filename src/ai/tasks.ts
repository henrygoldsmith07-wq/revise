import "server-only";
import { z } from "zod";
import { getTopic, subjectLabel } from "@/domain/curriculum";
import type { Question, Topic } from "@/domain/types";
import {
  diagnoseFallback,
  explainFallback,
  generateCardsFallback,
  generateQuestionsFallback,
  markFallback,
  socraticFallback,
  summariseFallback,
} from "./fallback";
import { extractJson, getProvider } from "./provider";
import type { AiEnvelope, AiTask } from "./types";
import { RESPONSE_SCHEMAS } from "./types";

// ---------------------------------------------------------------------------
// One place where prompts live, one place where responses are validated, one
// place where failure degrades to the offline path. Callers get an envelope
// that always says which happened, so the UI never implies a model wrote
// something a rubric did.
// ---------------------------------------------------------------------------

const EXAMINER_VOICE = `You are an experienced A-level examiner and subject tutor for UK exam boards.
You are terse, accurate and specific. You never invent specification content.
You mark strictly to the mark scheme you are given: a point is credited only if
the student's answer actually contains it. You write feedback the way a real
examiner's report does — what was earned, what was dropped, what to do next.
Never flatter. Never pad. Use LaTeX between $ delimiters for any mathematics.`;

const SOCRATIC_VOICE = `You are a Socratic A-level tutor. You do not give answers.
You ask one focused question at a time that moves the student toward the answer,
acknowledge what they got right, and name the misconception when they have one.
Keep every reply under 120 words and end with exactly one question.`;

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
): Promise<AiEnvelope<T>> {
  const provider = getProvider();
  if (!provider) return { data: fallback(), source: "fallback", provider: null };

  try {
    const text = await provider.complete({
      system,
      messages: [{ role: "user", content: prompt }],
      jsonHint,
      maxTokens,
    });
    const raw = extractJson<unknown>(text);
    if (raw == null) throw new Error("no JSON in model reply");
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new Error(`schema: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    return { data: parsed.data, source: "ai", provider: provider.name };
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
  }),
  mark: z.object({
    question: z.custom<Question>((v) => typeof v === "object" && v !== null),
    answers: z.record(z.string(), z.string().max(8000)),
  }),
  "generate-cards": z.object({ topicId: z.string(), count: z.number().int().min(1).max(20).default(8) }),
  "generate-questions": z.object({
    topicId: z.string(),
    count: z.number().int().min(1).max(5).default(2),
    difficulty: z.number().int().min(1).max(5).optional(),
  }),
  summarise: z.object({ topicId: z.string() }),
  diagnose: z.object({
    topicIds: z.array(z.string()).max(20),
    mistakes: z.array(z.any()).max(100),
  }),
  "extract-questions": z.object({ subjectId: z.string(), text: z.string().max(60_000) }),
  "cards-from-notes": z.object({
    text: z.string().max(20_000),
    subjectId: z.string().optional(),
    topicId: z.string().optional(),
    count: z.number().int().min(1).max(25).default(10),
  }),
  ocr: z.object({
    // ~8 MB of base64 is roughly a 6 MB photo, which is plenty for a page of
    // handwriting and small enough to keep the request from timing out.
    image: z.string().max(8_000_000),
    mediaType: z.string().max(60).default("image/jpeg"),
    hint: z.enum(["handwriting", "printed", "auto"]).default("auto"),
  }),
} satisfies Record<AiTask, z.ZodType>;

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
        ? `The student asks: "${question}". Answer it directly, grounded in the specification content above.`
        : "Explain this topic to a student revising for the exam. Lead with what the exam actually asks for.",
      "Then give one short question they should be able to answer immediately afterwards.",
    ].join("\n"),
    `{ "explanation": string (markdown), "checkQuestion": string }`,
    () => explainFallback(topicId, question),
  );
}

export async function socratic(topicId: string, history: { role: "user" | "assistant"; content: string }[]) {
  const topic = getTopic(topicId);
  const provider = getProvider();
  if (!provider) {
    return {
      data: socraticFallback(topicId, history.length),
      source: "fallback" as const,
      provider: null,
    };
  }
  const transcript = history.map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`).join("\n");
  return run(
    RESPONSE_SCHEMAS.socratic,
    SOCRATIC_VOICE,
    [topicContext(topic), "", "Conversation so far:", transcript || "(the student has just opened the tutor)"].join("\n"),
    `{ "reply": string, "nextQuestion": string }`,
    () => socraticFallback(topicId, history.length),
    800,
  );
}

export async function mark(question: Question, answers: Record<string, string>) {
  const topic = getTopic(question.topicIds[0] ?? "");
  const scheme = question.parts
    .map(
      (part) =>
        `Part id ${part.id} ${part.label} [${part.marks} marks]\nQuestion: ${part.prompt}\nMark scheme:\n${part.markScheme
          .map((s) => `  • ${s}`)
          .join("\n")}\nStudent answer: ${answers[part.id]?.trim() || "(no answer given)"}`,
    )
    .join("\n\n");

  return run(
    RESPONSE_SCHEMAS.mark,
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
      "--- NOTES ---",
      text.slice(0, 18_000),
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

  return run(
    RESPONSE_SCHEMAS.diagnose,
    EXAMINER_VOICE,
    [
      "Weak topics:",
      topics.map((t) => `- ${t.title}: ${t.summary}`).join("\n") || "(none flagged)",
      "",
      "Recent mistakes:",
      mistakeLines || "(none recorded)",
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
      text.slice(0, 40_000),
    ].join("\n"),
    `{ "questions": [{ "stem": string, "kind": string, "difficulty": number, "parts": [{ "label": string, "prompt": string, "marks": number, "markScheme": string[], "modelAnswer": string }] }] }`,
    () => ({ questions: [] }),
    4000,
  );
}
