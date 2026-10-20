import { GCSE_BOUNDARIES, buildUnits } from "./helpers";
import { CHEMISTRY_REFERENCE_OUTLINE } from "./outlines/chemistry";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// Pearson Edexcel GCSE Chemistry (1CH0).
// content areas; check the current AQA spec for exact assessment objectives.
const SUBJECT_ID = "edexcel-gcse-chemistry";

const { units, topics } = buildUnits(SUBJECT_ID, CHEMISTRY_REFERENCE_OUTLINE);

export const aqaChemistry: CurriculumModule = registerSubject({
  subject: {
    id: SUBJECT_ID,
    qualificationId: "edexcel-gcse",
    name: "Chemistry",
    specCode: "1CH0",
        papers: [
      { id: `${SUBJECT_ID}.p1`, name: "Paper 1: Inorganic and Physical Chemistry", weight: 0.35, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p2`, name: "Paper 2: Organic and Physical Chemistry", weight: 0.35, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p3`, name: "Paper 3", weight: 0.30, durationMinutes: 120, calculatorAllowed: true },
    ],
    gradeBoundaries: GCSE_BOUNDARIES,
    spec: { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-08-01", url: "https://qualifications.pearson.com/en/qualifications/edexcel-gcses/sciences-2016.html" },
  },
  units,
  topics,
});
