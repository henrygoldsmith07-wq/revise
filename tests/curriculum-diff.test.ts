import { describe, expect, it } from "vitest";
import {
  diffSnapshots,
  impactedQuestions,
  recordedSpecVersionChanges,
  snapshotTopic,
  specVersionOutdated,
  type Snapshot,
} from "@/domain/curriculum-diff";
import type { SpecManifestEntry } from "@/domain/spec";
import type { AoCode, Question, SpecPoint, Topic } from "@/domain/types";

const AOS: AoCode[] = ["AO1"];
const sp = (id: string, ref: string, text: string): SpecPoint => ({ id, ref, text, aos: AOS });

const baseTopic = (overrides: Partial<Topic>): Topic => ({
  id: "aqa-gcse-maths.algebra",
  subjectId: "aqa-gcse-maths",
  unitId: "aqa-gcse-maths.unit",
  title: "Algebra",
  order: 0,
  intrinsicDifficulty: 2,
  summary: "Manipulating expressions.",
  keyPoints: ["Expand brackets"],
  commonErrors: ["Forgets to collect like terms"],
  ...overrides,
});

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    subjectId: "aqa-gcse-maths",
    specVersion: "2024-1.0",
    topics: [
      snapshotTopic(
        baseTopic({
          specPoints: [sp("sp-01", "1.1", "Expand two linear brackets"), sp("sp-02", "1.2", "Factorise quadratics")],
        }),
      ),
      snapshotTopic(
        baseTopic({
          id: "aqa-gcse-maths.stats",
          title: "Statistics",
          specPoints: [sp("sp-10", "5.1", "Interpret a scatter graph")],
        }),
      ),
    ],
    ...overrides,
  };
}

describe("diffSnapshots", () => {
  it("reports added, removed and reworded spec points within a topic", () => {
    const before = snapshot();
    const after = snapshot({
      specVersion: "2025-1.0",
      topics: [
        snapshotTopic(
          baseTopic({
            specPoints: [
              sp("sp-01", "1.1", "Expand and simplify two linear brackets"), // reworded
              sp("sp-03", "1.3", "Factorise by completing the square"), // added
            ],
          }),
        ),
        snapshotTopic(
          baseTopic({
            id: "aqa-gcse-maths.stats",
            title: "Statistics",
            specPoints: [sp("sp-10", "5.1", "Interpret a scatter graph")],
          }),
        ),
      ],
    });

    const diff = diffSnapshots(before, after);
    expect(diff.beforeVersion).toBe("2024-1.0");
    expect(diff.afterVersion).toBe("2025-1.0");

    const algebra = diff.topicChanges.find((t) => t.topicId === "aqa-gcse-maths.algebra")!;
    expect(algebra.points).toHaveLength(3);
    expect(algebra.points.find((p) => p.pointId === "sp-01")).toMatchObject({ kind: "changed" });
    expect(algebra.points.find((p) => p.pointId === "sp-02")).toMatchObject({ kind: "removed" });
    expect(algebra.points.find((p) => p.pointId === "sp-03")).toMatchObject({ kind: "added" });
    expect(diff.summary).toContain("3 spec point(s)");
  });

  it("detects topic-level additions and removals", () => {
    const before = snapshot();
    const after = snapshot({
      topics: [
        snapshotTopic(
          baseTopic({
            specPoints: [sp("sp-01", "1.1", "Expand two linear brackets")],
          }),
        ),
        snapshotTopic(
          baseTopic({
            id: "aqa-gcse-maths.vectors",
            title: "Vectors",
            specPoints: [sp("sp-20", "6.1", "Add vectors")],
          }),
        ),
      ],
    });

    const diff = diffSnapshots(before, after);
    expect(diff.topicsRemoved).toContain("aqa-gcse-maths.stats");
    expect(diff.topicsAdded).toContain("aqa-gcse-maths.vectors");
  });

  it("reports key point and common-error changes", () => {
    const before = snapshot();
    const after = snapshot({
      topics: [
        snapshotTopic(
          baseTopic({
            keyPoints: ["Expand brackets", "State the domain"],
            commonErrors: ["Forgets to collect like terms", "Drops the negative sign"],
            specPoints: [sp("sp-01", "1.1", "Expand two linear brackets")],
          }),
        ),
        snapshotTopic(
          baseTopic({
            id: "aqa-gcse-maths.stats",
            title: "Statistics",
            specPoints: [sp("sp-10", "5.1", "Interpret a scatter graph")],
          }),
        ),
      ],
    });

    const diff = diffSnapshots(before, after);
    const algebra = diff.topicChanges.find((t) => t.topicId === "aqa-gcse-maths.algebra")!;
    expect(algebra.keyPointsAdded).toEqual(["State the domain"]);
    expect(algebra.errorsAdded).toEqual(["Drops the negative sign"]);
  });

  it("reports no changes for identical snapshots", () => {
    const diff = diffSnapshots(snapshot(), snapshot());
    expect(diff.topicChanges).toHaveLength(0);
    expect(diff.summary).toContain("no content changes detected");
  });
});

describe("impactedQuestions", () => {
  it("flags questions pinned to removed or reworded points", () => {
    const before = snapshot();
    const after = snapshot({
      topics: [
        snapshotTopic(
          baseTopic({
            specPoints: [sp("sp-01", "1.1", "Expand two linear brackets")],
          }),
        ),
        snapshotTopic(
          baseTopic({
            id: "aqa-gcse-maths.stats",
            title: "Statistics",
            specPoints: [sp("sp-10", "5.1", "Interpret a scatter graph")],
          }),
        ),
      ],
    });
    const diff = diffSnapshots(before, after);

    const questions: Question[] = [
      {
        id: "q-1",
        subjectId: "aqa-gcse-maths",
        topicIds: ["aqa-gcse-maths.algebra"],
        kind: "structured",
        stem: "Factorise x^2 - 5x + 6.",
        parts: [],
        totalMarks: 2,
        calculatorAllowed: false,
        difficulty: 2,
        origin: "seed",
        source: "authored",
        verification: "checked",
        createdAt: "2025-01-01T00:00:00.000Z",
        specPointIds: ["sp-02"], // removed in the new spec
      },
      {
        id: "q-2",
        subjectId: "aqa-gcse-maths",
        topicIds: ["aqa-gcse-maths.algebra"],
        kind: "structured",
        stem: "Expand (x+1)(x-2).",
        parts: [],
        totalMarks: 2,
        calculatorAllowed: false,
        difficulty: 2,
        origin: "seed",
        source: "authored",
        verification: "checked",
        createdAt: "2025-01-01T00:00:00.000Z",
        specPointIds: ["sp-01"], // unchanged
      },
    ];

    const impacted = impactedQuestions(diff, questions);
    expect(impacted.map((i) => i.questionId)).toEqual(["q-1"]);
    expect(impacted[0]!.affectedPointIds).toContain("sp-02");
  });
});

describe("manifest helpers", () => {
  const entry = (overrides: Partial<SpecManifestEntry> = {}): SpecManifestEntry => ({
    subjectId: "aqa-alevel-biology",
    boardId: "aqa",
    qualificationId: "aqa-alevel",
    specCode: "7402",
    level: "A Level",
    version: "2024-1.0",
    releaseDate: "2024-09-01",
    lastChecked: "2026-08-01",
    ...overrides,
  });

  it("detects a newer spec version than the manifest records", () => {
    expect(specVersionOutdated(entry(), "2024-1.0")).toBe(false);
    expect(specVersionOutdated(entry(), "2025-1.0")).toBe(true);
  });

  it("lists subjects whose recorded history spans multiple spec versions", () => {
    const multi = entry({
      history: [
        { version: "2023-1.0", releaseDate: "2023-09-01", lastChecked: "2024-06-01" },
        { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-08-01" },
      ],
    });
    const changes = recordedSpecVersionChanges([entry(), multi]);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.subjectId).toBe("aqa-alevel-biology");
    expect(changes[0]!.versions).toEqual(["2023-1.0", "2024-1.0"]);
  });

  it("reports nothing for subjects with a single recorded version", () => {
    expect(recordedSpecVersionChanges([entry()])).toHaveLength(0);
  });
});
