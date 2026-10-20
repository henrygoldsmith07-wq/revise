import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("diagnostic result heading", () => {
  const src = readFileSync("src/app/diagnostic/page.tsx", "utf8");
  it("does not keep the pre-result heading once a result is shown", () => {
    expect(src).toContain('finished && records.length ? "Your diagnostic result" : quick ? "Quick check" : "Full diagnostic"');
    expect(src).not.toContain("Starting diagnostic");
  });
});
