import { A_LEVEL_BOUNDARIES, buildUnits, withReviewer } from "./helpers";
import { BIOLOGY_REFERENCE_OUTLINE } from "./outlines/biology";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// Edexcel A Level Biology (9BI0). Grouped by the specification's broad content
// areas; check the current Edexcel spec for exact assessment objectives.
const SUBJECT_ID = "edexcel-alevel-biology";

const { units, topics } = buildUnits(SUBJECT_ID, withReviewer(BIOLOGY_REFERENCE_OUTLINE, "authored/2024-v1-review"));

export const edexcelBiology: CurriculumModule = registerSubject({
  subject: {
    id: SUBJECT_ID,
    qualificationId: "edexcel-alevel",
    name: "Biology",
    specCode: "9BI0",
        papers: [
      { id: `${SUBJECT_ID}.p1`, name: "Paper 1", weight: 0.35, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p2`, name: "Paper 2", weight: 0.35, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p3`, name: "Paper 3", weight: 0.30, durationMinutes: 120, calculatorAllowed: true },
    ],
    gradeBoundaries: A_LEVEL_BOUNDARIES,
    spec: { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-08-01", url: "https://www.pearson.com/qualifications/science/biology/as-and-a-level/biology-7401-9BI0" },
  },
  units,
  topics,
});
