import { describe, expect, it } from "vitest";
import { SPEC_MANIFEST } from "@/domain/spec";
import { wjecPhysics } from "@/domain/curriculum/wjec-physics";

describe("WJEC A level Physics spec code", () => {
  it("uses the published code 1420QS, not A200QS", () => {
    const entry = SPEC_MANIFEST.find((s) => s.subjectId === "wjec-alevel-physics");
    expect(entry?.specCode).toBe("1420QS");
    expect(wjecPhysics.subject.specCode).toBe("1420QS");
    expect(entry?.url).toBe("https://www.wjec.co.uk/qualifications/physics-asa-level/");
  });
});
