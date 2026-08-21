import type { Id, Misconception, Question } from "@/domain/types";
import { biologyQuestions } from "./questions/biology";
import { biologyAqaQuestions } from "./questions/biology-aqa";
import { biologyAqaExtraQuestions } from "./questions/biology-aqa-extra";
import { aqaGcseQuestions } from "./questions/aqa-gcse";
import { aqaGcsePracticalQuestions } from "./questions/aqa-gcse-practical";
import { aqaGcseSynopticQuestions } from "./questions/aqa-gcse-synoptic";
import { biologyExtraQuestions } from "./questions/biology-extra";
import { chemistryQuestions } from "./questions/chemistry";
import { chemistryAqaQuestions } from "./questions/chemistry-aqa";
import { chemistryAqaExtraQuestions } from "./questions/chemistry-aqa-extra";
import { chemistryExtraQuestions } from "./questions/chemistry-extra";
import { mathsQuestions } from "./questions/maths";
import { mathsAqaQuestions } from "./questions/maths-aqa";
import { mathsAqaExtraQuestions } from "./questions/maths-aqa-extra";
import { mathsExtraQuestions } from "./questions/maths-extra";
import { physicsQuestions } from "./questions/physics";
import { physicsAqaQuestions } from "./questions/physics-aqa";
import { physicsAqaExtraQuestions } from "./questions/physics-aqa-extra";
import { physicsExtraQuestions } from "./questions/physics-extra";
import { authenticExpansionQuestions } from "./questions/massive-authentic";
import { gcseExpansionQuestions } from "./questions/gcse-expansion";
import { edexcelExpansionQuestions } from "./questions/edexcel-expansion";
import { dataExpansionQuestions } from "./questions/data-expansion";
import { unfamiliarContextQuestions } from "./questions/unfamiliar-context";
import { authenticSourceQuestions } from "./questions/authentic-source";
import { ocrAuthoredQuestions } from "./questions/ocr-authored";
import { extendedResponseQuestions } from "./questions/extended-responses";
import { seedMisconceptions } from "./misconceptions";

export { seedCards, seedCardsForTopic, makeCloze } from "./seed-cards";
export { CONTENT_SCHEMAS, contentCardSchema, contentQuestionPartSchema, contentQuestionSchema, contentTopicSchema } from "./schema";

/** The authored question bank. Uploaded and AI-generated questions live in
 *  IndexedDB alongside these and are treated identically everywhere else. */
export const seedQuestions: Question[] = [
  ...authenticExpansionQuestions,
  ...gcseExpansionQuestions,
  ...edexcelExpansionQuestions,
  ...dataExpansionQuestions,
  ...unfamiliarContextQuestions,
  ...authenticSourceQuestions,
  ...ocrAuthoredQuestions,
  ...extendedResponseQuestions,
  ...mathsQuestions,
  ...mathsExtraQuestions,
  ...biologyQuestions,
  ...biologyExtraQuestions,
  ...chemistryQuestions,
  ...chemistryExtraQuestions,
  ...physicsQuestions,
  ...physicsExtraQuestions,
  ...biologyAqaQuestions,
  ...biologyAqaExtraQuestions,
  ...chemistryAqaQuestions,
  ...chemistryAqaExtraQuestions,
  ...mathsAqaQuestions,
  ...mathsAqaExtraQuestions,
  ...physicsAqaQuestions,
  ...physicsAqaExtraQuestions,
  ...aqaGcseQuestions,
  ...aqaGcsePracticalQuestions,
  ...aqaGcseSynopticQuestions,
];

export { aqaGcsePracticalQuestions, aqaGcseQuestions, aqaGcseSynopticQuestions, authenticExpansionQuestions };
export { gcseExpansionQuestions };
export { edexcelExpansionQuestions };
export { dataExpansionQuestions };
export { unfamiliarContextQuestions };
export { authenticSourceQuestions };
export { ocrAuthoredQuestions };
export { extendedResponseQuestions };

export function seedQuestionsForSubject(subjectId: Id): Question[] {
  return seedQuestions.filter((q) => q.subjectId === subjectId);
}

export function seedQuestionsForTopic(topicId: Id): Question[] {
  return seedQuestions.filter((q) => q.topicIds.includes(topicId));
}

// --- misconception library -------------------------------------------------

export { seedMisconceptions };

export function misconceptionsForSubject(subjectId: Id): Misconception[] {
  return seedMisconceptions.filter((m) => m.subjectId === subjectId);
}

export function misconceptionsForTopic(topicId: Id): Misconception[] {
  return seedMisconceptions.filter((m) => m.topicIds.includes(topicId));
}

export function misconceptionById(id: Id): Misconception | undefined {
  return seedMisconceptions.find((m) => m.id === id);
}
