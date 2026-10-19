import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("centripetal force question asks for what it marks", () => {
  for (const f of ["physics-extra", "physics-aqa-extra"]) {
    it(`${f}: a mark for 'towards centre' needs the prompt to ask for direction`, () => {
      const src = readFileSync(`src/content/questions/${f}.ts`, "utf8");
      expect(src).not.toContain('prompt: "Calculate the required centripetal force.",');
      expect(src).toContain("Calculate the required centripetal force and state its direction.");
    });
  }
});
