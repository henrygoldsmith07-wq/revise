import { buildUnits, withReviewer } from "./helpers";
import { PHYSICS_REFERENCE_OUTLINE } from "./outlines/physics";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// Edexcel A Level Physics (9PH0). Grouped by the specification's broad content
// areas; check the current Edexcel spec for exact assessment objectives.
const SUBJECT_ID = "edexcel-alevel-physics";

const { units, topics } = buildUnits(SUBJECT_ID, withReviewer(PHYSICS_REFERENCE_OUTLINE, "authored/2024-v1-review"));

export const edexcelPhysics: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
