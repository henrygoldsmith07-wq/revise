import { boardOutline } from "./board-outline";
import { AQA_BIOLOGY_SPEC_CHECKED, AQA_BIOLOGY_UNITS } from "./boards/aqa-alevel-biology";
import { buildUnits } from "./helpers";
import { BIOLOGY_EXTRA_TOPICS } from "./outlines/biology-extra";
import { BIOLOGY_REFERENCE_OUTLINE } from "./outlines/biology";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// AQA A Level Biology (7402), structured section by section to the AQA
// specification (./boards/aqa-alevel-biology.ts) over the shared reference
// topics, whose ids are unchanged.
const SUBJECT_ID = "aqa-alevel-biology";

const { units, topics } = buildUnits(
  SUBJECT_ID,
  boardOutline([...BIOLOGY_REFERENCE_OUTLINE, ...BIOLOGY_EXTRA_TOPICS], AQA_BIOLOGY_UNITS, {
    subjectId: SUBJECT_ID,
    lastChecked: AQA_BIOLOGY_SPEC_CHECKED,
    specVersion: "2024-1.0",
  }),
);

export const aqaBiology: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
