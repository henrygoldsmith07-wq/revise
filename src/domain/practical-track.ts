import type { Attempt, Card, Question, Subject, Topic } from "./types";

export type PracticalStageId = "method" | "uncertainty" | "graphs";
export interface PracticalStage {
  id: PracticalStageId;
  title: string;
  task: string;
  lessonHref: string;
  practiceHref: string | null;
  questionCount: number;
  /** Counts of recorded activity, not scores or mastery. */
  attemptCount: number;
  reviewedCardCount: number;
}
export interface PracticalTopicPath {
  topicId: string;
  title: string;
  specRef: string | null;
  lessonHref: string;
  attemptCount: number;
  reviewedCardCount: number;
  stages: PracticalStage[];
}
export interface PracticalSubjectTrack {
  subjectId: string;
  subjectName: string;
  qualification: "WJEC A Level";
  topics: PracticalTopicPath[];
}

// A navigation subset of the existing curriculum, not a board-issued list of
// required experiments. No topic is labelled an official required practical.
const PATH_TOPICS: Record<string, { core: string; topics: readonly string[] }> = {
  "wjec-alevel-biology": { core: "practical-skills", topics: ["practical-skills", "cell-structure", "membranes-transport", "enzymes", "photosynthesis", "ecosystems"] },
  "wjec-alevel-chemistry": { core: "practical-analysis", topics: ["practical-analysis", "moles", "energetics", "kinetics", "acids-bases", "spectroscopy"] },
  "wjec-alevel-physics": { core: "practical-investigations", topics: ["practical-investigations", "kinematics-dynamics", "materials", "waves", "electric-circuits", "circular-shm"] },
};

const STAGES: readonly { id: PracticalStageId; title: string; task: string; signal: RegExp }[] = [
  { id: "method", title: "1. Method and controls", task: "Make a method plan: identify what is changed and measured, how controls are maintained, repeats and a relevant safety measure. Check it against the linked lesson.", signal: /\b(method|procedure|investigat\w*|apparatus|control\w*|variable\w*|repeat\w*|sampl\w*|calibrat\w*)\b/i },
  { id: "uncertainty", title: "2. Errors and uncertainty", task: "Identify a measurement limit or source of error. Explain its effect, then propose a specific improvement. Use the linked lesson to check your reasoning.", signal: /\b(uncertaint\w*|error\w*|precision|accuracy|resolution|limitation\w*|improv\w*)\b/i },
  { id: "graphs", title: "3. Graphs and conclusions", task: "Choose axes and units for relevant data; interpret a trend or gradient where appropriate, then state a conclusion and its limits. Open the lesson before selecting a question.", signal: /\b(graph\w*|gradient\w*|plot\w*|axes|axis|best.fit|intercept\w*|trend\w*|data interpretation)\b/i },
];

export function practicalLessonHref(subjectId: string, topicId: string): string {
  return `/lesson?${new URLSearchParams({ subject: subjectId, topic: topicId })}`;
}
export function practicalPracticeHref(subjectId: string, topicId: string, questionId: string): string {
  // These three query parameters are actually consumed by /practice; no
  // imaginary ?skill=method filter or unsupported practical-mode query.
  return `/practice?${new URLSearchParams({ subject: subjectId, topic: topicId, question: questionId })}`;
}

export interface PracticalTrackInput {
  subjects: readonly Subject[];
  topics: readonly Topic[];
  questions: readonly Question[];
  attempts: readonly Attempt[];
  cards: readonly Card[];
  enrolledSubjectIds: readonly string[];
  userId: string;
}

/** Pure assembly; callers load the authored bank asynchronously outside here. */
export function buildPracticalTracks(input: PracticalTrackInput): PracticalSubjectTrack[] {
  const subjects = input.subjects.filter((subject) => subject.qualificationId === "wjec-alevel" && PATH_TOPICS[subject.id] && input.enrolledSubjectIds.includes(subject.id));
  const topicsById = new Map(input.topics.map((topic) => [topic.id, topic]));
  const uniqueQuestions = [...new Map(input.questions.map((question) => [question.id, question])).values()];
  const uniqueAttempts = [...new Map(input.attempts.filter((attempt) => attempt.userId === input.userId).map((attempt) => [attempt.id, attempt])).values()];
  const uniqueCards = [...new Map(input.cards.filter((card) => card.userId === input.userId).map((card) => [card.id, card])).values()];
  return subjects.map((subject) => {
    const config = PATH_TOPICS[subject.id]!;
    const core = topicsById.get(`${subject.id}.${config.core}`);
    const topics = config.topics.flatMap((slug): PracticalTopicPath[] => {
      const topic = topicsById.get(`${subject.id}.${slug}`);
      if (!topic || topic.subjectId !== subject.id) return [];
      const questions = uniqueQuestions.filter((question) => question.subjectId === subject.id && question.topicIds.includes(topic.id));
      const attempts = uniqueAttempts.filter((attempt) => attempt.subjectId === subject.id && attempt.topicIds.includes(topic.id));
      const reviewedCards = uniqueCards.filter((card) => card.subjectId === subject.id && card.topicId === topic.id && card.reps > 0 && Boolean(card.lastReviewedAt));
      return [{
        topicId: topic.id,
        title: topic.title,
        specRef: topic.specRef ?? null,
        lessonHref: practicalLessonHref(subject.id, topic.id),
        attemptCount: attempts.length,
        reviewedCardCount: reviewedCards.length,
        stages: STAGES.map((stage) => {
          // Only learner-visible prompts determine whether a stage link is
          // relevant. Hidden scheme vocabulary must not manufacture supply.
          const stageQuestions = questions.filter((question) => stage.signal.test(`${question.stem} ${question.parts.map((part) => part.prompt).join(" ")}`));
          const stageIds = new Set(stageQuestions.map((question) => question.id));
          const attemptedIds = new Set(attempts.map((attempt) => attempt.questionId));
          const next = stageQuestions.find((question) => !attemptedIds.has(question.id)) ?? stageQuestions[0];
          const lessonTopic = stage.id === "graphs" ? topic : core?.subjectId === subject.id ? core : topic;
          return {
            id: stage.id,
            title: stage.title,
            task: stage.task,
            lessonHref: practicalLessonHref(subject.id, lessonTopic.id),
            practiceHref: next ? practicalPracticeHref(subject.id, topic.id, next.id) : null,
            questionCount: stageQuestions.length,
            attemptCount: attempts.filter((attempt) => stageIds.has(attempt.questionId)).length,
            reviewedCardCount: reviewedCards.filter((card) => stage.signal.test(`${card.front} ${card.back}`)).length,
          };
        }),
      }];
    });
    return { subjectId: subject.id, subjectName: subject.name, qualification: "WJEC A Level", topics };
  });
}
