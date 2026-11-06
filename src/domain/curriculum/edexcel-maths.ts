import { buildUnits, withReviewer } from "./helpers";
import { MATHS_REFERENCE_OUTLINE } from "./outlines/maths";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// Edexcel A Level Mathematics (9MA0). Topic grouping follows the broad
// content areas of the specification; always check the current Edexcel spec
// document for exact assessment objectives and weightings.
const SUBJECT_ID = "edexcel-alevel-maths";

const { units, topics } = buildUnits(SUBJECT_ID, withReviewer(MATHS_REFERENCE_OUTLINE, "authored/2024-v1-review"));

export const edexcelMaths: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
