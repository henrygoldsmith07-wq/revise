import { A_LEVEL_BOUNDARIES, buildUnits } from "./helpers";
import { MATHS_REFERENCE_OUTLINE } from "./outlines/maths";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// AQA A Level Mathematics (7357). Topic grouping follows the broad
// content areas of the specification; always check the current AQA spec
// document for exact assessment objectives and weightings.
const SUBJECT_ID = "aqa-alevel-maths";

const { units, topics } = buildUnits(SUBJECT_ID, MATHS_REFERENCE_OUTLINE);

export const aqaMaths: CurriculumModule = registerSubject({
  subject: {
    id: SUBJECT_ID,
    qualificationId: "aqa-alevel",
    name: "Mathematics",
    specCode: "7357",
        papers: [
      { id: `${SUBJECT_ID}.p1`, name: "Paper 1", weight: 0.333, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p2`, name: "Paper 2", weight: 0.333, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p3`, name: "Paper 3", weight: 0.334, durationMinutes: 120, calculatorAllowed: true },
    ],
    gradeBoundaries: A_LEVEL_BOUNDARIES,
    spec: { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-08-01", url: "https://www.aqa.org.uk/subjects/mathematics/as-and-a-level/mathematics-7356-7357" },
  },
  units,
  topics,
});
