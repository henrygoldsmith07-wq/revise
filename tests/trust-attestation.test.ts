import { describe, expect, it } from "vitest";
import { validAttestationInstant, validOfficialWjecUrl, validSha256Digest } from "@/domain/trust-attestation";

describe("human attestation primitives", () => {
  it("requires a full timezone-bearing instant and rejects materially future times", () => {
    const now = Date.parse("2026-09-27T08:00:00Z");
    expect(validAttestationInstant("2026-09-26T12:00:00Z", now)).toBe(true);
    expect(validAttestationInstant("2026-09-26T13:00:00+01:00", now)).toBe(true);
    expect(validAttestationInstant("2026-09-26", now)).toBe(false);
    expect(validAttestationInstant("2026", now)).toBe(false);
    expect(validAttestationInstant("2026-02-31T12:00:00Z", now)).toBe(false);
    expect(validAttestationInstant("2026-09-26T25:00:00Z", now)).toBe(false);
    expect(validAttestationInstant("2099-01-01T00:00:00Z", now)).toBe(false);
  });

  it("accepts only official HTTPS WJEC origins", () => {
    expect(validOfficialWjecUrl("https://www.wjec.co.uk/paper.pdf")).toBe(true);
    expect(validOfficialWjecUrl("https://pastpapers.download.wjec.co.uk/paper.pdf")).toBe(true);
    expect(validOfficialWjecUrl("http://www.wjec.co.uk/paper.pdf")).toBe(false);
    expect(validOfficialWjecUrl("https://www.wjec.co.uk:444/paper.pdf")).toBe(false);
    expect(validOfficialWjecUrl("https://wjec.co.uk.evil.example/paper.pdf")).toBe(false);
    expect(validOfficialWjecUrl("https://example.com/paper.pdf")).toBe(false);
  });

  it("requires a real SHA-256 digest shape", () => {
    expect(validSha256Digest("a".repeat(64))).toBe(true);
    expect(validSha256Digest(`sha256:${"B".repeat(64)}`)).toBe(true);
    expect(validSha256Digest("sha256:test-only")).toBe(false);
    expect(validSha256Digest("a".repeat(63))).toBe(false);
  });
});
