import { describe, expect, it } from "vitest";
import { getSubject, topicsFor } from "@/domain/curriculum";
import { physicsUnitNumber, topicUnitNumber, topicsForYear } from "@/domain/year-group";
import { unitMockBlueprints } from "@/domain/unit-mock";

const P = "wjec-alevel-physics";
const topics = () => topicsFor(P);
const unitOf = (slug: string) => topicUnitNumber(topics().find((t) => t.id === `${P}.${slug}`)!);

describe("WJEC Physics unit map", () => {
  it("puts momentum in AS Unit 1 so Year 12 is taught it", () => {
    expect(unitOf("momentum")).toBe(1);
    expect(topicsForYear(topics(), "year-12").map((t) => t.id)).toContain(`${P}.momentum`);
  });
  it("keeps A2 content out of Year 12", () => {
    const ids = topicsForYear(topics(), "year-12").map((t) => t.id);
    for (const slug of ["fields", "thermal", "nuclear", "circular-shm", "capacitance", "orbits-universe", "electromagnetic-induction"]) expect(ids).not.toContain(`${P}.${slug}`);
  });
  it("places thermal, nuclear and SHM in Unit 3 and fields, capacitance in Unit 4", () => {
    for (const s of ["thermal", "nuclear", "circular-shm"]) expect(unitOf(s)).toBe(3);
    for (const s of ["fields", "capacitance"]) expect(unitOf(s)).toBe(4);
  });
  it("leaves topics without an override on their spec reference and other subjects alone", () => {
    expect(unitOf("waves")).toBe(2);
    expect(unitOf("practical-investigations")).toBe(5);
    expect(physicsUnitNumber({ id: `${P}.momentum`, subjectId: "aqa-alevel-physics" })).toBeNull();
  });
  it("Unit 1 mock now samples momentum and Unit 3 mock samples thermal physics", () => {
    const subject = getSubject(P)!;
    const bp = unitMockBlueprints({ subject, topics: topics(), yearGroup: "year-13" });
    expect(bp.find((b) => b.unit === 1)!.topicIds).toContain(`${P}.momentum`);
    expect(bp.find((b) => b.unit === 3)!.topicIds).toEqual(expect.arrayContaining([`${P}.thermal`, `${P}.nuclear`]));
    expect(bp.find((b) => b.unit === 4)!.topicIds).toContain(`${P}.fields`);
  });
});
