import { buildUnits } from "./helpers";
import { GCSE_CHEMISTRY_OUTLINE } from "./outlines/gcse-chemistry";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// WJEC GCSE Chemistry (3445). Topics follow the DfE GCSE chemistry subject content
// for England (./outlines/gcse-chemistry.ts). WJEC's GCSE for Wales is regulated
// by Qualifications Wales and is not built on that document: the two share
// most of their chemistry but differ in places, and the subject label says so.
// Until the one-hundred-and-twentieth pass it was built from the WJEC A-level
// outline.
const SUBJECT_ID = "wjec-gcse-chemistry";

const { units, topics } = buildUnits(SUBJECT_ID, GCSE_CHEMISTRY_OUTLINE);

export const aqaChemistry: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
