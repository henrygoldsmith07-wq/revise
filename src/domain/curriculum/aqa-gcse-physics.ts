import { GCSE_BOUNDARIES, buildUnits } from "./helpers";
import { PHYSICS_REFERENCE_OUTLINE } from "./outlines/physics";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// AQA GCSE Physics (8463).
// areas; check the current AQA spec for exact assessment objectives.
const SUBJECT_ID = "aqa-gcse-physics";

const { units, topics } = buildUnits(SUBJECT_ID, PHYSICS_REFERENCE_OUTLINE);

export const aqaPhysics: CurriculumModule = registerSubject({
  subject: {
    id: SUBJECT_ID,
    qualificationId: "aqa-gcse",
    name: "Physics",
    specCode: "8463",
        papers: [
      { id: `${SUBJECT_ID}.p1`, name: "Paper 1", weight: 0.34, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p2`, name: "Paper 2", weight: 0.34, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p3`, name: "Paper 3 (including Option)", weight: 0.32, durationMinutes: 120, calculatorAllowed: true },
    ],
    gradeBoundaries: GCSE_BOUNDARIES,
    spec: { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-08-01", url: "https://www.aqa.org.uk/subjects/science/physics/gcse/physics-8463" },
  },
  units,
  topics,
});
