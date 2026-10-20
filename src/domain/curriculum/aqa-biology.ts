import { A_LEVEL_BOUNDARIES, buildUnits } from "./helpers";
import { BIOLOGY_REFERENCE_OUTLINE } from "./outlines/biology";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// AQA A Level Biology (7402). Grouped by the specification's broad content
// areas; check the current AQA spec for exact assessment objectives.
const SUBJECT_ID = "aqa-alevel-biology";

const { units, topics } = buildUnits(SUBJECT_ID, BIOLOGY_REFERENCE_OUTLINE);

export const aqaBiology: CurriculumModule = registerSubject({
  subject: {
    id: SUBJECT_ID,
    qualificationId: "aqa-alevel",
    name: "Biology",
    specCode: "7402",
        papers: [
      { id: `${SUBJECT_ID}.p1`, name: "Paper 1", weight: 0.35, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p2`, name: "Paper 2", weight: 0.35, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p3`, name: "Paper 3", weight: 0.30, durationMinutes: 120, calculatorAllowed: true },
    ],
    gradeBoundaries: A_LEVEL_BOUNDARIES,
    spec: { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-08-01", url: "https://www.aqa.org.uk/subjects/science/biology/as-and-a-level/biology-7401-7402" },
  },
  units,
  topics,
});
