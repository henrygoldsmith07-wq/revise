import { boardOutline } from "./board-outline";
import { AQA_BIOLOGY_SPEC_CHECKED, AQA_BIOLOGY_UNITS } from "./boards/aqa-alevel-biology";
import { A_LEVEL_BOUNDARIES, buildUnits } from "./helpers";
import { BIOLOGY_EXTRA_TOPICS } from "./outlines/biology-extra";
import { BIOLOGY_REFERENCE_OUTLINE } from "./outlines/biology";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// AQA A Level Biology (7402), structured section by section to the AQA
// specification (./boards/aqa-alevel-biology.ts) over the shared reference
// topics, whose ids are unchanged.
const SUBJECT_ID = "aqa-alevel-biology";

const { units, topics } = buildUnits(
  SUBJECT_ID,
  boardOutline([...BIOLOGY_REFERENCE_OUTLINE, ...BIOLOGY_EXTRA_TOPICS], AQA_BIOLOGY_UNITS, {
    subjectId: SUBJECT_ID,
    lastChecked: AQA_BIOLOGY_SPEC_CHECKED,
    specVersion: "2024-1.0",
  }),
);

export const aqaBiology: CurriculumModule = registerSubject({
  subject: {
    id: SUBJECT_ID,
    qualificationId: "aqa-alevel",
    name: "Biology",
    specCode: "7402",
        papers: [
      { id: `${SUBJECT_ID}.p1`, name: "Paper 1", weight: 0.35, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p2`, name: "Paper 2", weight: 0.35, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p3`, name: "Paper 3", weight: 0.30, durationMinutes: 120, calculatorAllowed: true },
    ],
    gradeBoundaries: A_LEVEL_BOUNDARIES,
    spec: { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-11-06", url: "https://filestore.aqa.org.uk/resources/biology/specifications/AQA-7401-7402-SP-2015.PDF" },
  },
  units,
  topics,
});
