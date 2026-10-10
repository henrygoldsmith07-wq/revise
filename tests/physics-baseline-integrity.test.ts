import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { physicsTransferLinkedQuestions } from "@/content/questions/physics-transfer-linked";
import { allTopics } from "@/domain/curriculum";
import { wjecCapabilities } from "@/content/capabilities";
import type { Question, QuestionPart } from "@/domain/types";
import { validateBaselineIntegrity } from "@/domain/transfer-trust";
import { deriveVerifiedGraph, physicsWorkingNodes } from "@/domain/reasoning-graph";
import { auditFlagshipSubject } from "@/domain/subject-assessment-audit";

// The stricter baseline integrity check rejected 9 of the 11 Physics transfer
// baselines because its step recognisers only knew Maths/Biology/Chemistry
// vocabulary. Physics working is quantities and substitutions; these tests
// pin that the check now recognises that working, still rejects a Physics
// baseline that lacks it, and changes nothing for the other flagships.

const PHYSICS = "wjec-alevel-physics";
const partById = new Map(seedQuestions.flatMap((q) => q.parts.map((p) => [p.id, p] as const)));

function linked(): Array<{ question: Question; part: QuestionPart; baseline: QuestionPart }> {
  return physicsTransferLinkedQuestions.map((question) => {
    const part = question.parts[0]!;
    return { question, part, baseline: partById.get(part.learning!.transferLink!.baselinePartId)! };
  });
}

describe("Physics baseline integrity", () => {
  it("passes every linked Physics transfer baseline on its actual working", () => {
    for (const { question, part, baseline } of linked()) {
      expect(validateBaselineIntegrity(part, baseline, PHYSICS), question.id).toEqual([]);
      // Every Physics step is bound to a real span of the baseline's own text.
      const steps = physicsWorkingNodes(baseline);
      expect(steps.length, question.id).toBeGreaterThan(0);
      for (const node of steps) expect(`${baseline.prompt}\n${baseline.markScheme.join("\n")}\n${baseline.modelAnswer}`.replace(/\s+/g, " "), `${question.id} ${node.label}`).toContain(node.evidence.replace(/…$/, ""));
    }
  });

  it("is subject-scoped: without the Physics subject the same baselines are still rejected", () => {
    // Proves the change is the Physics recognisers, not a looser check.
    const rejected = linked().filter(({ part, baseline }) => validateBaselineIntegrity(part, baseline).length > 0);
    expect(rejected.length).toBeGreaterThanOrEqual(9);
  });

  it("still rejects a Physics baseline whose worked solution shows no substitution", () => {
    const { part, baseline } = linked()[0]!;
    const answerOnly: QuestionPart = { ...baseline, markScheme: ["Correct current values"], modelAnswer: "The rms current is 4.3 A and the peak current is 6.2 A." };
    expect(validateBaselineIntegrity(part, answerOnly, PHYSICS).join(" ")).toMatch(/no verified reasoning graph/);
  });

  it("does not count a stated standard-form result as a substitution", () => {
    const { part, baseline } = linked()[0]!;
    const statedOnly: QuestionPart = { ...baseline, markScheme: ["C = 2.0 × 10⁻⁴ F"], modelAnswer: "C = 2.0 × 10⁻⁴ F." };
    expect(physicsWorkingNodes(statedOnly).some((node) => node.label === "substitute-relation")).toBe(false);
    expect(validateBaselineIntegrity(part, statedOnly, PHYSICS).join(" ")).toMatch(/no verified reasoning graph/);
  });

  it("still rejects a Physics baseline whose prompt supplies no quantities", () => {
    const { part, baseline } = linked()[0]!;
    const noData: QuestionPart = { ...baseline, prompt: "Calculate the rms current and the peak current of a heater." };
    expect(validateBaselineIntegrity(part, noData, PHYSICS).join(" ")).toMatch(/no verified reasoning graph/);
  });

  it("does not change derived graphs (novelty comparisons) for any subject", () => {
    for (const question of seedQuestions.filter((q) => q.subjectId.startsWith("wjec-alevel-")).slice(0, 600)) {
      for (const part of question.parts) {
        expect(deriveVerifiedGraph(part, question.subjectId)).toEqual(deriveVerifiedGraph(part));
      }
    }
  });

  it("Physics linked transfers now go through the subject assessment audit and pass it", () => {
    const physicsQuestions = seedQuestions.filter((q) => q.subjectId === PHYSICS);
    const audit = auditFlagshipSubject({ subjectId: PHYSICS, topics: allTopics().filter((t) => t.subjectId === PHYSICS), questions: physicsQuestions, nodes: wjecCapabilities });
    const linkedIds = new Set(physicsTransferLinkedQuestions.map((q) => q.id));
    const transferIssues = audit.subjectIssues.filter((issue) => linkedIds.has(issue.questionId));
    expect(transferIssues).toEqual([]);
  }, 60_000);

  it("the audit flags a Physics linked transfer whose baseline lost its working", () => {
    const { question, baseline } = linked()[0]!;
    const baselineQuestion = seedQuestions.find((q) => q.parts.some((p) => p.id === baseline.id))!;
    const broken: Question = {
      ...baselineQuestion,
      parts: baselineQuestion.parts.map((p) => p.id === baseline.id ? { ...p, markScheme: ["Correct values"], modelAnswer: "4.3 A and 6.2 A." } : p),
    };
    const audit = auditFlagshipSubject({ subjectId: PHYSICS, topics: [], questions: [broken, question], nodes: [] });
    expect(audit.subjectIssues.some((issue) => issue.questionId === question.id && issue.kind === "invalid-transfer-baseline")).toBe(true);
  });
});
