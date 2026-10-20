import { GCSE_BOUNDARIES, buildUnits } from "./helpers";
import { BIOLOGY_REFERENCE_OUTLINE } from "./outlines/biology";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// AQA GCSE Biology (8461).
// areas; check the current AQA spec for exact assessment objectives.
const SUBJECT_ID = "aqa-gcse-biology";

const { units, topics } = buildUnits(SUBJECT_ID, BIOLOGY_REFERENCE_OUTLINE);

export const aqaBiology: CurriculumModule = registerSubject({
  subject: {
    id: SUBJECT_ID,
    qualificationId: "aqa-gcse",
    name: "Biology",
    specCode: "8461",
        papers: [
      { id: `${SUBJECT_ID}.p1`, name: "Paper 1", weight: 0.35, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p2`, name: "Paper 2", weight: 0.35, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p3`, name: "Paper 3", weight: 0.30, durationMinutes: 120, calculatorAllowed: true },
    ],
    gradeBoundaries: GCSE_BOUNDARIES,
    spec: { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-08-01", url: "https://www.aqa.org.uk/subjects/science/biology/gcse/biology-8461" },
  },
  units,
  topics,
});
