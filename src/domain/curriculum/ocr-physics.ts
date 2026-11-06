import { buildUnits, withReviewer } from "./helpers";
import { PHYSICS_REFERENCE_OUTLINE } from "./outlines/physics";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// OCR A Level Physics (H556). Grouped by the specification's broad content
// areas; check the current OCR spec for exact assessment objectives.
const SUBJECT_ID = "ocr-alevel-physics";

const { units, topics } = buildUnits(SUBJECT_ID, withReviewer(PHYSICS_REFERENCE_OUTLINE, "authored/2024-v1-review"));

export const ocrPhysics: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
