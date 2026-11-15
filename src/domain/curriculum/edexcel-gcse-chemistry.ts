import { buildUnits } from "./helpers";
import { GCSE_CHEMISTRY_OUTLINE } from "./outlines/gcse-chemistry";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// Pearson Edexcel GCSE Chemistry (1CH0). Topics follow the DfE GCSE chemistry subject content
// (./outlines/gcse-chemistry.ts), which this specification is built on; not the
// board's own numbering or order. Until the one-hundred-and-twentieth pass it
// was built from the WJEC A-level outline.
const SUBJECT_ID = "edexcel-gcse-chemistry";

const { units, topics } = buildUnits(SUBJECT_ID, GCSE_CHEMISTRY_OUTLINE);

export const aqaChemistry: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
