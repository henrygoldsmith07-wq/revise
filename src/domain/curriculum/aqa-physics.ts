import { A_LEVEL_BOUNDARIES, buildUnits } from "./helpers";
import { PHYSICS_REFERENCE_OUTLINE } from "./outlines/physics";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// AQA A Level Physics (7408). Grouped by the specification's broad content
// areas; check the current AQA spec for exact assessment objectives.
const SUBJECT_ID = "aqa-alevel-physics";

const { units, topics } = buildUnits(SUBJECT_ID, PHYSICS_REFERENCE_OUTLINE);

export const aqaPhysics: CurriculumModule = registerSubject({
  subject: {
    id: SUBJECT_ID,
    qualificationId: "aqa-alevel",
    name: "Physics",
    specCode: "7408",
        papers: [
      { id: `${SUBJECT_ID}.p1`, name: "Paper 1", weight: 0.34, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p2`, name: "Paper 2", weight: 0.34, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p3`, name: "Paper 3 (including Option)", weight: 0.32, durationMinutes: 120, calculatorAllowed: true },
    ],
    gradeBoundaries: A_LEVEL_BOUNDARIES,
    spec: { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-08-01", url: "https://www.aqa.org.uk/subjects/science/physics/as-and-a-level/physics-7407-7408" },
  },
  units,
  topics,
});
