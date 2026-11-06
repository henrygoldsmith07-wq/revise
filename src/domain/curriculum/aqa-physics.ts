import { boardOutline } from "./board-outline";
import { AQA_PHYSICS_SPEC_CHECKED, AQA_PHYSICS_UNITS } from "./boards/aqa-alevel-physics";
import { PHYSICS_EXTRA_TOPICS } from "./outlines/physics-extra";
import { buildUnits } from "./helpers";
import { PHYSICS_REFERENCE_OUTLINE } from "./outlines/physics";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// AQA A Level Physics (7408), structured section by section to the AQA
// specification (./boards/aqa-alevel-physics.ts) over the shared reference topics, whose
// ids are unchanged.
const SUBJECT_ID = "aqa-alevel-physics";

const { units, topics } = buildUnits(
  SUBJECT_ID,
  boardOutline([...PHYSICS_REFERENCE_OUTLINE, ...PHYSICS_EXTRA_TOPICS], AQA_PHYSICS_UNITS, {
    subjectId: SUBJECT_ID,
    lastChecked: AQA_PHYSICS_SPEC_CHECKED,
    specVersion: "2024-1.0",
  }),
);

export const aqaPhysics: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
