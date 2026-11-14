import { buildUnits } from "./helpers";
import { GCSE_PHYSICS_OUTLINE } from "./outlines/gcse-physics";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// AQA GCSE Physics (8463). Topics follow the DfE GCSE physics subject content that every
// board's GCSE physics specification is built on (./outlines/gcse-physics.ts),
// not yet this board's own topic order and numbering. Until the
// one-hundred-and-nineteenth pass it was built from the WJEC A-level outline.
const SUBJECT_ID = "aqa-gcse-physics";

const { units, topics } = buildUnits(SUBJECT_ID, GCSE_PHYSICS_OUTLINE);

export const aqaPhysics: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
