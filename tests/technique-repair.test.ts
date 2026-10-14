import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { commandWordIn, diagnoseAttemptErrors, type PartErrorDiagnosis } from "../src/domain/error-diagnosis-plan";
import { diagnosisSignal } from "../src/domain/error-diagnosis";
import { parseTechniqueContext, techniquePracticeDestination, techniqueRepairForDiagnosis, techniqueRepairForMistakes, techniqueShapeSuggestionForAnswer } from "../src/domain/technique-repair";
import { knowledgeVsAnswering, timedSessionRecommendation } from "../src/domain/exam-technique";
import type { Attempt, MarkedPart, Mistake, Question } from "../src/domain/types";

const subject = "aqa-alevel-biology";
const topic = `${subject}.enzymes`;
const q: Question = {
  id: "q:real", subjectId: subject, topicIds: [topic], kind: "structured", stem: "Calculate the change, then answer each part.",
  parts: [{ id: "p:a", label: "(a)", prompt: "Explain why the queue could clear faster.", marks: 3, markScheme: ["two desks", "simultaneous requests", "queue clears"], modelAnswer: "" }],
  totalMarks: 3, calculatorAllowed: false, difficulty: 2, origin: "seed", createdAt: "2026-10-14T12:00:00Z",
};
const part = q.parts[0]!;
const marked: MarkedPart = { partId: part.id, awarded: 1, max: 3, creditedPoints: ["two desks"], missedPoints: ["simultaneous requests", "queue clears"], comment: "" };
const attempt: Attempt = {
  id: "attempt", userId: "learner", questionId: q.id, subjectId: subject, topicIds: [topic], answers: { [part.id]: "Two desks. Simultaneous requests." }, marked: [marked], awarded: 1, max: 3, markedBy: "rubric", feedback: "", elapsedMs: 30000, mode: "practice", createdAt: q.createdAt,
};
const mistake: Mistake = { id: "loss", userId: "learner", subjectId: subject, topicId: topic, questionId: q.id, partId: part.id, attemptId: attempt.id, point: "simultaneous requests", category: "unclassified", marksLost: 2, resolved: false, description: "missed link", createdAt: q.createdAt };
function diagnosis(overrides: Partial<PartErrorDiagnosis> = {}) {
  const plan = diagnoseAttemptErrors({ question: q, marked: [marked], answers: attempt.answers, classify: () => ({ category: "reasoning", confidence: 0.88, provenance: "classifier-dev", gated: false, reasons: ["missing link"] }) });
  return { ...plan, parts: [{ ...plan.parts[0]!, ...overrides }] };
}
const aggregate = (overrides: Partial<Mistake> = {}, questions = [q], attempts = [attempt]) => techniqueRepairForMistakes({ subjectId: subject, userId: "learner", mistakes: [{ ...mistake, ...overrides }], questions, attempts });
const destination = (query: string, questions = [q], subjectIds = [subject]) => techniquePracticeDestination({ context: parseTechniqueContext(new URLSearchParams(query)), questions, subjectIds });

describe("multipart command priority", () => {
  it("uses the part command before the general stem in both diagnosis pipelines", () => {
    expect(commandWordIn(q, part)).toBe("explain");
    const classify = vi.fn((signal: { command: string | null; awarded: number; maxMarks: number }) => ({ category: "reasoning" as const, confidence: 0.88, provenance: "classifier-dev" as const, gated: false, reasons: [signal.command ?? "missing link"] }));
    diagnoseAttemptErrors({ question: q, marked: [marked], answers: attempt.answers, classify });
    expect(classify.mock.calls[0]?.[0]).toMatchObject({ command: "explain", awarded: 1, maxMarks: 3 });
    expect(diagnosisSignal({ question: q, part, marked, attempt, mistake, answer: "Two desks" }).command).toBe("explain");
  });
  it("falls back to the stem only when the part has no command", () => {
    expect(commandWordIn({ stem: "Describe the change." }, { prompt: "Use the information above." })).toBe("describe");
    expect(commandWordIn({ stem: "A library trial." }, { prompt: "The information above." })).toBeNull();
  });
});

describe("actionable diagnosis to a supported generic drill", () => {
  it.each(["describe", "explain", "evaluate"] as const)("maps the actual %s part rather than the stem", (command) => {
    const question = { ...q, parts: [{ ...part, prompt: `${command} the trial.` }] };
    const selected = techniqueRepairForDiagnosis(question, diagnosis());
    expect(selected?.drillId).toBe(command);
    expect(selected?.why).toContain("missing reasoning link");
    const params = new URL(selected!.href, "https://local.test").searchParams;
    expect(params.get("question")).toBe(q.id);
    expect(params.get("part")).toBe(part.id);
    expect(params.get("topic")).toBe(topic);
    expect([...params.keys()].sort()).toEqual(["drill", "part", "question", "topic"]);
  });
  it("does not invent a cause from the command alone", () => {
    expect(techniqueRepairForDiagnosis(q, undefined)).toBeNull();
    expect(techniqueRepairForDiagnosis(q, { parts: [], headline: null, clean: true, minutes: 0 })).toBeNull();
  });
  it.each([{ confidence: 0.69 }, { confidence: Number.NaN }, { confidence: Infinity }, { confidence: 1.1 }, { gated: true }, { category: "other" as const }, { category: "knowledge-gap" as const }, { category: "unit-error" as const }, { category: "calculation" as const }, { category: "careless-error" as const }, { awarded: 3 }, { awarded: Number.NaN }, { awarded: -1 }, { max: Infinity }, { max: 0 }, { partId: "missing" }])("rejects non-actionable or non-structure evidence %j", (overrides) => {
    expect(techniqueRepairForDiagnosis(q, diagnosis(overrides))).toBeNull();
  });
  it.each(["calculate", "compare", "state", "discuss", "justify"])("does not map unsupported %s into a different command", (command) => {
    expect(techniqueRepairForDiagnosis({ ...q, parts: [{ ...part, prompt: `${command} the change.` }] }, diagnosis())).toBeNull();
  });
  it("reserves six-mark for an extended evaluation part, not total multipart marks", () => {
    const evaluate = { ...part, prompt: "Evaluate the trial.", marks: 6 };
    expect(techniqueRepairForDiagnosis({ ...q, kind: "extended", parts: [evaluate] }, diagnosis({ max: 6 }))?.drillId).toBe("six-mark");
    expect(techniqueRepairForDiagnosis({ ...q, totalMarks: 12, parts: [{ ...evaluate, marks: 3 }] }, diagnosis())?.drillId).toBe("evaluate");
    expect(techniqueRepairForDiagnosis({ ...q, kind: "calculation", parts: [evaluate] }, diagnosis())?.drillId).toBe("evaluate");
    expect(techniqueRepairForDiagnosis({ ...q, kind: "extended", parts: [{ ...part, marks: 6 }] }, diagnosis())?.drillId).toBe("explain");
  });
  it("skips MCQs and retired sources", () => {
    expect(techniqueRepairForDiagnosis({ ...q, kind: "mcq" }, diagnosis())).toBeNull();
    expect(techniqueRepairForDiagnosis({ ...q, validation: { stage: "retired" } as Question["validation"] }, diagnosis())).toBeNull();
  });
});

describe("tentative offline response-shape suggestions are not diagnoses", () => {
  const suggest = (answers: Record<string, string> | undefined, question = q, parts = [marked], copiedAnswer = false) => techniqueShapeSuggestionForAnswer({ question, answers, marked: parts, copiedAnswer });

  it("offers Explain shape practice on an actual dropped part without promoting its diagnosis", () => {
    const local = diagnoseAttemptErrors({ question: q, marked: [marked], answers: attempt.answers });
    const before = JSON.stringify({ local, marked, answers: attempt.answers });
    expect(techniqueRepairForDiagnosis(q, local)).toBeNull();
    const suggestion = suggest(attempt.answers);
    expect(suggestion?.kind).toBe("tentative-shape");
    expect(suggestion?.title).toBe("Try an Explain structure drill");
    expect(suggestion?.why).toBe("No explicit cause-and-effect wording was detected. This does not establish why marks were lost; different wording may be valid.");
    expect(suggestion?.drillId).toBe("explain");
    expect(JSON.stringify({ local, marked, answers: attempt.answers })).toBe(before);
    expect(techniqueRepairForDiagnosis(q, local)).toBeNull();
    for (const key of ["category", "confidence", "awarded", "mastery", "proof", "passed"]) expect(suggestion).not.toHaveProperty(key);
  });

  it.each([undefined, {}, { [part.id]: "" }, { [part.id]: " \n " }, { [part.id]: "Dog" }, { [part.id]: "Not sure" }])("does not inspect a blank, missing or token response %j", (answers) => {
    expect(suggest(answers)).toBeNull();
  });

  it("does not offer shape practice for a full-mark, missing, invalid or copied part", () => {
    expect(suggest(attempt.answers, q, [{ ...marked, awarded: marked.max }])).toBeNull();
    expect(suggest(attempt.answers, q, [])).toBeNull();
    expect(suggest(attempt.answers, q, [{ ...marked, partId: "missing" }])).toBeNull();
    expect(suggest(attempt.answers, q, [{ ...marked, awarded: Number.NaN }])).toBeNull();
    expect(suggest(attempt.answers, q, [marked], true)).toBeNull();
    const copied = { ...q, parts: [{ ...part, modelAnswer: "Two desks are staffed and simultaneous requests shorten the queue." }] };
    expect(suggest({ [part.id]: copied.parts[0]!.modelAnswer }, copied)).toBeNull();
  });

  it("requires the existing validator's unsatisfied signal, not low marking alone", () => {
    expect(suggest({ [part.id]: "Two desks could shorten the queue because more requests can be handled." })).toBeNull();
    expect(suggest({ [part.id]: "The lift moves down so its speed falls." })?.why).toContain("different wording may be valid");
  });

  it("uses current part wording before the stem, and never substitutes unsupported commands", () => {
    const answers = { [part.id]: "The system handles requests differently." };
    expect(suggest(answers)?.drillId).toBe("explain");
    for (const command of ["calculate", "compare", "discuss", "justify", "state"]) {
      expect(suggest(answers, { ...q, parts: [{ ...part, prompt: `${command} the trial.` }] })).toBeNull();
    }
  });

  it("supports Describe only when observation wording is not detected", () => {
    const question = { ...q, parts: [{ ...part, prompt: "Describe the queue." }] };
    expect(suggest({ [part.id]: "Due to extra staffed desks." }, question)?.title).toBe("Try a Describe structure drill");
    expect(suggest({ [part.id]: "The waiting time decreases." }, question)).toBeNull();
  });

  it("names the missing Evaluate signals, rather than inventing an error cause", () => {
    const question = { ...q, parts: [{ ...part, prompt: "Evaluate the trial." }] };
    expect(suggest({ [part.id]: "The desk reduces the waiting time." }, question)?.why).toContain("No balance or overall judgement wording");
    expect(suggest({ [part.id]: "However the desk reduces the waiting time." }, question)?.why).toContain("No overall judgement wording");
    expect(suggest({ [part.id]: "Overall extend the trial and measure waiting times." }, question)?.why).toContain("No balance or limitation wording");
    expect(suggest({ [part.id]: "However the day was unusual. Overall extend the trial." }, question)).toBeNull();
    expect(suggest({ [part.id]: "The desk reduces the waiting time." }, { ...question, kind: "extended", parts: [{ ...question.parts[0]!, marks: 6 }] })?.drillId).toBe("six-mark");
  });

  it("skips unavailable and MCQ sources", () => {
    expect(suggest(attempt.answers, { ...q, kind: "mcq" })).toBeNull();
    expect(suggest(attempt.answers, { ...q, validation: { stage: "retired" } as Question["validation"] })).toBeNull();
  });
});

describe("aggregate repair preserves real context and timed fallback", () => {
  it("uses contextual structure classification and labels its uncertainty", () => {
    expect(aggregate()?.drillId).toBe("explain");
    expect(aggregate()?.why).toContain("possible structure loss");
  });
  it("uses actionable saved diagnosis, but lets a specific non-structure cause win", () => {
    expect(aggregate({ errorCategory: "reasoning", errorConfidence: 0.8 })?.why).toContain("saved diagnosis");
    expect(aggregate({ errorCategory: "calculation", errorConfidence: 0.8 })).toBeNull();
    expect(aggregate({ errorCategory: "calculation", errorConfidence: 0.4 })?.why).toContain("possible");
  });
  it("reads current part command, not a stale capture-time tag", () => {
    expect(aggregate({ command: "calculate" })?.drillId).toBe("explain");
  });
  it.each([{ resolved: true }, { userId: "other" }, { topicId: "other" }, { questionId: "missing" }, { attemptId: "missing" }, { partId: "missing" }, { marksLost: 0 }, { marksLost: Number.NaN }])("rejects missing, resolved or foreign context %j", (overrides) => {
    expect(aggregate(overrides)).toBeNull();
  });
  it("never borrows another user's or question's attempt", () => {
    expect(aggregate({}, [q], [{ ...attempt, userId: "other" }])).toBeNull();
    expect(aggregate({}, [q], [{ ...attempt, questionId: "other" }])).toBeNull();
    expect(aggregate({}, [], [attempt])).toBeNull();
    expect(aggregate({}, [q], [])).toBeNull();
  });
  it("does not create a drill from a legacy tag or no real answer", () => {
    expect(aggregate({}, [q], [{ ...attempt, answers: {} }])).toBeNull();
    expect(aggregate({ errorCategory: undefined, questionId: undefined, attemptId: undefined })).toBeNull();
  });
  it("keeps timing and unsupported compare on their timed run", () => {
    const timingMistakes = Array.from({ length: 7 }, (_, index) => ({ ...mistake, id: `timing-${index}`, marksLost: 1, timing: "rushed" as const }));
    const earned = { ...attempt, marked: [{ ...marked, awarded: 2, missedPoints: ["queue clears"] }], awarded: 2 };
    const input = { subjectId: subject, userId: "learner", questions: [q], attempts: [earned], mistakes: timingMistakes };
    expect(techniqueRepairForMistakes(input)).toBeNull();
    const report = knowledgeVsAnswering(input);
    expect(report.drivers[0]?.klass).toBe("timing");
    expect(timedSessionRecommendation(report)?.minutes).toBe(5);
    const comparison = { ...q, parts: [{ ...part, prompt: "Compare the desks.", marks: 2 }] };
    expect(aggregate({}, [comparison])).toBeNull();
  });
});

describe("validated technique navigation", () => {
  it("accepts only supported drill IDs and ignores mark/AI/return flags", () => {
    const params = new URLSearchParams(`drill=evaluate&question=${encodeURIComponent(q.id)}&topic=${topic}&aiEnabled=true&marks=6&proof=1&return=https://attacker.test`);
    const parsed = parseTechniqueContext(params);
    expect(parsed.drillId).toBe("evaluate");
    expect(parsed).not.toHaveProperty("return");
    expect(parsed).not.toHaveProperty("aiEnabled");
    expect(destination(params.toString())?.href).toBe(`/practice?question=${encodeURIComponent(q.id)}`);
    expect(parseTechniqueContext(new URLSearchParams("drill=unknown")).drillId).toBe("describe");
  });
  it("returns to the real question and its command context", () => {
    const result = destination(`question=${encodeURIComponent(q.id)}&part=${encodeURIComponent(part.id)}&topic=${topic}`);
    expect(result?.why).toContain("asks you to explain");
    expect(result?.label).toBe("Return to the real question");
  });
  it("offers topic practice only when a current enrolled question exists", () => {
    expect(destination(`topic=${topic}`)?.href).toBe(`/practice?subject=${subject}&topic=${topic}`);
    expect(destination("topic=missing")).toBeNull();
    expect(destination(`topic=${topic}`, [], [subject])).toBeNull();
  });
  it.each(["question=missing", `question=${encodeURIComponent(q.id)}&part=missing`, `question=${encodeURIComponent(q.id)}&topic=other`, "question=https://attacker.test", `question=invalid%20id&topic=${topic}`, `question=${encodeURIComponent(q.id)}&part=`, "part=p:a", "topic=", "question=" ])("rejects invalid source context %s", (query) => {
    expect(destination(query)).toBeNull();
  });
  it("does not return to a retired source, another profile's subject or a generic absent source", () => {
    expect(destination(`question=${encodeURIComponent(q.id)}`, [{ ...q, validation: { stage: "retired" } as Question["validation"] }])).toBeNull();
    expect(destination(`question=${encodeURIComponent(q.id)}`, [q], ["another-subject"])).toBeNull();
    expect(destination("")).toBeNull();
  });
});

describe("technique UI safety wiring", () => {
  it("offers the result repair outside diagnostic only, preserving deferred repair", () => {
    const source = readFileSync("src/components/QuestionMarkedResult.tsx", "utf8");
    expect(source).toContain("const techniqueRepair = !inDiagnostic && awarded < question.totalMarks");
    expect(source).toContain("techniqueRepairForDiagnosis(question, result.errorDiagnosis)");
    expect(source).toContain("const techniqueShapeSuggestion = !inDiagnostic && !techniqueRepair && awarded < question.totalMarks");
    expect(source).toContain("answers: attempt?.answers ?? answers");
    expect(source).toContain('data-testid="technique-shape-suggestion"');
    expect(source).toContain("Optional response-shape practice");
    expect(source).toContain('data-testid="diagnostic-repair-deferred"');
    expect(source).toContain("<InterventionPrescriptionPanel");
  });
  it("retains timed-run fallback and limits aggregate drills to structure drivers", () => {
    const source = readFileSync("src/components/TechniqueSignal.tsx", "utf8");
    expect(source).toContain('["command word", "structure"].includes(report.drivers[0]?.klass');
    expect(source).toContain("techniqueRepairForMistakes");
    expect(source).toContain(") : timedRun ? (");
    expect(source).toContain("Start the {timedRun.minutes}-minute timed run");
  });
  it("keys drill state by profile and validated context, preserves no-answer metadata persistence", () => {
    const source = readFileSync("src/app/technique/page.tsx", "utf8");
    expect(source).toContain("key={userId}");
    expect(source).toContain("context.drillId}:${context.questionId}");
    expect(source).toContain("useState<TechniqueDrillId>(context.drillId)");
    expect(source).toContain("techniquePracticeDestination");
    expect(source).toContain("no longer available on this profile");
    expect(source).toContain("Your response is not stored or sent to an AI service.");
    expect(source).not.toContain('params.get("return")');
    expect(source).not.toContain("recordAttempt");
    expect(source).not.toContain("@/content");
  });
});
