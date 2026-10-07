import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  minimalMarkQuestion,
  prepareAiEgress,
  stripImageMetadata,
  stripJpegMetadata,
  stripPngMetadata,
} from "@/ai/egress";
import { AI_TASK_POLICY } from "@/ai/task-policy";
import { AI_TASKS, type AiTask } from "@/ai/types";

const PII = "My name is Priya Shah, email priya@example.com, I go to Grange High School, 12 Maple Road, CF10 1AA.";
const LEAKS = ["Priya", "priya@example.com", "Grange High School", "Maple Road", "CF10 1AA"];

function expectNoLeak(value: unknown) {
  const text = JSON.stringify(value);
  for (const leak of LEAKS) expect(text, `leaked ${leak}`).not.toContain(leak);
}

const question = {
  id: "q1",
  subjectId: "s",
  topicIds: ["t"],
  kind: "short",
  stem: "Explain osmosis.",
  totalMarks: 2,
  difficulty: 3,
  parts: [{ id: "p1", label: "(a)", prompt: "Explain osmosis.", marks: 2, markScheme: ["water moves", "partially permeable"], modelAnswer: "secret authored answer" }],
  humanVerification: { status: "approved", reviewerId: "reviewer-7" },
  reviewer: "Dr Reviewer",
};

/** One representative payload per task, each carrying learner PII where the task accepts text. */
const SAMPLES: Record<AiTask, unknown> = {
  explain: { topicId: "t", question: PII },
  socratic: { topicId: "t", history: [{ role: "user", content: PII }, { role: "assistant", content: "Tell me more." }] },
  tutor: {
    topicId: "t",
    history: [{ role: "user", content: PII }, { role: "assistant", content: "Tell me more." }],
    learner: { position: "Topic 2 of 5", masteryLine: "Improving", openMistakes: [{ point: PII, category: "recall", marksLost: 2 }] },
  },
  mark: { question, answers: { p1: PII } },
  "generate-cards": { topicId: "t", count: 3 },
  "generate-questions": { topicId: "t", count: 2, difficulty: 3 },
  summarise: { topicId: "t" },
  diagnose: { topicIds: ["t"], mistakes: [{ id: "m1", attemptId: "a1", category: "recall", description: PII, topicId: "t", answer: PII }] },
  "extract-questions": { subjectId: "s", text: `Candidate: ${PII}\nQ1 Explain osmosis [2]` },
  ocr: { image: "", mediaType: "image/png", hint: "handwriting" },
  "cards-from-notes": { text: PII, count: 4, topicId: "t" },
  "diagnose-error": { prompt: "Explain", point: "water moves", answer: PII, awarded: 0, maxMarks: 2 },
  "route-spec": { subjectId: "s", text: PII },
};

// A minimal valid 1x1 PNG with a tEXt chunk carrying an identifying comment.
function pngWithText(): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const chunk = (type: string, data: number[]) => {
    const len = data.length;
    return [(len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  };
  const ihdr = chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  const text = chunk("tEXt", [..."Author\0Priya Shah"].map((c) => c.charCodeAt(0)));
  const idat = chunk("IDAT", [0x78, 0x9c, 0x63, 0x60, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]);
  const iend = chunk("IEND", []);
  return Uint8Array.from([...sig, ...ihdr, ...text, ...idat, ...iend]);
}

// SOI, APP0 (JFIF), APP1 (Exif with a GPS marker), COM, SOS + data, EOI.
function jpegWithExif(): Uint8Array {
  const seg = (marker: number, payload: number[]) => [0xff, marker, ((payload.length + 2) >> 8) & 255, (payload.length + 2) & 255, ...payload];
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  return Uint8Array.from([
    0xff, 0xd8,
    ...seg(0xe0, ascii("JFIF\0")),
    ...seg(0xe1, ascii("Exif\0\0GPSLatitude51.48N")),
    ...seg(0xfe, ascii("taken by Priya")),
    ...seg(0xdb, [0, 1, 2, 3]),
    0xff, 0xda, 0, 2, 0x11, 0x22, 0x33,
    0xff, 0xd9,
  ]);
}

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const ascii = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("AI egress policy", () => {
  it("has an explicit treatment for every AI task", () => {
    for (const task of AI_TASKS) {
      const payload = task === "ocr" ? { image: toBase64(pngWithText()), mediaType: "image/png", hint: "auto" } : SAMPLES[task];
      const result = prepareAiEgress(task, payload);
      expect(result.ok, task).toBe(true);
    }
  });

  it.each(AI_TASKS.filter((task) => AI_TASK_POLICY[task].learnerContent === "masked-text"))(
    "%s never lets identifying learner text through",
    (task) => {
      const result = prepareAiEgress(task, SAMPLES[task]);
      expect(result.ok).toBe(true);
      if (result.ok) expectNoLeak(result.payload);
    },
  );

  it("reports what was withheld so the UI can disclose it", () => {
    const result = prepareAiEgress("mark", SAMPLES.mark);
    expect(result.ok && result.withheld).toMatch(/email/);
  });

  it("is idempotent: applying it again (as the server does) changes nothing", () => {
    for (const task of AI_TASKS) {
      if (task === "ocr") continue;
      const once = prepareAiEgress(task, SAMPLES[task]);
      expect(once.ok).toBe(true);
      if (!once.ok) continue;
      const twice = prepareAiEgress(task, once.payload);
      expect(twice.ok && twice.payload, task).toEqual(once.payload);
    }
  });

  it("minimises the question sent for marking", () => {
    const minimal = minimalMarkQuestion(question);
    const text = JSON.stringify(minimal);
    expect(text).not.toContain("secret authored answer");
    expect(text).not.toContain("reviewer-7");
    expect(text).not.toContain("Dr Reviewer");
    expect(minimal).toMatchObject({ id: "q1", stem: "Explain osmosis.", parts: [{ id: "p1", marks: 2, markScheme: ["water moves", "partially permeable"] }] });
  });

  it("reduces mistakes to category plus masked description", () => {
    const result = prepareAiEgress("diagnose", SAMPLES.diagnose);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const mistakes = (result.payload as { mistakes: Record<string, unknown>[] }).mistakes;
    expect(Object.keys(mistakes[0]!).sort()).toEqual(["category", "description", "resolved", "topicId"]);
    expectNoLeak(mistakes);
  });

  it("drops fields a task does not read", () => {
    const result = prepareAiEgress("summarise", { topicId: "t", answers: { p1: PII }, userId: "user-1" });
    expect(result.ok && result.payload).toEqual({ topicId: "t" });
  });
});

describe("AI egress — photographs", () => {
  it("strips EXIF/GPS and comments from a JPEG but keeps the image data", () => {
    const stripped = stripJpegMetadata(jpegWithExif());
    expect(stripped).not.toBeNull();
    const text = ascii(stripped!);
    expect(text).not.toContain("GPSLatitude");
    expect(text).not.toContain("Priya");
    expect(text).toContain("JFIF");
    expect(stripped![stripped!.length - 2]).toBe(0xff);
    expect(stripped![stripped!.length - 1]).toBe(0xd9);
    // Idempotent.
    expect(Buffer.from(stripJpegMetadata(stripped!)!)).toEqual(Buffer.from(stripped!));
  });

  it("strips text chunks from a PNG", () => {
    const stripped = stripPngMetadata(pngWithText());
    expect(stripped).not.toBeNull();
    expect(ascii(stripped!)).not.toContain("Priya");
    expect(ascii(stripped!)).toContain("IDAT");
    expect(ascii(stripped!)).toContain("IEND");
  });

  it("refuses formats it cannot strip, and malformed files, rather than sending them unchecked", () => {
    expect(stripImageMetadata(toBase64(jpegWithExif()), "image/heic")).toBeNull();
    expect(stripImageMetadata(toBase64(Uint8Array.from([1, 2, 3, 4])), "image/jpeg")).toBeNull();
    const refused = prepareAiEgress("ocr", { image: toBase64(jpegWithExif()), mediaType: "image/webp" });
    expect(refused.ok).toBe(false);
  });

  it("sends the stripped image for OCR", () => {
    const result = prepareAiEgress("ocr", { image: toBase64(jpegWithExif()), mediaType: "image/jpeg", hint: "handwriting" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const image = Buffer.from((result.payload as { image: string }).image, "base64").toString("latin1");
    expect(image).not.toContain("GPSLatitude");
  });
});

describe("AI egress — one transport for every request", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? sourceFiles(full) : /\.(ts|tsx)$/.test(entry) ? [full] : [];
    });
  }

  it("only src/ai/transport.ts POSTs to /api/ai", () => {
    const offenders = sourceFiles(join(process.cwd(), "src"))
      .filter((file) => !file.endsWith(join("src", "ai", "transport.ts")))
      .filter((file) => {
        const src = readFileSync(file, "utf8");
        // aiStatus() issues a plain GET for provider status; anything sending a body is egress.
        return /["'`]\/api\/ai["'`]\s*,\s*\{[\s\S]{0,200}method:\s*["']POST["']/.test(src);
      })
      .map((file) => relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });

  it("the live client and the dead-letter retry both use sendAiTask", () => {
    expect(readFileSync("src/ai/client.ts", "utf8")).toContain("await sendAiTask(task, payload)");
    const dlq = readFileSync("src/ai/mark-dlq.ts", "utf8");
    expect(dlq).toContain('sendAiTask("mark", { question: item.question, answers: item.answers }, fetchFn)');
    expect(dlq).not.toContain('fetchFn("/api/ai"');
  });

  it("the server re-applies the same policy before dispatch", () => {
    const route = readFileSync("src/app/api/ai/route.ts", "utf8");
    expect(route).toContain('import { prepareAiEgress } from "@/ai/egress";');
    expect(route).toContain("dispatch(task, egress.payload)");
  });

  it("OCR callers re-encode photos before they are sent", () => {
    for (const file of ["src/components/AnswerInput.tsx", "src/app/papers/page.tsx"]) {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("imageForAi(file)");
      expect(src).not.toMatch(/aiOcr\(base64/);
    }
  });
});
