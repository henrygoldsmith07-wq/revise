import { buildUnits, withReviewer } from "./helpers";
import { BIOLOGY_REFERENCE_OUTLINE } from "./outlines/biology";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// Edexcel A Level Biology (9BI0). Grouped by the specification's broad content
// areas; check the current Edexcel spec for exact assessment objectives.
const SUBJECT_ID = "edexcel-alevel-biology";

const { units, topics } = buildUnits(SUBJECT_ID, withReviewer(BIOLOGY_REFERENCE_OUTLINE, "authored/2024-v1-review"));

export const edexcelBiology: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
