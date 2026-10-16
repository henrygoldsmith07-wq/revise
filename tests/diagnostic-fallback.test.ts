import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// While the flagships have no teacher-reviewed questions, the full diagnostic
// cannot run. That state must offer a way forward (the labelled practice-tier
// quick check, or practice), and the page must not promise "evidence" for
// answers on unreviewed questions.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const page = read("src/app/diagnostic/page.tsx");
const quick = read("src/components/QuickDiagnostic.tsx");

describe("diagnostic with no reviewed questions", () => {
  it("offers the labelled quick check and practice instead of a dead end", () => {
    expect(page).toContain("will not run the full diagnostic on unverified content");
    expect(page).toContain("onClick={() => setQuick(true)}>Take the quick check instead</Button>");
    expect(page).toContain("href={`/practice?subject=${encodeURIComponent(active)}`}");
    expect(quick).toContain("href={`/practice?subject=${encodeURIComponent(subjectId)}`}");
  });

  it("only calls answers evidence when the questions are reviewed", () => {
    expect(page).not.toContain("No hints are offered, so your answers count as unaided evidence.");
    expect(page).toContain("Answers on teacher-reviewed questions count as unaided evidence; anything else is labelled practice, not proof.");
  });
});
