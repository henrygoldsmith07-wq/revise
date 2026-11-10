import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { InterventionStep } from "@/domain/intervention-engine";
import { choosePracticeNextStep, gapNextStep, gapPracticeHref, type AnswerGapStepInput } from "@/domain/practice-next-step";
import { orderBySpecPoint, parsePracticeStepMode, parseSpecPointParam, questionHasSpecPoint } from "@/domain/practice-step-mode";
import type { TechniqueRepair } from "@/domain/technique-repair";
import type { Question } from "@/domain/types";

// The step after a lost mark follows what the answer showed. The topic's
// plan is built from the topic's history, so "I don't know" and a slipped
// conversion used to get the same "Guided application".

const guided: InterventionStep = { kind: "guided-question", title: "Guided practice: Topic", minutes: 8, countsAsProof: false, why: "Support first.", href: "/practice?topic=t1&guided=1" };
const prescription = { headline: "Repair: Topic", topicTitle: "Topic", firstStep: guided };
const fallback = { label: "Repair the missed points", why: "You dropped 3 of 3 marks here." };
const gap = (over: Partial<AnswerGapStepInput>): AnswerGapStepInput => ({ kind: "not-attempted", repair: "learn", certainty: "clear", topicId: "t1", specPointId: "t1.sp-03", ...over });
const PROMISE = /counts as (your own )?evidence|will count as evidence|counts as independent evidence/i;

describe("gapNextStep", () => {
  it("a gap in the idea goes to a guided question on the same point", () => {
    const step = gapNextStep(gap({ taughtInPlace: true }))!;
    expect(step.href).toBe("/practice?topic=t1&guided=1&minutes=8&point=t1.sp-03");
    expect(parsePracticeStepMode(new URL(step.href!, "https://x.invalid").searchParams)).toBe("guided");
    expect(step.why).toMatch(/just read the idea/);
    expect(gapNextStep(gap({ taughtInPlace: false }))!.why).not.toMatch(/just read/);
  });

  it("a slip goes to a fresh question without help", () => {
    for (const kind of ["power-of-ten", "arithmetic"] as const) {
      const step = gapNextStep(gap({ kind, repair: "redo", certainty: "likely" }))!;
      expect(parsePracticeStepMode(new URL(step.href!, "https://x.invalid").searchParams)).toBe("unaided");
      expect(step.note).toMatch(/Practice, not proof/);
    }
  });

  it("a point left out goes back to this answer when it can be rewritten, else to an unaided question", () => {
    const here = gapNextStep(gap({ kind: "incomplete", repair: "state-points", certainty: "likely", canRewrite: true }))!;
    expect(here).toMatchObject({ href: null, cta: null });
    expect(here.why).toMatch(/Improve my answer/);
    const away = gapNextStep(gap({ kind: "incomplete", repair: "state-points", certainty: "likely", canRewrite: false }))!;
    expect(away.href).toBe(gapPracticeHref("t1", "unaided", "t1.sp-03"));
  });

  it("an unsure reading chooses nothing, and no step promises evidence", () => {
    expect(gapNextStep(gap({ kind: "off-target", certainty: "unsure" }))).toBeNull();
    expect(gapNextStep(null)).toBeNull();
    for (const repair of ["learn", "example", "redo", "state-points"] as const) {
      for (const canRewrite of [true, false]) {
        expect(JSON.stringify(gapNextStep(gap({ repair, canRewrite })))).not.toMatch(PROMISE);
      }
    }
  });
});

describe("choosePracticeNextStep with a reading of the answer", () => {
  it("outranks the topic plan, and is outranked by a technique repair of this answer", () => {
    expect(choosePracticeNextStep({ techniqueRepair: null, prescription, fallback, gap: gap({}) }).kind).toBe("gap");
    const drill: TechniqueRepair = { drillId: "explain", questionId: "q1", partId: "p", topicId: "t1", why: "w", href: "/technique?drill=explain" };
    expect(choosePracticeNextStep({ techniqueRepair: drill, prescription, fallback, gap: gap({}) }).kind).toBe("technique");
  });

  it("falls back to the plan when the reading is unsure or absent", () => {
    expect(choosePracticeNextStep({ techniqueRepair: null, prescription, fallback, gap: gap({ certainty: "unsure" }) }).kind).toBe("prescription");
    expect(choosePracticeNextStep({ techniqueRepair: null, prescription, fallback }).kind).toBe("prescription");
  });
});

describe("?point= is honoured by /practice", () => {
  const q = (id: string, points: string[]): Pick<Question, "id" | "parts"> => ({ id, parts: [{ id: `${id}.a`, specPointIds: points }] } as unknown as Question);

  it("accepts an id and refuses anything else", () => {
    expect(parseSpecPointParam("wjec-alevel-physics.energy-power.sp-03")).toBe("wjec-alevel-physics.energy-power.sp-03");
    for (const bad of [null, "", "  ", "a b", "<script>", "x".repeat(161), "a/b", "a?b=c"]) expect(parseSpecPointParam(bad)).toBeNull();
  });

  it("puts questions on the point first and never drops the rest", () => {
    const pool = [q("a", ["p1"]), q("b", ["p2"]), q("c", ["p1", "p2"]), q("d", [])];
    const { ordered, matched } = orderBySpecPoint(pool, "p2");
    expect(ordered.map((x) => x.id)).toEqual(["b", "c", "a", "d"]);
    expect(matched).toBe(2);
    expect(orderBySpecPoint(pool, null).ordered.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(orderBySpecPoint(pool, "none").ordered.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(questionHasSpecPoint(pool[2]!, "p1")).toBe(true);
  });

  it("the page reads it, orders the step by it before deferring proof supply, and keeps it across a resume", () => {
    const page = readFileSync("src/app/practice/page.tsx", "utf8");
    expect(page).toContain('parseSpecPointParam(params.get("point"))');
    expect(page).toContain("deferProofSupply(orderBySpecPoint(pool, pointParam).ordered, stepMode, store.attempts, store.questions)");
    expect(page).toContain('if (appliedStepMode && pointParam) next.set("point", pointParam);');
    expect(page).toContain('${params.get("point") ?? ""}');
  });
});
