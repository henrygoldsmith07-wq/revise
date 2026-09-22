import { describe, expect, it } from "vitest";
import { applyDraft, draftFromCard } from "@/components/CardEditor";
import { parseDiagram } from "@/domain/diagrams";
import { createCard } from "@/domain/scheduling";

const NOW = new Date("2026-09-22T12:00:00.000Z");

function baseCard() {
  return createCard(
    {
      id: "card-1",
      userId: "u",
      subjectId: "wjec-alevel-biology",
      topicId: "wjec-alevel-biology.cell-structure",
      front: "Label the cell",
      back: "Nucleus",
      kind: "image",
      imageUrl: "data:image/png;base64,OLD",
      origin: "manual",
    },
    NOW,
  );
}

describe("diagram card editing", () => {
  it("stores a valid authored diagram without duplicating the data URL in the back", () => {
    const card = baseCard();
    const draft = {
      ...draftFromCard(card),
      imageUrl: "data:image/png;base64,NEW",
      diagramMode: true,
      diagramHotspots: [
        { id: "nucleus", x: 32.4, y: 48.8, label: " Nucleus ", note: " Contains DNA " },
      ],
    };

    const saved = applyDraft(card, draft, new Date("2026-09-22T13:00:00.000Z"));
    expect(saved.imageUrl).toBe("data:image/png;base64,NEW");
    expect(saved.back).toContain("@diagram:");
    expect(saved.back).not.toContain("data:image/png;base64,NEW");
    expect(parseDiagram(saved)).toEqual({
      imageUrl: "data:image/png;base64,NEW",
      hotspots: [
        { id: "nucleus", x: 32.4, y: 48.8, label: "Nucleus", note: "Contains DNA" },
      ],
    });
  });

  it("turns a stored diagram back into an editable draft instead of exposing JSON", () => {
    const card = baseCard();
    const saved = applyDraft(card, {
      ...draftFromCard(card),
      diagramMode: true,
      diagramHotspots: [{ id: "nucleus", x: 30, y: 40, label: "Nucleus" }],
    });
    const restored = draftFromCard(saved);

    expect(restored.diagramMode).toBe(true);
    expect(restored.back).toBe("");
    expect(restored.diagramHotspots).toEqual([{ id: "nucleus", x: 30, y: 40, label: "Nucleus" }]);
  });

  it("refuses an incomplete programmatic diagram save", () => {
    const card = baseCard();
    const saved = applyDraft(card, {
      ...draftFromCard(card),
      front: "Changed title",
      diagramMode: true,
      diagramHotspots: [{ id: "blank", x: 50, y: 50, label: "" }],
    });
    expect(saved).toBe(card);
    expect(saved.front).toBe("Label the cell");
  });

  it("keeps ordinary image cards as front/back cards when diagram mode is off", () => {
    const card = baseCard();
    const saved = applyDraft(card, {
      ...draftFromCard(card),
      front: "Identify the organelle",
      back: "Mitochondrion",
      diagramMode: false,
      diagramHotspots: [],
    });
    expect(saved.kind).toBe("image");
    expect(saved.back).toBe("Mitochondrion");
    expect(parseDiagram(saved)).toBeNull();
  });
});
