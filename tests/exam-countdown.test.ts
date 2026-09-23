import { describe, expect, it } from "vitest";
import { countdownGuidance, FINAL_DAYS, TECHNIQUE_DAYS, APPLICATION_DAYS } from "../src/domain/exam-countdown";

describe("exam countdown phases", () => {
  it("names the phases at the exact day boundaries", () => {
    expect(countdownGuidance(null).phase).toBe("foundation");
    expect(countdownGuidance(APPLICATION_DAYS + 1).phase).toBe("foundation");
    expect(countdownGuidance(APPLICATION_DAYS).phase).toBe("application");
    expect(countdownGuidance(TECHNIQUE_DAYS + 1).phase).toBe("application");
    expect(countdownGuidance(TECHNIQUE_DAYS).phase).toBe("technique");
    expect(countdownGuidance(FINAL_DAYS + 1).phase).toBe("technique");
    expect(countdownGuidance(FINAL_DAYS).phase).toBe("final");
    expect(countdownGuidance(0).phase).toBe("final");
  });

  it("keeps papers off until the technique fortnight", () => {
    expect(countdownGuidance(null).paperCadence).toBe(0);
    expect(countdownGuidance(60).paperCadence).toBe(0);
    expect(countdownGuidance(20).paperCadence).toBe(0);
    expect(countdownGuidance(TECHNIQUE_DAYS).paperCadence).toBeGreaterThan(0);
  });

  it("intensifies papers inside the final week and stops them in the last 72 hours", () => {
    expect(countdownGuidance(10).paperCadence).toBe(3);
    expect(countdownGuidance(7).paperCadence).toBe(2);
    expect(countdownGuidance(4).paperCadence).toBe(2);
    expect(countdownGuidance(3).paperCadence).toBe(0);
  });

  it("allows first passes until the final days, then forbids them", () => {
    expect(countdownGuidance(null).allowFirstPass).toBe(true);
    expect(countdownGuidance(30).allowFirstPass).toBe(true);
    expect(countdownGuidance(10).allowFirstPass).toBe(true);
    expect(countdownGuidance(FINAL_DAYS).allowFirstPass).toBe(false);
    expect(countdownGuidance(0).allowFirstPass).toBe(false);
  });

  it("gives every phase a plain strategy sentence", () => {
    for (const days of [null, 60, 20, 8, 2]) {
      const g = countdownGuidance(days);
      expect(g.label.length).toBeGreaterThan(2);
      expect(g.strategy.length).toBeGreaterThan(40);
      expect(g.strategy.endsWith(".")).toBe(true);
    }
  });
});
