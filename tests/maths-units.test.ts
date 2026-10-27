import { describe, expect, it } from "vitest";
import { getSubject, topicsFor } from "@/domain/curriculum";
import { mathsUnitNumber, topicUnitNumber, topicsForYear } from "@/domain/year-group";
import { unitMockBlueprints } from "@/domain/unit-mock";
import { seedQuestions } from "@/content";

const MATHS = "wjec-alevel-maths";
const topics = () => topicsFor(MATHS);

describe("WJEC Maths unit split", () => {
  it("places every Maths topic in exactly one of Units 1-4", () => {
    for (const t of topics()) expect([1, 2, 3, 4], t.title).toContain(topicUnitNumber(t));
  });
  it("puts numerical methods and differential equations in A2 Unit 3, Poisson/Normal in Unit 4", () => {
    const byTitle = (re: RegExp) => topics().filter((t) => re.test(t.title));
    for (const t of byTitle(/numerical methods|differential equations/i)) expect(mathsUnitNumber(t)).toBe(3);
    for (const t of byTitle(/poisson|normal/i)) expect(mathsUnitNumber(t)).toBe(4);
    for (const t of byTitle(/^(Differentiation|Vectors|Probability|Kinematics)$/)) expect([1, 2]).toContain(mathsUnitNumber(t));
  });
  it("only applies to WJEC Maths", () => {
    expect(mathsUnitNumber({ specRef: "Pure 1.2", subjectId: "aqa-alevel-maths", title: "Algebra" })).toBeNull();
  });
  it("Year 12 no longer gets A2 Maths topics", () => {
    const all = topics();
    const y12 = topicsForYear(all, "year-12");
    expect(y12.length).toBeLessThan(all.length);
    expect(y12.every((t) => (topicUnitNumber(t) ?? 0) <= 2)).toBe(true);
    expect(topicsForYear(all, "year-13")).toHaveLength(all.length);
  });
  it("Maths now has Unit 1 and Unit 2 mock blueprints with the real marks and clock", () => {
    const subject = getSubject(MATHS)!;
    const y12 = unitMockBlueprints({ subject, topics: topics(), yearGroup: "year-12" });
    expect(y12.map((b) => [b.unit, b.durationMinutes, b.marks])).toEqual([[1, 150, 120], [2, 105, 75]]);
    expect(unitMockBlueprints({ subject, topics: topics(), yearGroup: "year-13" }).map((b) => b.unit)).toEqual([1, 2, 3, 4]);
  });
  it("every Maths question's topics resolve to a unit", () => {
    const known = new Map(topics().map((t) => [t.id, t]));
    const qs = seedQuestions.filter((x) => x.subjectId === MATHS);
    expect(qs.length).toBeGreaterThan(0);
    for (const x of qs) for (const id of x.topicIds) if (known.has(id)) expect(topicUnitNumber(known.get(id)!)).not.toBeNull();
  });
});
