import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allQualifications, allSubjects, availableBoards, gradesFor } from "@/domain/curriculum";

const src = (p: string) => resolve(process.cwd(), p);

// ---------------------------------------------------------------------------
// First screen: pick board + subject + optional exam date. Everything else waits.
//
// The app hard-gates on onboarding (AppShell renders only Onboarding until
// repo.markOnboarded), so the funnel IS the product for a new student. It
// must offer only boards with real content, collect subjects on one board,
// allow a known exam date or a clear date-later path, default the rest (time
// budget, target grade) and never offer a global Skip that leaves a hollow
// profile.
// ---------------------------------------------------------------------------

describe("availableBoards: only boards with content are offered", () => {
  it("excludes boards registered without subject modules (Eduqas) and keeps AQA/Edexcel/OCR/WJEC", () => {
    const ids = availableBoards().map((b) => b.id);
    expect(ids).toContain("aqa");
    expect(ids).toContain("edexcel");
    expect(ids).toContain("ocr");
    expect(ids).toContain("wjec");
    expect(ids).not.toContain("eduqas");
  });

  it("every offered board has at least one subject a student can enrol on", () => {
    for (const board of availableBoards()) {
      const quals = allQualifications(board.id);
      const subjectCount = quals.reduce((n, q) => n + allSubjects(q.id).length, 0);
      expect(subjectCount, board.id + " offers no subjects").toBeGreaterThan(0);
    }
  });

  it("each offered subject exposes a sensible default target grade from its qualification", () => {
    for (const board of availableBoards()) {
      for (const q of allQualifications(board.id)) {
        for (const s of allSubjects(q.id)) {
          expect(gradesFor(s.id).length, s.id + " has no grades").toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("first screen collects exactly board → subjects → exam dates", () => {
  const srcText = readFileSync(src("src/components/Onboarding.tsx"), "utf8");

  it("starts with the exam board, then subjects of that board", () => {
    expect(srcText).toContain("Which exam board are you studying with?");
    expect(srcText).toContain("Which subjects do you take with {board.name}?");
    expect(srcText).toContain("availableBoards()");
    // Board change resets the subject/date choices from the old board.
    expect(srcText).toContain("setBoardId(id)");
    expect(srcText).toContain("setSubjectIds([])");
    expect(srcText).toContain("setExamDates({})");
  });

  it("accepts future dates and lets students skip dates they do not know yet", () => {
    expect(srcText).toContain("When are the exams?");
    expect(srcText).toContain("(optional)");
    expect(srcText).not.toContain("required");
    expect(srcText).toContain('aria-label={`${subject.name} exam date`}');
    expect(srcText).toContain("missingDates");
    expect(srcText).toContain("invalidDates");
    expect(srcText).toContain("datesValid");
    expect(srcText).toContain("canSkipExamDates");
    expect(srcText).toContain("I don&apos;t know the dates yet");
    expect(srcText).toContain("add dates later in Settings");
    expect(srcText).toContain("if (!date) continue");
  });

  it("defaults time budget and target grade instead of asking; keeps only three steps", () => {
    expect(srcText).toContain("STEADY_MINUTES");
    expect(srcText).toContain("gradesFor(id)[0]");
    // The old wizard's extra asks are gone.
    expect(srcText).not.toContain("What should we call you?");
    expect(srcText).not.toContain("How much time do you have?");
    expect(srcText).not.toContain("TIME_PRESETS");
    expect(srcText).toContain('PHASES = ["Board", "Subjects", "Exam dates"]');
  });

  it("does not offer a global Skip that leaves a hollow profile", () => {
    expect(srcText).not.toContain("Skip — I will set this up later");
    expect(srcText).not.toContain('aria-label="Skip onboarding"');
  });
});

describe("everything else waits until onboarding completes", () => {
  it("AppShell renders only Onboarding while needsOnboarding, and gate derives from the repo flag", () => {
    const shell = readFileSync(src("src/components/AppShell.tsx"), "utf8");
    expect(shell).toContain("if (needsOnboarding) {");
    expect(shell).toContain("<Onboarding onDone=");
    const store = readFileSync(src("src/state/store.tsx"), "utf8");
    expect(store).toContain("repo.hasOnboarded(");
    expect(store).toContain("repo.markOnboarded(");
  });
});
