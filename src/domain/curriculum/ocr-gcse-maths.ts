import { GCSE_BOUNDARIES, buildUnits } from "./helpers";
import { MATHS_REFERENCE_OUTLINE } from "./outlines/maths";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// OCR GCSE Maths (J560).
// content areas of the specification; always check the current OCR GCSE spec
// document for exact assessment objectives and weightings.
const SUBJECT_ID = "ocr-gcse-maths";

const { units, topics } = buildUnits(SUBJECT_ID, MATHS_REFERENCE_OUTLINE);

export const aqaMaths: CurriculumModule = registerSubject({
  subject: {
    id: SUBJECT_ID,
    qualificationId: "ocr-gcse",
    name: "Mathematics",
    specCode: "J560",
        papers: [
      { id: `${SUBJECT_ID}.p1`, name: "Paper 1", weight: 0.333, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p2`, name: "Paper 2", weight: 0.333, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p3`, name: "Paper 3", weight: 0.334, durationMinutes: 120, calculatorAllowed: true },
    ],
    gradeBoundaries: GCSE_BOUNDARIES,
    spec: { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-08-01", url: "https://www.ocr.org.uk/qualifications/gcse/mathematics-j560-from-2015/" },
  },
  units,
  topics,
});
