import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shouldOfferStartingDiagnostic } from "@/domain/starting-diagnostic-offer";

describe("starting diagnostic offer", () => {
  it("offers it only before any answer", () => {
    expect(shouldOfferStartingDiagnostic(0)).toBe(true);
    expect(shouldOfferStartingDiagnostic(1)).toBe(false);
  });
  it("readiness page gates both diagnostic links", () => {
    const src = readFileSync("src/app/readiness/page.tsx", "utf8");
    expect(src.match(/offerDiagnostic \? /g)?.length).toBe(2);
  });
});
