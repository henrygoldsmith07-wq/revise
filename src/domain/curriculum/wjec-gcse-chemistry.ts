import { GCSE_BOUNDARIES, buildUnits } from "./helpers";
import { CHEMISTRY_REFERENCE_OUTLINE } from "./outlines/chemistry";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// WJEC GCSE Chemistry (3445).
// content areas; check the current AQA spec for exact assessment objectives.
const SUBJECT_ID = "wjec-gcse-chemistry";

const { units, topics } = buildUnits(SUBJECT_ID, CHEMISTRY_REFERENCE_OUTLINE);

export const aqaChemistry: CurriculumModule = registerSubject({
  subject: {
    id: SUBJECT_ID,
    qualificationId: "wjec-gcse",
    name: "Chemistry",
    specCode: "3445",
        papers: [
      { id: `${SUBJECT_ID}.p1`, name: "Paper 1: Inorganic and Physical Chemistry", weight: 0.35, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p2`, name: "Paper 2: Organic and Physical Chemistry", weight: 0.35, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p3`, name: "Paper 3", weight: 0.30, durationMinutes: 120, calculatorAllowed: true },
    ],
    gradeBoundaries: GCSE_BOUNDARIES,
    spec: { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-08-01", url: "https://www.wjec.co.uk/qualifications/chemistry-gcse/" },
  },
  units,
  topics,
});
