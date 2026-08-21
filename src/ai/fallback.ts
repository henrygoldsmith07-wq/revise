import { seedQuestionsForTopic } from "@/content";
import { getTopic } from "@/domain/curriculum";
import { markQuestion } from "@/domain/marking";
import { mistakePatterns } from "@/domain/mistakes";
import { makeCloze } from "@/content/seed-cards";
import type { Mistake, Question, Topic } from "@/domain/types";
import type {
  DiagnoseResponse,
  ExplainResponse,
  GeneratedCard,
  GeneratedQuestion,
  MarkResponse,
  SocraticResponse,
  SummariseResponse,
} from "./types";

// ---------------------------------------------------------------------------
// The offline half of every AI feature. These are not stubs: they are the
// product's guarantee that a student on a train with no signal, or with no API
// key configured at all, still gets an explanation, a mark and a next step.
// Everything here is derived from the authored curriculum, so it is accurate
// even though it is not generative.
// ---------------------------------------------------------------------------

export function explainFallback(topicId: string, question?: string): ExplainResponse {
  const topic = getTopic(topicId);
  if (!topic) {
    return {
      explanation:
        "No AI provider is configured, and this topic is not in the local curriculum, so there is nothing to explain offline. Add a provider key in settings, or pick a topic from the library.",
    };
  }
  const parts = [
    topic.summary,
    "",
    "**What earns marks**",
    ...topic.keyPoints.map((p) => `- ${p}`),
    "",
    "**Where marks are usually lost**",
    ...topic.commonErrors.map((e) => `- ${e}`),
  ];
  if (question) {
    parts.unshift(
      `You asked: "${question}". No AI provider is available, so here is the spec content for **${topic.title}** — the answer is almost certainly in the key points below.`,
      "",
    );
  }
  return {
    explanation: parts.join("\n"),
    checkQuestion: topic.keyPoints[0]
      ? `Without looking: ${topic.keyPoints[0].split(":")[0].trim()} — why?`
      : undefined,
  };
}

/**
 * Socratic tutoring without a model: never give the answer, hand back the
 * next key point as a question. Crude compared with a real tutor, but it
 * preserves the pedagogy — the student still has to do the retrieval.
 */
export function socraticFallback(topicId: string, turnCount: number): SocraticResponse {
  const topic = getTopic(topicId);
  if (!topic) {
    return { reply: "Pick a topic and I can prompt you through it from the spec content stored on this device." };
  }
  const point = topic.keyPoints[turnCount % topic.keyPoints.length];
  const error = topic.commonErrors[turnCount % topic.commonErrors.length];
  return {
    reply: [
      `Working offline, so I will prompt rather than explain.`,
      "",
      `Think about **${topic.title}**. One thing examiners reward here: *${firstClause(point)}*.`,
      "",
      `A trap to avoid: ${error}`,
    ].join("\n"),
    nextQuestion: `Can you state ${firstClause(point).toLowerCase()} in your own words, and say why it is true?`,
  };
}

export function markFallback(question: Question, answers: Record<string, string>): MarkResponse {
  const result = markQuestion(question, answers);
  const topic = getTopic(question.topicIds[0] ?? "");
  const errorNote = topic?.commonErrors.length
    ? ` Watch for the classic error on this topic: ${topic.commonErrors[0]}`
    : "";
  return {
    marked: result.marked,
    feedback: `${result.feedback}${errorNote}\n\n_Marked against the mark scheme on this device — no AI was involved._`,
    confidence: 1,
  };
}

export function generateCardsFallback(topicId: string, count: number): GeneratedCard[] {
  const topic = getTopic(topicId);
  if (!topic) return [];
  const cards: GeneratedCard[] = topic.keyPoints.map((point) => ({
    front: `${topic.title} — ${firstClause(point)}?`,
    back: point,
    kind: /[=+−×÷^√∫Δ]/.test(point) ? ("equation" as const) : ("basic" as const),
  }));
  for (const point of topic.keyPoints) {
    const cloze = makeCloze(point);
    if (cloze) cards.push({ front: cloze.front, back: cloze.back, kind: "cloze" });
  }
  for (const error of topic.commonErrors) {
    cards.push({ front: `Why does this drop marks: "${error}"?`, back: topic.summary, kind: "basic" });
  }
  return cards.slice(0, count);
}

/**
 * Without a model, "generate a similar question" becomes "serve one from the
 * authored bank that the student has not seen recently" — which is what a
 * revision guide does anyway.
 */
export function generateQuestionsFallback(topicId: string, count: number): GeneratedQuestion[] {
  const bank = seedQuestionsForTopic(topicId);
  return bank.slice(0, count).map((q) => ({
    stem: q.stem,
    kind: q.kind,
    options: q.options,
    correctIndex: q.correctIndex,
    difficulty: q.difficulty,
    parts: q.parts.map((p) => ({
      label: p.label,
      prompt: p.prompt,
      marks: p.marks,
      markScheme: p.markScheme,
      modelAnswer: p.modelAnswer,
    })),
  }));
}

export function summariseFallback(topicId: string): SummariseResponse {
  const topic = getTopic(topicId);
  if (!topic) return { summary: "Topic not found locally.", bullets: [] };
  return { summary: topic.summary, bullets: topic.keyPoints };
}

export function diagnoseFallback(weak: Topic[], mistakes: Mistake[]): DiagnoseResponse {
  const patterns = mistakePatterns(mistakes);
  const findings: string[] = [];
  const actions: string[] = [];

  if (patterns.length) {
    for (const pattern of patterns.slice(0, 3)) {
      findings.push(`${pattern.count} mistakes classified as **${pattern.category}**. ${pattern.insight}`);
    }
  }
  for (const topic of weak.slice(0, 3)) {
    findings.push(`**${topic.title}** is below target. The usual culprit: ${topic.commonErrors[0]}`);
    actions.push(`Do a 25-minute exam-question block on ${topic.title}, then re-read its key points.`);
  }
  if (!findings.length) {
    findings.push("Nothing is flagged as weak yet — there is not enough marked work to diagnose from.");
    actions.push("Complete a set of exam questions in each subject so the engine has something to measure.");
  }
  if (mistakes.filter((m) => !m.resolved).length > 5) {
    actions.unshift("Clear the mistake queue first — those are marks you have already proven you can lose.");
  }

  return {
    headline: weak.length
      ? `${weak.length} topic${weak.length === 1 ? "" : "s"} need work before your next paper.`
      : "No weak topics flagged yet.",
    findings,
    actions,
  };
}

function firstClause(point: string): string {
  const cut = point.search(/[:;—]| because | which /);
  return (cut > 12 ? point.slice(0, cut) : point).replace(/\.$/, "").trim();
}
