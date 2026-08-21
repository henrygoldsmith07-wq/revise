import { describe, expect, it } from "vitest";
import { pulseHistoryAllowed, pulseEnabledValue } from "@/data/pulse-consent";

describe("Revise Pulse consent", () => {
  it("is off when the user has no settings row at all", () => {
    expect(pulseHistoryAllowed(null)).toBe(false);
    expect(pulseHistoryAllowed(undefined)).toBe(false);
  });

  it("accepts only the explicit on-value", () => {
    expect(pulseEnabledValue({ pulseEnabled: true })).toBe(true);
    expect(pulseEnabledValue({ pulseEnabled: false })).toBe(false);
    expect(pulseEnabledValue({ pulseEnabled: "1" })).toBe(false);
    expect(pulseEnabledValue({})).toBe(false);
  });

  it("withholds the history until the user opts in", () => {
    expect(pulseHistoryAllowed({ pulseEnabled: false })).toBe(false);
    expect(pulseHistoryAllowed({})).toBe(false);
    expect(pulseHistoryAllowed({ pulseEnabled: true })).toBe(true);
  });

  it("never trusts a truthy-looking but non-boolean value", () => {
    expect(pulseHistoryAllowed({ pulseEnabled: 1 })).toBe(false);
    expect(pulseHistoryAllowed({ pulseEnabled: "true" })).toBe(false);
  });
});
