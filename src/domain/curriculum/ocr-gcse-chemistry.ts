import { buildUnits } from "./helpers";
import { CHEMISTRY_REFERENCE_OUTLINE } from "./outlines/chemistry";
import { referenceSubject } from "./catalog";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// OCR GCSE Chemistry (J258).
// content areas; check the current AQA spec for exact assessment objectives.
const SUBJECT_ID = "ocr-gcse-chemistry";

const { units, topics } = buildUnits(SUBJECT_ID, CHEMISTRY_REFERENCE_OUTLINE);

export const aqaChemistry: CurriculumModule = registerSubject({
  subject: referenceSubject(SUBJECT_ID),
  units,
  topics,
});
