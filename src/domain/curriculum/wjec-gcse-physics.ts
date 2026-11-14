import { buildUnits } from "./helpers";
import { GCSE_PHYSICS_OUTLINE } from "./outlines/gcse-physics";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// WJEC GCSE Physics (3450). Topics follow the DfE GCSE physics subject content
// for England (./outlines/gcse-physics.ts). WJEC's GCSE for Wales is regulated
// by Qualifications Wales and is not built on that document: the two share
// most of their physics but differ in places, and the subject label says so. Until the
// one-hundred-and-nineteenth pass it was built from the WJEC A-level outline.
const SUBJECT_ID = "wjec-gcse-physics";

const { units, topics } = buildUnits(SUBJECT_ID, GCSE_PHYSICS_OUTLINE);

export const aqaPhysics: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
