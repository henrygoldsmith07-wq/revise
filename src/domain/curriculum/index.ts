import { REFERENCE_SUBJECTS } from "./catalog";
import { registerBoard, registerQualification, registerSubjectStub } from "./registry";

// ES module imports are hoisted, so the subject modules below actually
// register first. That is safe: registration only stores records, and every
// cross-reference (subject → qualification → board) is resolved lazily by the
// registry's lookup functions, long after this module has finished evaluating.
registerBoard({ id: "wjec", name: "WJEC", country: "United Kingdom" });
registerBoard({ id: "eduqas", name: "Eduqas", country: "United Kingdom" });
registerBoard({ id: "aqa", name: "AQA", country: "United Kingdom" });
registerBoard({ id: "edexcel", name: "Pearson Edexcel", country: "United Kingdom" });
registerBoard({ id: "ocr", name: "OCR", country: "United Kingdom" });

registerQualification({
  id: "wjec-alevel",
  boardId: "wjec",
  name: "WJEC A Level",
  level: "A Level",
  grades: ["A*", "A", "B", "C", "D", "E", "U"],
});

registerQualification({
  id: "aqa-alevel",
  boardId: "aqa",
  name: "AQA A Level",
  level: "A Level",
  grades: ["A*", "A", "B", "C", "D", "E", "U"],
});

registerQualification({
  id: "edexcel-alevel",
  boardId: "edexcel",
  name: "Edexcel A Level",
  level: "A Level",
  grades: ["A*", "A", "B", "C", "D", "E", "U"],
});

registerQualification({
  id: "ocr-alevel",
  boardId: "ocr",
  name: "OCR A Level",
  level: "A Level",
  grades: ["A*", "A", "B", "C", "D", "E", "U"],
});

registerQualification({
  id: "wjec-gcse",
  boardId: "wjec",
  name: "WJEC GCSE",
  level: "GCSE",
  grades: ["9", "8", "7", "6", "5", "4", "3", "2", "1", "U"],
});

registerQualification({
  id: "aqa-gcse",
  boardId: "aqa",
  name: "AQA GCSE",
  level: "GCSE",
  grades: ["9", "8", "7", "6", "5", "4", "3", "2", "1", "U"],
});

registerQualification({
  id: "edexcel-gcse",
  boardId: "edexcel",
  name: "Edexcel GCSE",
  level: "GCSE",
  grades: ["9", "8", "7", "6", "5", "4", "3", "2", "1", "U"],
});

registerQualification({
  id: "ocr-gcse",
  boardId: "ocr",
  name: "OCR GCSE",
  level: "GCSE",
  grades: ["9", "8", "7", "6", "5", "4", "3", "2", "1", "U"],
});

// The four WJEC flagships register with their topics at startup: the
// question bank is written against them and builds before Today.
import "./wjec-maths";
import "./wjec-biology";
import "./wjec-chemistry";
import "./wjec-physics";

// Every other subject registers its catalogue metadata now and its topic tree
// on demand (ensureSubjects / loadAllSubjects in ./registry.ts). Each loader
// is its own chunk, so a learner downloads only the subjects they study.
const SUBJECT_LOADERS: Record<string, () => Promise<unknown>> = {
  "aqa-alevel-biology": () => import("./aqa-biology"),
  "aqa-alevel-chemistry": () => import("./aqa-chemistry"),
  "aqa-alevel-computer-science": () => import("./aqa-computer-science"),
  "aqa-alevel-economics": () => import("./aqa-economics"),
  "aqa-gcse-biology": () => import("./aqa-gcse-biology"),
  "aqa-gcse-chemistry": () => import("./aqa-gcse-chemistry"),
  "aqa-gcse-maths": () => import("./aqa-gcse-maths"),
  "aqa-gcse-physics": () => import("./aqa-gcse-physics"),
  "aqa-alevel-maths": () => import("./aqa-maths"),
  "aqa-alevel-physics": () => import("./aqa-physics"),
  "aqa-alevel-psychology": () => import("./aqa-psychology"),
  "edexcel-alevel-biology": () => import("./edexcel-biology"),
  "edexcel-alevel-chemistry": () => import("./edexcel-chemistry"),
  "edexcel-gcse-biology": () => import("./edexcel-gcse-biology"),
  "edexcel-gcse-chemistry": () => import("./edexcel-gcse-chemistry"),
  "edexcel-gcse-maths": () => import("./edexcel-gcse-maths"),
  "edexcel-gcse-physics": () => import("./edexcel-gcse-physics"),
  "edexcel-alevel-maths": () => import("./edexcel-maths"),
  "edexcel-alevel-physics": () => import("./edexcel-physics"),
  "ocr-alevel-biology": () => import("./ocr-biology"),
  "ocr-alevel-chemistry": () => import("./ocr-chemistry"),
  "ocr-gcse-biology": () => import("./ocr-gcse-biology"),
  "ocr-gcse-chemistry": () => import("./ocr-gcse-chemistry"),
  "ocr-gcse-maths": () => import("./ocr-gcse-maths"),
  "ocr-gcse-physics": () => import("./ocr-gcse-physics"),
  "ocr-alevel-maths": () => import("./ocr-maths"),
  "ocr-alevel-physics": () => import("./ocr-physics"),
  "wjec-gcse-biology": () => import("./wjec-gcse-biology"),
  "wjec-gcse-chemistry": () => import("./wjec-gcse-chemistry"),
  "wjec-gcse-maths": () => import("./wjec-gcse-maths"),
  "wjec-gcse-physics": () => import("./wjec-gcse-physics"),
};

for (const subject of Object.values(REFERENCE_SUBJECTS)) {
  const load = SUBJECT_LOADERS[subject.id];
  if (!load) throw new Error(`No loader for reference subject ${subject.id}`);
  registerSubjectStub(subject, load);
}

export * from "./registry";
export { A_LEVEL_BOUNDARIES } from "./helpers";
export type { TopicSpec, UnitSpec } from "./helpers";
