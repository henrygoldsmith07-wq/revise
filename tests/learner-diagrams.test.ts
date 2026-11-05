import { describe, expect, it } from "vitest";
import { cardAnswer, isTextCard } from "@/domain/card-display";
import { exportDeck, materialiseDeck, parseDeckJson, serialiseDeck } from "@/domain/deck-io";
import {
  addDiagramPoint,
  CARD_IMAGE,
  diagramCardBack,
  diagramDraftIssue,
  diagramNeedsCardImage,
  isDiagramCard,
  MAX_DIAGRAM_POINTS,
  parseDiagram,
  serialiseDiagram,
  startDiagramRound,
  type DiagramPointDraft,
} from "@/domain/diagrams";
import { createCard } from "@/domain/scheduling";
import { buildShareLink } from "@/domain/sharing";

// A learner's own labelled diagram (image occlusion): a photo with numbered
// points, built in the library's "Write a card" panel. The photo lives on the
// card's imageUrl and the back names it with a placeholder, so it survives the
// paths that cap a card's text fields.

const PHOTO = `data:image/jpeg;base64,${"A".repeat(20_000)}`;

function points(): DiagramPointDraft[] {
  let draft = addDiagramPoint([], 22.44, 31.06);
  draft = addDiagramPoint(draft, 70, 60);
  return draft.map((point, index) => ({ ...point, label: index === 0 ? "  Left atrium " : "Aorta" }));
}

function photoCard(id = "c1") {
  return createCard({
    id,
    userId: "u",
    subjectId: "biology",
    topicId: "biology.heart",
    front: "Label the heart",
    back: diagramCardBack(points()),
    kind: "image",
    imageUrl: PHOTO,
    tags: ["diagram"],
  });
}

describe("learner diagrams", () => {
  it("drops numbered points with rounded coordinates and never reuses an id", () => {
    const draft = addDiagramPoint(addDiagramPoint([], 22.44, 31.06), 140, -5);
    expect(draft.map(({ id, x, y }) => ({ id, x, y }))).toEqual([
      { id: "p1", x: 22.4, y: 31.1 },
      { id: "p2", x: 100, y: 0 },
    ]);
    const afterDelete = addDiagramPoint(draft.slice(1), 50, 50);
    expect(afterDelete.map((point) => point.id)).toEqual(["p2", "p3"]);
  });

  it("stops at the point limit", () => {
    let draft: DiagramPointDraft[] = [];
    for (let i = 0; i < MAX_DIAGRAM_POINTS + 5; i++) draft = addDiagramPoint(draft, i, i);
    expect(draft).toHaveLength(MAX_DIAGRAM_POINTS);
  });

  it("says what is missing before a draft can be saved", () => {
    expect(diagramDraftIssue(undefined, points())).toMatch(/photo/);
    expect(diagramDraftIssue(PHOTO, [])).toMatch(/Tap the image/);
    const unnamed = [...points(), { id: "p9", x: 1, y: 1, label: " " }];
    expect(diagramDraftIssue(PHOTO, unnamed)).toBe("Name point 3, or remove it.");
    expect(diagramDraftIssue(PHOTO, points())).toBeNull();
  });

  it("reads the card's own image into the diagram, and keeps the photo out of the back", () => {
    const card = photoCard();
    expect(card.back).not.toContain("base64");
    expect(card.back.length).toBeLessThan(400);
    expect(diagramNeedsCardImage(card)).toBe(true);
    expect(isDiagramCard(card)).toBe(true);
    expect(isTextCard(card)).toBe(false);
    const spec = parseDiagram(card)!;
    expect(spec.imageUrl).toBe(PHOTO);
    expect(spec.hotspots.map((h) => h.label)).toEqual(["Left atrium", "Aorta"]);
    expect(cardAnswer(card).kind).toBe("diagram");
    expect(startDiagramRound(spec, 1).bank.sort()).toEqual(["Aorta", "Left atrium"]);
  });

  it("is not a diagram when the card has lost its image", () => {
    expect(parseDiagram({ ...photoCard(), imageUrl: undefined })).toBeNull();
  });

  it("leaves authored diagrams, whose image is a URL in the payload, unchanged", () => {
    const authored = { back: serialiseDiagram({ imageUrl: "/diagrams/animal-cell.svg", hotspots: [{ id: "n", x: 1, y: 2, label: "Nucleus" }] }) };
    expect(diagramNeedsCardImage(authored)).toBe(false);
    expect(parseDiagram(authored)?.imageUrl).toBe("/diagrams/animal-cell.svg");
    expect(CARD_IMAGE).not.toMatch(/^(data|https?):/);
  });

  it("survives a file export and import with its photo", () => {
    const report = parseDeckJson(serialiseDeck(exportDeck([photoCard()], { name: "Heart", includeScheduling: false })));
    expect(report.deck).not.toBeNull();
    const [imported] = materialiseDeck(report.deck!, {
      userId: "v",
      fallbackSubjectId: "biology",
      fallbackTopicId: "biology.heart",
      knownTopicIds: new Set(["biology.heart"]),
      keepScheduling: false,
    }).cards;
    expect(imported!.imageUrl).toBe(PHOTO);
    expect(parseDiagram(imported!)?.hotspots.map((h) => h.label)).toEqual(["Left atrium", "Aorta"]);
  });

  it("stays out of a share link, which cannot carry the photo", () => {
    const text = createCard({ id: "t", userId: "u", subjectId: "biology", topicId: "biology.heart", front: "Q", back: "A" });
    const link = buildShareLink([photoCard(), text], "Heart", "https://revise.example");
    expect(link.cardsIncluded).toBe(1);
    expect(link.url).not.toContain("card%3Aimage");
    expect(buildShareLink([photoCard()], "Heart", "https://revise.example").cardsIncluded).toBe(0);
  });
});
