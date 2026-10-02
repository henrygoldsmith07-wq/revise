import { describe, expect, it } from "vitest";
import { buildCoverageRows, coverageCsv, coverageMetrics } from "@/domain/trusted-coverage";
import type { Question, Subject, Topic, Unit } from "@/domain/types";

const subject = { id: "s", qualificationId: "q", name: "S", papers: [], gradeBoundaries: [], spec: { version: "1", releaseDate: "2024-01-01", lastChecked: "2026-08-01", url: "" } } as Subject;
const units: Unit[] = [{ id: "u", subjectId: "s", title: "Unit 1", order: 1 }];
const topics: Topic[] = [{ id: "t", subjectId: "s", unitId: "u", title: "T", order: 1, intrinsicDifficulty: 2, summary: "", keyPoints: [], commonErrors: [], specPoints: [{ id: "sp1", ref: "1.1", text: "x", aos: ["AO1"] }, { id: "sp2", ref: "1.2", text: "y", aos: ["AO1"] }] }];
const q = (id: string, demand: string, family: string, spec = "sp1"): Question => ({
  id, subjectId: "s", topicIds: ["t"], kind: "short", stem: id, totalMarks: 2, calculatorAllowed: true, difficulty: 3, origin: "seed", createdAt: "2026-01-01T00:00:00.000Z",
  learning: { demand, familyId: family } as Question["learning"], parts: [{ id: `${id}:a`, label: "", prompt: "p", marks: 2, markScheme: ["a"], modelAnswer: "m", specPointIds: [spec] }],
}) as Question;
const bank = [q("r", "recall", "f1"), q("a", "application", "f2"), q("t", "transfer", "f3"), q("a2", "application", "f2"), q("x", "recall", "f4")];
const rows = (trusted: (x: Question) => boolean) => buildCoverageRows({ subject, topics, units, questions: bank, trusted });

describe("trusted coverage", () => {
  it("counts nothing when nothing is trusted, however much is authored", () => {
    const r = rows(() => false)[0]!;
    expect(r).toMatchObject({ authored: 5, reviewed: 0, reviewStatus: "unreviewed", fullyCovered: false });
    expect(coverageMetrics(rows(() => false))).toMatchObject({ anyTrustedPct: 0, completePct: 0 });
  });
  it("needs all three depths, four trusted items and three families", () => {
    const partial = rows((x) => ["r", "a", "t"].includes(x.id))[0]!;
    expect(partial.fullyCovered).toBe(false);
    expect(partial.missing).toEqual(["1-more-trusted"]);
    const sameFamily = rows((x) => ["r", "a", "t", "a2"].includes(x.id))[0]!;
    expect(sameFamily.trustedFamilies).toBe(3);
    expect(sameFamily.fullyCovered).toBe(true);
    const memorise = buildCoverageRows({ subject, topics, units, questions: [q("r", "recall", "f"), q("a", "application", "f"), q("t", "transfer", "f"), q("a2", "application", "f")], trusted: () => true })[0]!;
    expect(memorise.missing).toEqual(["2-more-families"]);
    expect(memorise.fullyCovered).toBe(false);
  });
  it("keeps statements with no questions explicit", () => {
    const empty = rows(() => true)[1]!;
    expect(empty).toMatchObject({ authored: 0, reviewStatus: "none-authored", fullyCovered: false });
    expect(empty.missing).toContain("trusted-transfer");
  });
  it("release readiness requires every release item to be trusted", () => {
    const all = (x: Question) => x.id !== "x";
    const open = buildCoverageRows({ subject, topics, units, questions: bank, trusted: all, release: () => true })[0]!;
    expect(open.releaseReady).toBe(false);
    const gated = buildCoverageRows({ subject, topics, units, questions: bank, trusted: all, release: all })[0]!;
    expect(gated.releaseReady).toBe(true);
  });
  it("exports a quoted CSV", () => {
    const csv = coverageCsv(rows(() => true));
    expect(csv.split("\n")).toHaveLength(3);
    expect(csv.split("\n")[0]).toMatch(/^statement,subject/);
  });
});
