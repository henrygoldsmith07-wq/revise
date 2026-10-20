import { GCSE_BOUNDARIES, buildUnits } from "./helpers";
import { BIOLOGY_REFERENCE_OUTLINE } from "./outlines/biology";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// Pearson Edexcel GCSE Biology (1BI0).
// areas; check the current AQA spec for exact assessment objectives.
const SUBJECT_ID = "edexcel-gcse-biology";

const { units, topics } = buildUnits(SUBJECT_ID, BIOLOGY_REFERENCE_OUTLINE);

export const aqaBiology: CurriculumModule = registerSubject({
  subject: {
    id: SUBJECT_ID,
    qualificationId: "edexcel-gcse",
    name: "Biology",
    specCode: "1BI0",
        papers: [
      { id: `${SUBJECT_ID}.p1`, name: "Paper 1", weight: 0.35, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p2`, name: "Paper 2", weight: 0.35, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p3`, name: "Paper 3", weight: 0.30, durationMinutes: 120, calculatorAllowed: true },
    ],
    gradeBoundaries: GCSE_BOUNDARIES,
    spec: { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-08-01", url: "https://qualifications.pearson.com/en/qualifications/edexcel-gcses/sciences-2016.html" },
  },
  units,
  topics,
});
