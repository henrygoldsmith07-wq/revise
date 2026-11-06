import { buildUnits, withReviewer } from "./helpers";
import { MATHS_REFERENCE_OUTLINE } from "./outlines/maths";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// OCR A Level Mathematics (H240). Topic grouping follows the broad
// content areas of the specification; always check the current OCR spec
// document for exact assessment objectives and weightings.
const SUBJECT_ID = "ocr-alevel-maths";

const { units, topics } = buildUnits(SUBJECT_ID, withReviewer(MATHS_REFERENCE_OUTLINE, "authored/2024-v1-review"));

export const ocrMaths: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
