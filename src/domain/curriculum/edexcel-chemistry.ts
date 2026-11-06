import { buildUnits, withReviewer } from "./helpers";
import { CHEMISTRY_REFERENCE_OUTLINE } from "./outlines/chemistry";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// Edexcel A Level Chemistry (9CH0). Grouped by the specification's broad
// content areas; check the current Edexcel spec for exact assessment objectives.
const SUBJECT_ID = "edexcel-alevel-chemistry";

const { units, topics } = buildUnits(SUBJECT_ID, withReviewer(CHEMISTRY_REFERENCE_OUTLINE, "authored/2024-v1-review"));

export const edexcelChemistry: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
