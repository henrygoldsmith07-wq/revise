import { registerBoard, registerQualification } from "./registry";

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

// Importing for side effects registers each subject into the registry.
import "./wjec-maths";
import "./wjec-biology";
import "./wjec-chemistry";
import "./wjec-physics";
import "./aqa-biology";
import "./aqa-chemistry";
import "./aqa-physics";
import "./aqa-maths";
import "./edexcel-maths";
import "./edexcel-biology";
import "./edexcel-chemistry";
import "./edexcel-physics";
import "./ocr-maths";
import "./ocr-biology";
import "./ocr-chemistry";
import "./ocr-physics";
import "./wjec-gcse-maths";
import "./aqa-gcse-maths";
import "./edexcel-gcse-maths";
import "./ocr-gcse-maths";
import "./wjec-gcse-biology";
import "./aqa-gcse-biology";
import "./edexcel-gcse-biology";
import "./ocr-gcse-biology";
import "./wjec-gcse-chemistry";
import "./aqa-gcse-chemistry";
import "./edexcel-gcse-chemistry";
import "./ocr-gcse-chemistry";
import "./wjec-gcse-physics";
import "./aqa-gcse-physics";
import "./edexcel-gcse-physics";
import "./ocr-gcse-physics";

export * from "./registry";
export { A_LEVEL_BOUNDARIES } from "./helpers";
export type { TopicSpec, UnitSpec } from "./helpers";
