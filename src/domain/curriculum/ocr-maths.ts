import { A_LEVEL_BOUNDARIES, buildUnits, withReviewer } from "./helpers";
import { MATHS_REFERENCE_OUTLINE } from "./outlines/maths";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// OCR A Level Mathematics (H240). Topic grouping follows the broad
// content areas of the specification; always check the current OCR spec
// document for exact assessment objectives and weightings.
const SUBJECT_ID = "ocr-alevel-maths";

const { units, topics } = buildUnits(SUBJECT_ID, withReviewer(MATHS_REFERENCE_OUTLINE, "authored/2024-v1-review"));

export const ocrMaths: CurriculumModule = registerSubject({
  subject: {
    id: SUBJECT_ID,
    qualificationId: "ocr-alevel",
    name: "Mathematics",
    specCode: "H240",
        papers: [
      { id: `${SUBJECT_ID}.p1`, name: "Paper 1", weight: 0.333, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p2`, name: "Paper 2", weight: 0.333, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p3`, name: "Paper 3", weight: 0.334, durationMinutes: 120, calculatorAllowed: true },
    ],
    gradeBoundaries: A_LEVEL_BOUNDARIES,
    spec: { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-08-01", url: "https://www.ocr.org.uk/qualifications/mathematics/as-and-a-level/mathematics-7356-H240" },
  },
  units,
  topics,
});
