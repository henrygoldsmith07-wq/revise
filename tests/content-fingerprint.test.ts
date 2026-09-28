import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Hex } from "@/domain/content-fingerprint";
import { seedQuestions } from "@/content";
import { physicsContentFingerprint } from "@/domain/physics-content-review";

describe("review content fingerprints", () => {
  it("matches standard SHA-256 vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("canonicalises object key order without changing array order", () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 4 }, b: 2 }));
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("uses a versioned 256-bit digest and is unique across the live bank", () => {
    const fingerprints = seedQuestions.map(physicsContentFingerprint);
    expect(fingerprints.every((value) => /^wjec-review-v3:sha256:[a-f0-9]{64}$/.test(value))).toBe(true);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });
});
