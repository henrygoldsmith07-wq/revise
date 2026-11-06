import { buildUnits, withReviewer } from "./helpers";
import { BIOLOGY_REFERENCE_OUTLINE } from "./outlines/biology";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// OCR A Level Biology (H420). Grouped by the specification's broad content
// areas; check the current OCR spec for exact assessment objectives.
const SUBJECT_ID = "ocr-alevel-biology";

const { units, topics } = buildUnits(SUBJECT_ID, withReviewer(BIOLOGY_REFERENCE_OUTLINE, "authored/2024-v1-review"));

export const ocrBiology: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
