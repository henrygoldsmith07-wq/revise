import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { getTopic } from "@/domain/curriculum";
import { contentWords, relevantCommonError } from "@/domain/common-error-relevance";
import { deviceRubricMark, DEVICE_MARK_FOOTER } from "@/lib/offline-mark";

// The device marker used to append the topic's first common error to every
// mark, so a question on the three domains told the student to "watch for"
// confusing species richness with diversity, right under "No known
// misconception matches this answer".

const byId = (id: string) => {
  const question = seedQuestions.find((q) => q.id === id);
  if (!question) throw new Error(`missing ${id}`);
  return question;
};

describe("a topic's common error is offered only when it is about the question", () => {
  it("drops an unrelated error on a real recall probe and on an enzyme-saturation question", () => {
    for (const id of ["cnt:question:recall-probe-bio-domains-genus-recall", "cnt:question:repair-depth-bio-saturation-probe"]) {
      const question = byId(id);
      const topic = getTopic(question.topicIds[0]!)!;
      expect(topic.commonErrors.length).toBeGreaterThan(0);
      expect(relevantCommonError(question, topic)).toBeNull();
      const { feedback } = deviceRubricMark(question, { [question.parts[0]!.id]: "I do not know" });
      expect(feedback).not.toContain("common slip");
      expect(feedback).not.toContain("classic error");
      expect(feedback).not.toContain(topic.commonErrors[0]!);
    }
  });

  it("keeps an error that shares the question's own specific words, labelled as a topic slip, not a diagnosis", () => {
    const question = byId("cnt:question:authentic-expansion-wjec-alevel-biology-bio-water-potential");
    const topic = getTopic(question.topicIds[0]!)!;
    const error = relevantCommonError(question, topic);
    expect(error).toMatch(/water potential/);
    const { feedback } = deviceRubricMark(question, { [question.parts[0]!.id]: "I do not know" });
    expect(feedback).toContain(`A common slip on this topic: ${error!.replace(/\.$/, "")}.`);
    expect(feedback).not.toMatch(/\.\.\s/);
  });

  it("does not count words from the topic title or generic verbs", () => {
    const topic = { title: "Enzymes and biological reactions", commonErrors: ["Saying an enzyme is 'killed' rather than denatured."] };
    const question = { stem: "At constant enzyme concentration the enzymes saturate.", parts: [{ prompt: "Explain the plateau.", markScheme: ["active sites occupied"] }] } as never;
    expect(relevantCommonError(question, topic)).toBeNull();
    expect([...contentWords("enzyme enzymes denature denatured denaturing")].sort()).toEqual(["denatur", "enzym"]);
  });

  it("renders the device footer as emphasis, not literal underscores", () => {
    expect(DEVICE_MARK_FOOTER.startsWith("*")).toBe(true);
    expect(DEVICE_MARK_FOOTER).not.toContain("_");
  });
});
