import { expect, it } from "vitest";
import { seedQuestions } from "../src/content";
import { markFallback } from "../src/ai/fallback";
import { diagnoseAttemptErrors } from "../src/domain/error-diagnosis-plan";
import { parseTechniqueContext, techniquePracticeDestination, techniqueRepairForDiagnosis, techniqueShapeSuggestionForAnswer } from "../src/domain/technique-repair";

it("offers tentative Explain structure practice without a fabricated diagnosis on a real offline WJEC Physics answer", () => {
  const question = seedQuestions.find((entry) => entry.id === "cnt:question:physics-motion-graph-negative-velocity")!;
  expect(question).toBeDefined();
  const part = question.parts[0]!;
  const answers = { [part.id]: "It is moving upwards and speeding up." };
  const marked = markFallback(question, answers).marked;
  const diagnosis = diagnoseAttemptErrors({ question, answers, marked });
  expect(diagnosis.clean).toBe(false);
  expect(techniqueRepairForDiagnosis(question, diagnosis)).toBeNull();
  const suggestion = techniqueShapeSuggestionForAnswer({ question, answers, marked });
  expect(suggestion?.kind).toBe("tentative-shape");
  expect(suggestion?.title).toBe("Try an Explain structure drill");
  expect(suggestion?.why).toContain("This does not establish why marks were lost; different wording may be valid.");
  const context = parseTechniqueContext(new URL(suggestion!.href, "https://local.test").searchParams);
  expect(techniquePracticeDestination({ context, questions: [question], subjectIds: [question.subjectId] })?.href).toBe(`/practice?question=${encodeURIComponent(question.id)}`);
  // This is fictional response-shape practice linked to a real prompt, not a
  // claim that the local guess is an actionable diagnosis or a content approval.
});
