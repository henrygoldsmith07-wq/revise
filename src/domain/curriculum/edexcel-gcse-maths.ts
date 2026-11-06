import { buildUnits } from "./helpers";
import { MATHS_REFERENCE_OUTLINE } from "./outlines/maths";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// Pearson Edexcel GCSE Maths (1MA1).
// content areas of the specification; always check the current Pearson Edexcel GCSE spec
// document for exact assessment objectives and weightings.
const SUBJECT_ID = "edexcel-gcse-maths";

const { units, topics } = buildUnits(SUBJECT_ID, MATHS_REFERENCE_OUTLINE);

export const aqaMaths: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
