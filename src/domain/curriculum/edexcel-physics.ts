import { A_LEVEL_BOUNDARIES, buildUnits, withReviewer } from "./helpers";
import { PHYSICS_REFERENCE_OUTLINE } from "./outlines/physics";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// Edexcel A Level Physics (9PH0). Grouped by the specification's broad content
// areas; check the current Edexcel spec for exact assessment objectives.
const SUBJECT_ID = "edexcel-alevel-physics";

const { units, topics } = buildUnits(SUBJECT_ID, withReviewer(PHYSICS_REFERENCE_OUTLINE, "authored/2024-v1-review"));

export const edexcelPhysics: CurriculumModule = registerSubject({
  subject: {
    id: SUBJECT_ID,
    qualificationId: "edexcel-alevel",
    name: "Physics",
    specCode: "9PH0",
        papers: [
      { id: `${SUBJECT_ID}.p1`, name: "Paper 1", weight: 0.34, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p2`, name: "Paper 2", weight: 0.34, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p3`, name: "Paper 3 (including Option)", weight: 0.32, durationMinutes: 120, calculatorAllowed: true },
    ],
    gradeBoundaries: A_LEVEL_BOUNDARIES,
    spec: { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-08-01", url: "https://www.pearson.com/qualifications/science/physics/as-and-a-level/physics-7407-9PH0" },
  },
  units,
  topics,
});
