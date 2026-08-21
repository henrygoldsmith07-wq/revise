import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { createCard } from "@/domain/scheduling";
import { masteryIntervals } from "@/domain/mastery-uncertainty";
import type { Attempt, Card } from "@/domain/types";

const NOW = new Date("2026-08-18T09:00:00.000Z");

function card(topicId: string, id: string): Card {
  return {
    ...createCard({ id, userId: "u", subjectId: "physics", topicId, front: "front", back: "back" }, NOW),
    stability: 21,
    reps: 4,
    lastReviewedAt: NOW.toISOString(),
  };
}

function attempt(id: string, topicId: string): Attempt {
  return {
    id,
    userId: "u",
    questionId: `q-${id}`,
    subjectId: "physics",
    topicIds: [topicId],
    answers: {},
    marked: [],
    awarded: 8,
    max: 10,
    feedback: "feedback",
    markedBy: "rubric",
    elapsedMs: 1000,
    mode: "practice",
    createdAt: NOW.toISOString(),
  };
}

describe("mastery uncertainty", () => {
  it("keeps thin evidence wide and distinguishes it from a measured interval", () => {
    const rows = masteryIntervals({
      masteryByTopic: new Map([
        ["thin", 0.8],
        ["measured", 0.8],
      ]),
      cardsByTopic: new Map([
        ["thin", [card("thin", "thin-card")]],
        ["measured", Array.from({ length: 12 }, (_, index) => card("measured", `measured-card-${index}`))],
      ]),
      attemptsByTopic: new Map([
        ["thin", [attempt("thin", "thin")]],
        ["measured", Array.from({ length: 6 }, (_, index) => attempt(`measured-${index}`, "measured"))],
      ]),
      mistakesByTopic: new Map(),
      now: NOW,
    });

    const thin = rows.find((row) => row.topicId === "thin")!;
    const measured = rows.find((row) => row.topicId === "measured")!;
    expect(thin).toMatchObject({ uncertainty: "high", needsMoreEvidence: true, evidence: 3 });
    expect(measured.needsMoreEvidence).toBe(false);
    expect(measured.width).toBeLessThan(thin.width);
  });

  it("wires intervals and evidence actions into Progress", () => {
    const progress = readFileSync(join(process.cwd(), "src/app/progress/page.tsx"), "utf8");
    const panels = readFileSync(join(process.cwd(), "src/components/AssessmentPanels.tsx"), "utf8");
    const store = readFileSync(join(process.cwd(), "src/state/store.tsx"), "utf8");

    expect(progress).toContain("MasteryUncertaintyCard");
    expect(panels).toContain("Mastery uncertainty");
    expect(panels).toContain("masteryUncertainty");
    expect(store).toContain("masteryIntervals");
  });
});
