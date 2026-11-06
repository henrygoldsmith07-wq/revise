import { boardOutline } from "./board-outline";
import { AQA_MATHS_SPEC_CHECKED, AQA_MATHS_UNITS } from "./boards/aqa-alevel-maths";
import { buildUnits } from "./helpers";
import { MATHS_REFERENCE_OUTLINE } from "./outlines/maths";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// AQA A Level Mathematics (7357), structured section by section to the AQA
// specification (./boards/aqa-alevel-maths.ts) over the shared reference topics, whose
// ids are unchanged.
const SUBJECT_ID = "aqa-alevel-maths";

const { units, topics } = buildUnits(
  SUBJECT_ID,
  boardOutline(MATHS_REFERENCE_OUTLINE, AQA_MATHS_UNITS, {
    subjectId: SUBJECT_ID,
    lastChecked: AQA_MATHS_SPEC_CHECKED,
    specVersion: "2024-1.0",
  }),
);

export const aqaMaths: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
