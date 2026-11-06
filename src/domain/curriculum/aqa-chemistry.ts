import { boardOutline } from "./board-outline";
import { AQA_CHEMISTRY_SPEC_CHECKED, AQA_CHEMISTRY_UNITS } from "./boards/aqa-alevel-chemistry";
import { CHEMISTRY_EXTRA_TOPICS } from "./outlines/chemistry-extra";
import { buildUnits } from "./helpers";
import { CHEMISTRY_REFERENCE_OUTLINE } from "./outlines/chemistry";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// AQA A Level Chemistry (7405), structured section by section to the AQA
// specification (./boards/aqa-alevel-chemistry.ts) over the shared reference topics, whose
// ids are unchanged.
const SUBJECT_ID = "aqa-alevel-chemistry";

const { units, topics } = buildUnits(
  SUBJECT_ID,
  boardOutline([...CHEMISTRY_REFERENCE_OUTLINE, ...CHEMISTRY_EXTRA_TOPICS], AQA_CHEMISTRY_UNITS, {
    subjectId: SUBJECT_ID,
    lastChecked: AQA_CHEMISTRY_SPEC_CHECKED,
    specVersion: "2024-1.0",
  }),
);

export const aqaChemistry: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
