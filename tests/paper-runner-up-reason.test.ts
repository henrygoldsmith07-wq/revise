import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// The papers list shows a "held back mainly by …" line under every non-
// recommended paper, sourced from the candidate's weakest factor — so
// skipping the top pick is an informed choice rather than a shrug.
describe("runner-up weakest-factor line", () => {
  const page = () => src("src/app/papers/page.tsx");

  it("renders the weakest-factor line for non-recommended candidates only", () => {
    const source = page();
    expect(source).toContain("!recommended && candidate?.weakestFactor");
    expect(source).toContain("Held back mainly by {candidate.weakestFactor.label.toLowerCase()}");
    expect(source).toContain("{candidate.weakestFactor.detail}");
  });

  it("keeps the weakest-factor line out of the recommended branch", () => {
    const source = page();
    const recBranch = source.slice(source.indexOf("recommended && candidate ?"), source.indexOf("!recommended && candidate?.weakestFactor"));
    expect(recBranch).toContain("candidate.reason");
    expect(recBranch).not.toContain("weakestFactor");
  });

  it("the domain result carries a weakest factor per candidate", () => {
    const domain = src("src/domain/exam-paper-selection.ts");
    expect(domain).toContain("weakestFactor: WeakestFactor | null");
    expect(domain).toContain("interface WeakestFactor");
    // Weighted shortfall, not raw score — a 0 gain costs more than a 0 recency.
    expect(domain).toContain("PAPER_SELECT_WEIGHTS.gain * (1 - gainScore)");
  });

  it("the section hint tells the reader the others explain themselves", () => {
    expect(page()).toContain("the others show what is costing them most");
  });
});

describe("runner-up fix deep-link", () => {
  const page = () => src("src/app/papers/page.tsx");

  it("renders the fix link with kind-specific wording inside the weakest-factor line", () => {
    const source = page();
    expect(source).toContain("candidate.weakestFactor.fix");
    expect(source).toContain("Review ${candidate.weakestFactor.fix.topicTitle ?? \"it\"}");
    expect(source).toContain("Timed run on ${candidate.weakestFactor.fix.topicTitle ?? \"it\"}");
    expect(source).toContain("href={candidate.weakestFactor.fix.href}");
  });

  it("labels the link accessibly for screen readers", () => {
    expect(page()).toContain("aria-label={");
  });

  it("the domain type carries the fix on the weakest factor", () => {
    const domain = src("src/domain/exam-paper-selection.ts");
    expect(domain).toContain("fix?: WeakestFactorFix | null");
    expect(domain).toContain('kind: "review" | "timed"');
  });
});
