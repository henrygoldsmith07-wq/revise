import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { choosePracticeNextStep } from "@/domain/practice-next-step";
import type { InterventionStep } from "@/domain/intervention-engine";
import type { TechniqueRepair } from "@/domain/technique-repair";

const drill: TechniqueRepair = {
  drillId: "explain",
  questionId: "q1",
  partId: "q1:0",
  topicId: "t1",
  why: "Part a: the diagnosis identifies a missing reasoning link.",
  href: "/technique?drill=explain&question=q1&part=q1%3A0&topic=t1",
};
const guided: InterventionStep = {
  kind: "guided-question",
  title: "Guided practice: Topic",
  minutes: 8,
  countsAsProof: false,
  why: "Support first, so the method is practised correctly before it is tested.",
  href: "/practice?topic=t1&guided=1",
};
const fallback = { label: "Repair the missed points", why: "You dropped 3 of 3 marks here." };

describe("choosePracticeNextStep: exactly one primary action", () => {
  it("an actionable structure diagnosis of this answer beats the topic plan", () => {
    const step = choosePracticeNextStep({ techniqueRepair: drill, prescription: { headline: "Repair: Topic", topicTitle: "Topic", firstStep: guided }, fallback });
    expect(step.kind).toBe("technique");
    expect(step.href).toBe(drill.href);
    expect(step.cta).toBe("Try the explain drill");
    expect(step.note).toMatch(/no marks, mastery or proof/);
  });

  it("names the six-mark drill as an extended evaluation", () => {
    const step = choosePracticeNextStep({ techniqueRepair: { ...drill, drillId: "six-mark" }, prescription: null, fallback });
    expect(step.cta).toBe("Try the extended evaluation drill");
  });

  it("otherwise the first plan step, labelled practice when it is not proof", () => {
    const step = choosePracticeNextStep({ techniqueRepair: null, prescription: { headline: "Repair: Topic", topicTitle: "Topic", firstStep: guided }, fallback });
    expect(step).toMatchObject({ kind: "prescription", href: guided.href, cta: "Start: Guided application", title: "Repair: Topic" });
    expect(step.why.endsWith("(practice, not proof)")).toBe(true);
    const proofStep = choosePracticeNextStep({ techniqueRepair: null, prescription: { headline: "h", topicTitle: "Topic", firstStep: { ...guided, countsAsProof: true } }, fallback });
    expect(proofStep.why).not.toContain("practice, not proof");
  });

  it("with nothing to link to it says what the answer showed and offers no button", () => {
    const step = choosePracticeNextStep({ techniqueRepair: null, prescription: { headline: "h", topicTitle: "Topic", firstStep: undefined }, fallback });
    expect(step).toEqual({ kind: "none", title: fallback.label, why: fallback.why, note: null, cta: null, href: null });
  });
});

describe("marked result wiring", () => {
  const result = readFileSync("src/components/QuestionMarkedResult.tsx", "utf8");
  const next = readFileSync("src/components/PracticeNextStep.tsx", "utf8");
  it("a lost practice mark renders one next-step card; the rest is collapsed", () => {
    expect(result).toContain("{marksLost && !inDiagnostic ? (");
    expect(result).not.toContain("<InterventionPrescriptionPanel");
    expect(result).not.toContain("<SocraticExaminerPanel");
    // One primary button in the card; secondary options live in <details>.
    const card = next.slice(next.indexOf('data-testid="practice-next-step"'), next.indexOf("<details"));
    expect(card.match(/variant="primary"/g)?.length).toBe(2); // technique XOR prescription branch
    expect(next).toContain('data-testid="practice-more-help"');
    expect(next).toContain("More help with this answer");
  });
  it("practice no longer promises micro-practice it does not deliver", () => {
    const execution = readFileSync("src/state/question-execution.ts", "utf8");
    expect(execution).not.toContain("two targeted items on exactly this point");
    expect(execution).not.toContain("One possibility is");
  });
});
