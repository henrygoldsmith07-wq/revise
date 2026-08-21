import { describe, expect, it } from "vitest";
import { commandWordForPart, validateCommandWord } from "@/domain/command-word-validation";
import type { Question, QuestionPart } from "@/domain/types";

const question = (stem = "A student investigates a reaction."): Pick<Question, "stem"> => ({ stem });
const part = (prompt: string): Pick<QuestionPart, "prompt"> => ({ prompt });

describe("command-word validation", () => {
  it("prefers the part instruction and falls back to a shared stem", () => {
    expect(commandWordForPart(question("Explain the result."), part("Calculate the concentration."))).toBe("calculate");
    expect(commandWordForPart(question("Explain the result."), part("Use the data."))).toBe("explain");
  });

  it("checks that an explanation makes the reason explicit", () => {
    expect(validateCommandWord(question(), part("Explain why the rate changes."), "The concentration falls.").status).toBe("needs-attention");
    const checked = validateCommandWord(question(), part("Explain why the rate changes."), "The concentration falls because fewer particles collide.");
    expect(checked.status).toBe("aligned");
    expect(checked.evidence).toContain("reason link");
  });

  it("checks calculations and balanced evaluation without blocking marking", () => {
    expect(validateCommandWord(question(), part("Calculate the rate."), "The rate increases.").status).toBe("needs-attention");
    expect(validateCommandWord(question(), part("Calculate the rate."), "rate = 2.4 mol dm-3 s-1").status).toBe("aligned");
    expect(validateCommandWord(question(), part("Evaluate the method."), "It is useful, however the limitation reduces reliability overall.").status).toBe("aligned");
  });

  it("does not invent a validation rule for an unrecognised instruction", () => {
    const result = validateCommandWord(question(), part("What happens next?"), "The rate decreases.");
    expect(result.status).toBe("not-applicable");
    expect(result.evidence).toHaveLength(0);
  });

  it("asks for a response before claiming the command word is covered", () => {
    const result = validateCommandWord(question(), part("Compare the two results."), "");
    expect(result.status).toBe("empty");
    expect(result.message).toContain("both things");
  });
});
