import { A_LEVEL_BOUNDARIES, buildUnits, withReviewer } from "./helpers";
import { CHEMISTRY_REFERENCE_OUTLINE } from "./outlines/chemistry";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// OCR A Level Chemistry (H432). Grouped by the specification's broad
// content areas; check the current OCR spec for exact assessment objectives.
const SUBJECT_ID = "ocr-alevel-chemistry";

const { units, topics } = buildUnits(SUBJECT_ID, withReviewer(CHEMISTRY_REFERENCE_OUTLINE, "authored/2024-v1-review"));

export const ocrChemistry: CurriculumModule = registerSubject({
  subject: {
    id: SUBJECT_ID,
    qualificationId: "ocr-alevel",
    name: "Chemistry",
    specCode: "H432",
        papers: [
      { id: `${SUBJECT_ID}.p1`, name: "Paper 1: Inorganic and Physical Chemistry", weight: 0.35, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p2`, name: "Paper 2: Organic and Physical Chemistry", weight: 0.35, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p3`, name: "Paper 3", weight: 0.30, durationMinutes: 120, calculatorAllowed: true },
    ],
    gradeBoundaries: A_LEVEL_BOUNDARIES,
    spec: { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-08-01", url: "https://www.ocr.org.uk/qualifications/science/chemistry/as-and-a-level/chemistry-7404-H432" },
  },
  units,
  topics,
});
