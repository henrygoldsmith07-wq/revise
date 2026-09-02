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
  VideoLessonResponse,
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

/**
 * Video-style lesson without a model: a deterministic storyboard cut from the
 * same authored curriculum data the step-by-step lesson uses. Not generative,
 * but a real watchable revision video for every topic — including topics with
 * no key points, where the schema's three-scene minimum needs padding.
 */
export function videoLessonFallback(topicId: string): VideoLessonResponse {
  const topic = getTopic(topicId);
  if (!topic) {
    return {
      title: "Video lesson unavailable",
      scenes: [
        {
          title: "Not found",
          narration: "This topic is not in the local curriculum, so there is no lesson to play yet.",
          onScreenText: "No lesson for this topic",
          visual: "A static holding card with the app logo.",
          seconds: 8,
        },
        {
          title: "What to do instead",
          narration:
            "Pick a topic from the library — every authored topic has a video-style lesson and a step-by-step lesson.",
          onScreenText: "Pick a topic in the library",
          visual: "A cursor opens the library and highlights a subject.",
          seconds: 10,
        },
        {
          title: "Offline by design",
          narration:
            "Without an AI provider the storyboard is built from the authored specification data, so it is accurate even offline.",
          onScreenText: "Accurate, not generative",
          visual: "The spec document and the video frame sit side by side.",
          seconds: 10,
        },
      ],
    };
  }

  // ~13 characters of narration per second of video, clamped to a watchable band.
  const duration = (text: string) => Math.max(8, Math.min(60, Math.round(text.length / 13)));
  // Authored data is trusted but not length-bounded; the storyboard contract is.
  const clamp = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

  const scenes: VideoLessonResponse["scenes"] = [
    {
      title: clamp(`Meet ${topic.title}`, 120),
      narration: clamp(topic.summary, 2000),
      onScreenText: clamp(topic.title, 300),
      visual: `Title card for ${topic.title}${topic.specRef ? ` with its spec reference ${topic.specRef}` : ""}, over the subject's colour.`,
      seconds: duration(topic.summary),
    },
  ];

  for (const point of topic.keyPoints.slice(0, 6)) {
    scenes.push({
      title: clamp(firstClause(point), 120),
      narration: clamp(`${point} Say it back in your own words before the next scene.`, 2000),
      onScreenText: clamp(firstClause(point), 300),
      visual: "The point builds on screen step by step, ending on the exact wording an examiner rewards.",
      seconds: duration(point) + 4,
    });
  }

  for (const error of topic.commonErrors.slice(0, 2)) {
    scenes.push({
      title: "Common trap",
      narration: clamp(`Watch out. ${error}`, 2000),
      onScreenText: clamp(`Trap: ${firstClause(error)}`, 300),
      visual: "The wrong answer writes itself, a red cross strikes it out, and the correct form replaces it.",
      seconds: duration(error) + 3,
    });
  }

  // The schema requires at least three scenes; a topic with neither key
  // points nor errors still gets a watchable, honest middle.
  if (scenes.length < 3) {
    scenes.push({
      title: "In the exam",
      narration: `In the exam, ${topic.title} questions stay close to the specification. Learn the summary wording precisely, because that is what the mark scheme rewards.`,
      onScreenText: "Stay close to the spec",
      visual: "A mark scheme highlights phrases that also appear in the specification summary.",
      seconds: 15,
    });
  }

  scenes.push({
    title: "Recap",
    narration: `That's ${topic.title}: the points that earn the marks, and the traps that cost them. Close the video and drill the deck — the cards test exactly these points.`,
    onScreenText: "Now drill the deck",
    visual: `Every taught point stacks into one summary card for ${topic.title}.`,
    seconds: 12,
  });

  return { title: topic.title, scenes: scenes.slice(0, 10) };
}
