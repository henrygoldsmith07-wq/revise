import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("diagnostic result heading", () => {
  const src = readFileSync("src/app/diagnostic/page.tsx", "utf8");
  it("does not keep the 'Starting diagnostic' heading once a result is shown", () => {
    expect(src).toContain('finished && records.length ? "Your diagnostic result" : "Starting diagnostic"');
  });
});
