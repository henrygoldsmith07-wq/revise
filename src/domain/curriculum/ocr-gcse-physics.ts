import { buildUnits } from "./helpers";
import { PHYSICS_REFERENCE_OUTLINE } from "./outlines/physics";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// OCR GCSE Physics (J259).
// areas; check the current AQA spec for exact assessment objectives.
const SUBJECT_ID = "ocr-gcse-physics";

const { units, topics } = buildUnits(SUBJECT_ID, PHYSICS_REFERENCE_OUTLINE);

export const aqaPhysics: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
