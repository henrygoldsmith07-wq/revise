import { boardOutline } from "./board-outline";
import { AQA_MATHS_SPEC_CHECKED, AQA_MATHS_UNITS } from "./boards/aqa-alevel-maths";
import { A_LEVEL_BOUNDARIES, buildUnits } from "./helpers";
import { MATHS_REFERENCE_OUTLINE } from "./outlines/maths";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// AQA A Level Mathematics (7357), structured section by section to the AQA
// specification (./boards/aqa-alevel-maths.ts) over the shared reference topics, whose
// ids are unchanged.
const SUBJECT_ID = "aqa-alevel-maths";

const { units, topics } = buildUnits(
  SUBJECT_ID,
  boardOutline(MATHS_REFERENCE_OUTLINE, AQA_MATHS_UNITS, {
    subjectId: SUBJECT_ID,
    lastChecked: AQA_MATHS_SPEC_CHECKED,
    specVersion: "2024-1.0",
  }),
);

export const aqaMaths: CurriculumModule = registerSubject({
  subject: {
    id: SUBJECT_ID,
    qualificationId: "aqa-alevel",
    name: "Mathematics",
    specCode: "7357",
        papers: [
      { id: `${SUBJECT_ID}.p1`, name: "Paper 1", weight: 0.333, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p2`, name: "Paper 2", weight: 0.333, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p3`, name: "Paper 3", weight: 0.334, durationMinutes: 120, calculatorAllowed: true },
    ],
    gradeBoundaries: A_LEVEL_BOUNDARIES,
    spec: { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-11-06", url: "https://filestore.aqa.org.uk/resources/mathematics/specifications/AQA-7357-SP-2017.PDF" },
  },
  units,
  topics,
});
