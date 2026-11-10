import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { TEACHING } from "@/content/teaching";
import { getTopic } from "@/domain/curriculum";
import { buildHintLadder, chooseAnsweredExample, chooseTeachingPoint, questionSpecPoint, teachingLinesFor } from "@/domain/hints";
import { repairTeachesFirst } from "@/domain/mission-session";

// Help comes from the question, not the top of its topic. The ladder used to
// take keyPoints[0] and commonErrors[0] whatever was asked, so an efficiency
// question was told to think about W = Fs cosθ.

const byId = (id: string) => seedQuestions.find((q) => q.id === id)!;
const efficiency = byId("cnt:question:authentic-expansion-wjec-alevel-physics-physics-efficiency");
const topicOf = (id: string) => { const t = getTopic(id)!; return { keyPoints: t.keyPoints, commonErrors: t.commonErrors }; };
const teachingFor = (id: string) => TEACHING[id];

describe("buildHintLadder without authored teaching", () => {
  it("takes the key point and common error closest to the question", () => {
    const ladder = buildHintLadder(efficiency, topicOf(efficiency.topicIds[0]!));
    const prompt = ladder.find((h) => h.tier === "prompt")!;
    expect(prompt.text).toMatch(/Efficiency = useful output/);
    expect(prompt.text).not.toMatch(/cosθ/);
    expect(ladder.find((h) => h.tier === "scaffold")!.text).toMatch(/efficiency above 100%/);
  });

  it("always has a worked solution when the question has an answer, with or without a topic", () => {
    const top = buildHintLadder(efficiency).at(-1)!;
    expect(top.tier).toBe("worked-solution");
    expect(top.detail?.solution?.[0]?.modelAnswer).toBe(efficiency.parts[0]!.modelAnswer);
    expect(top.detail?.solution?.[0]?.points).toEqual(efficiency.parts[0]!.markScheme);
  });
});

describe("buildHintLadder with the question's taught point", () => {
  const choice = chooseTeachingPoint(efficiency, getTopic, teachingFor)!;
  const ladder = buildHintLadder(efficiency, topicOf(efficiency.topicIds[0]!), { specPoint: choice.specPoint, teaching: choice.teaching });

  it("names the point, teaches it, works a different problem, then shows this answer", () => {
    expect(ladder.map((h) => h.tier)).toEqual(["cue", "prompt", "scaffold", "worked-solution"]);
    expect(ladder[0]!.text).toContain(choice.specPoint.ref);
    expect(ladder[1]!.detail?.lines?.join(" ")).toMatch(/Efficiency/);
    expect(ladder[2]!.detail?.example?.prompt).toBe(choice.teaching.worked.prompt);
    expect(ladder[3]!.detail?.solution?.length).toBe(1);
  });

  it("keeps this question's credited values out of every rung below the top", () => {
    for (const hint of ladder.slice(0, 3)) {
      const shown = [hint.text, ...(hint.detail?.lines ?? []), hint.detail?.example?.prompt ?? "", ...(hint.detail?.example?.steps ?? []), hint.detail?.example?.answer ?? ""].join(" ");
      expect(shown).not.toMatch(/420\/600|0\.70\b|180 W/);
    }
  });

  it("shows the lines of a point that bear on the question, in written order", () => {
    const lines = teachingLinesFor(efficiency, choice.teaching.explain);
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(lines.join(" ")).toMatch(/Efficiency/);
    const order = lines.map((line) => choice.teaching.explain.indexOf(line));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe("chooseTeachingPoint", () => {
  it("keeps a question's own tag when its teaching bears on it", () => {
    for (const id of [efficiency.id, "cnt:question:physics-depth-waves-sp-04-tir-conditions-0", "cnt:question:repair-depth-phys-drag-recall"]) {
      const question = byId(id);
      const choice = chooseTeachingPoint(question, getTopic, teachingFor)!;
      expect(choice.tagged, id).toBe(true);
      expect(choice.specPoint.id).toBe(questionSpecPoint(question, getTopic)!.id);
    }
  });

  it("overrules a first-statement tag when another point in the topic plainly teaches the question", () => {
    const internalResistance = seedQuestions.find((q) => q.subjectId === "wjec-alevel-physics" && q.stem.includes("always supplies 12 V"))!;
    expect(internalResistance.parts[0]!.specPointIds).toEqual(["wjec-alevel-physics.electric-circuits.sp-01"]);
    const choice = chooseTeachingPoint(internalResistance, getTopic, teachingFor)!;
    expect(choice.tagged).toBe(false);
    expect(choice.teaching.explain.join(" ")).toMatch(/internal resistance/i);
  });

  it("is conservative: it moves few questions, and never leaves a taught tag without teaching", () => {
    const written = seedQuestions.filter((q) => q.subjectId === "wjec-alevel-physics" && q.kind !== "mcq");
    let moved = 0;
    for (const question of written) {
      const tags = question.parts.flatMap((p) => p.specPointIds ?? []).filter((id) => TEACHING[id]);
      const choice = chooseTeachingPoint(question, getTopic, teachingFor);
      if (tags.length) expect(choice, question.id).not.toBeNull();
      if (choice && !choice.tagged) moved += 1;
    }
    // A ratchet on how often the tag is overruled (55 when written). A rise
    // means the chooser got bolder or tagging got worse; look before raising.
    expect(moved).toBeLessThanOrEqual(Math.ceil(written.length * 0.04));
  });

  it("offers nothing where no teaching is written", () => {
    const maths = seedQuestions.find((q) => q.subjectId === "wjec-alevel-maths")!;
    expect(chooseTeachingPoint(maths, getTopic, teachingFor)).toBeNull();
  });
});

describe("chooseAnsweredExample", () => {
  const internalResistance = seedQuestions.find((q) => q.subjectId === "wjec-alevel-physics" && q.stem.includes("always supplies 12 V"))!;
  const choice = chooseTeachingPoint(internalResistance, getTopic, teachingFor)!;
  const point = choice.specPoint.id;
  const onPoint = seedQuestions.filter((q) => q.subjectId === "wjec-alevel-physics" && q.kind !== "mcq" && q.id !== internalResistance.id && q.parts.some((p) => (p.specPointIds ?? []).includes(point)));

  it("prefers a question the student has sat on the same point when it is closer than the taught example", () => {
    const closer = onPoint.filter((q) => /internal resistance/i.test(`${q.stem} ${q.parts.map((p) => p.prompt).join(" ")}`));
    expect(closer.length).toBeGreaterThan(0);
    const example = chooseAnsweredExample(internalResistance, closer, point, choice.teaching.worked)!;
    expect(example.source).toBe("answered");
    expect(`${example.prompt} ${example.answer}`).toMatch(/internal resistance|lost volts|terminal/i);
    const ladder = buildHintLadder(internalResistance, undefined, { specPoint: choice.specPoint, teaching: choice.teaching, answeredExample: example });
    expect(ladder.find((h) => h.tier === "scaffold")!.detail?.example).toEqual(example);
  });

  it("never uses the question itself, another point, a multiple-choice item or nothing answered", () => {
    expect(chooseAnsweredExample(internalResistance, [internalResistance], point, choice.teaching.worked)).toBeNull();
    expect(chooseAnsweredExample(internalResistance, [], point, choice.teaching.worked)).toBeNull();
    expect(chooseAnsweredExample(internalResistance, onPoint, null, choice.teaching.worked)).toBeNull();
    const elsewhere = seedQuestions.filter((q) => q.subjectId === "wjec-alevel-physics" && !q.parts.some((p) => (p.specPointIds ?? []).includes(point))).slice(0, 40);
    expect(chooseAnsweredExample(internalResistance, elsewhere, point, choice.teaching.worked)).toBeNull();
  });

  it("without one, the ladder keeps the taught example", () => {
    const ladder = buildHintLadder(internalResistance, undefined, { specPoint: choice.specPoint, teaching: choice.teaching, answeredExample: null });
    expect(ladder.find((h) => h.tier === "scaffold")!.detail?.example).toMatchObject({ prompt: choice.teaching.worked.prompt, source: "taught" });
  });
});

describe("a repair opens taught only for a gap in the idea", () => {
  it("teaches first for knowledge and method gaps, in the repair stage only", () => {
    for (const cause of ["missing-knowledge", "misunderstood-concept", "wrong-method", "prerequisite-weakness"]) {
      expect(repairTeachesFirst({ stage: "repair", targetCause: cause })).toBe(true);
      expect(repairTeachesFirst({ stage: "apply", targetCause: cause })).toBe(false);
    }
    for (const cause of ["arithmetic-slip", "unit-error", "timing", "unclassified", null]) {
      expect(repairTeachesFirst({ stage: "repair", targetCause: cause })).toBe(false);
    }
    expect(repairTeachesFirst(undefined)).toBe(false);
  });

  it("the practice components load teaching on demand, never statically", () => {
    for (const file of ["src/components/QuestionRunner.tsx", "src/components/QuestionMarkedResult.tsx", "src/components/LostMarksRepair.tsx", "src/components/AdaptiveQuestionBlock.tsx", "src/state/question-execution.ts", "src/state/checkpoint-teaching.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/from "@\/content\/teaching"/);
    }
    expect(readFileSync("src/state/checkpoint-teaching.ts", "utf8")).toContain('import("@/content/teaching")');
  });
});
