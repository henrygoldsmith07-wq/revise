import { buildUnits } from "./helpers";
import { BIOLOGY_REFERENCE_OUTLINE } from "./outlines/biology";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// WJEC GCSE Biology (3440).
// areas; check the current AQA spec for exact assessment objectives.
const SUBJECT_ID = "wjec-gcse-biology";

const { units, topics } = buildUnits(SUBJECT_ID, BIOLOGY_REFERENCE_OUTLINE);

export const aqaBiology: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
