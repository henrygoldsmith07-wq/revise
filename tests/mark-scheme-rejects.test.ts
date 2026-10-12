import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { markQuestion, withMarkEvidence } from "@/domain/marking";
import { assessMarkConfidence } from "@/domain/marking-confidence";
import { rejectedStatement, rejectExplanation, ruleHit } from "@/domain/marking-reject";
import { doNotAcceptLines } from "@/domain/marking-reject";
import { minimalMarkQuestion } from "@/ai/egress";
import { schemeHashForPart } from "@/ai/semantic-cache";
import { contentQuestionPartSchema } from "@/content/schema";
import type { MarkSchemeReject, Question } from "@/domain/types";
import type { MarkedPart } from "@/domain/types-marking";

// ---------------------------------------------------------------------------
// Authored "do not accept" rules (twelfth pass, 2026-10-12). A rule only ever
// removes credit; these tests hold it to three promises:
//  1. no authored model answer in the bank trips a rule on its own part;
//  2. correct answers written for this test (not the ones the rules were
//     authored against) never lose a mark to a rule;
//  3. wrong answers written for this test, worded differently from the
//     regression set, are no longer over-credited.
// Examiner marks below are hand-judged against each scheme, not moderated.
// ---------------------------------------------------------------------------

const P = "cnt:question:recall-probe-";
const byId = new Map(seedQuestions.map((q) => [q.id, q]));

function probe(slug: string): Question {
  const q = byId.get(P + slug);
  if (!q) throw new Error(`missing probe ${slug}`);
  return q;
}

function marks(q: Question, answer: string, withRules = true): number {
  const part = q.parts[0]!;
  const target = withRules ? q : { ...q, parts: [{ ...part, rejects: undefined }] };
  return markQuestion(target, { [part.id]: answer }).awarded;
}

const right: Array<[string, string]> = [
  ["bio-semi-conservative-recall", "Every daughter molecule has one parental strand which is conserved and one new strand, not two new strands."],
  ["bio-semi-conservative-recall", "Half of each new double helix is the old strand and the other half is newly synthesised."],
  ["bio-alveoli-diffusion-recall", "By diffusion, rather than osmosis. The walls are one cell thick so the diffusion distance is short."],
  ["bio-alveoli-diffusion-recall", "Diffusion; there is a huge surface area and the epithelium is thin, not thick."],
  ["chem-dative-recall", "A covalent bond where both shared electrons come from one atom, not one electron from each atom. In NH₄⁺ it is the N lone pair."],
  ["math-contradiction-proof-recall", "Assume √2 is rational, so it can be written as a/b with a, b integers, b ≠ 0, and no common factors."],
  ["math-newton-raphson-recall", "xₙ₊₁ = xₙ − f(xₙ)/f'(xₙ), and it fails if f'(xₙ) = 0 because you divide by zero."],
  ["math-poisson-conditions-recall", "Events happen one at a time, independently of each other, at a constant mean rate. Mean = variance = λ."],
  ["math-error-types-recall", "Type I: rejecting H₀ when it is actually true. Type II: failing to reject H₀ when it is false."],
  ["math-error-types-recall", "A Type 1 error means rejecting H₀ when H₀ is true, and a Type 2 error means accepting H₀ when H₀ is false."],
  ["math-error-types-recall", "A Type II error is not rejecting H₀ when H₀ is false; a Type I error is rejecting H₀ when H₀ is true."],
  ["bio-growth-curve-recall", "Lag, then log (exponential), then stationary, then death. Growth is fastest in the log phase."],
  ["bio-double-fertilisation-recall", "One male nucleus fertilises the egg cell giving a diploid zygote; the other fuses with the two polar nuclei to make the triploid endosperm nucleus."],
  ["bio-sliding-filament-recall", "The A band stays the same length while the I band and H zone shorten, so the sarcomere shortens."],
  ["bio-variables-recall", "The independent variable is what the investigator changes, the temperature. A control variable is kept constant so it does not affect the dependent variable, which is measured."],
  ["chem-transition-definition-recall", "A d-block element that forms at least one stable ion with a partially filled d sub-shell. Zinc is not one, because Zn²⁺ has a full 3d sub-shell (3d¹⁰)."],
  ["chem-isomer-definitions-recall", "Structural isomers have the same molecular formula but different structural formulae. Stereoisomers have the same structural formula but a different spatial arrangement of atoms."],
  ["chem-zwitterion-recall", "An ion with both a positive and a negative charge but no overall charge, H₃N⁺CH₂COO⁻."],
  ["chem-percentage-uncertainty-recall", "Percentage uncertainty = (uncertainty ÷ measured value) × 100. Each reading is ±0.05 cm³ so the titre is ±0.10 cm³."],
  ["chem-electrode-potential-recall", "The potential of a half-cell measured against the standard hydrogen electrode under standard conditions: 298 K, 1 mol dm⁻³ H⁺(aq), 100 kPa hydrogen and a platinum electrode."],
];
const wrong: Array<[string, string, number]> = [
  ["bio-semi-conservative-recall", "Both strands of each new molecule are new; the parent DNA remains intact.", 0],
  ["bio-alveoli-diffusion-recall", "Active transport, using the large surface area.", 0],
  ["chem-dative-recall", "Each atom contributes one electron to the shared pair. Nitrogen.", 1],
  ["math-error-types-recall", "Type 1 error: accepting H₀ when H₀ is false. Type 2 error: rejecting H₀ when H₀ is true.", 0],
  ["math-poisson-conditions-recall", "Events happen in clusters at a varying rate. Mean = variance = λ.", 1],
  ["bio-growth-curve-recall", "Log, lag, stationary, death. Growth is fastest in the lag phase.", 0],
  ["bio-double-fertilisation-recall", "One male nucleus fuses with a synergid and the other with the antipodal cells.", 0],
  ["bio-sliding-filament-recall", "The A band gets shorter and the sarcomere lengthens.", 0],
  ["bio-variables-recall", "The independent variable is kept constant. Control variables are varied.", 0],
  ["chem-transition-definition-recall", "All metals in the d block are transition elements. Zinc is one because zinc has an incomplete d sub-shell.", 0],
  ["chem-zwitterion-recall", "A molecule that is negatively charged overall, H₃N⁺CH₂COO⁻.", 1],
  ["chem-electrode-potential-recall", "The emf of a battery measured at room temperature.", 0],
];

const rule = (over: Partial<MarkSchemeReject>): MarkSchemeReject => ({ point: 0, phrases: ["osmosis"], reason: "Gas exchange is diffusion.", ...over });

describe("ruleHit", () => {
  it("finds a phrase, its longer forms and a bounded gap", () => {
    expect(ruleHit(rule({}), "By osmosis.")?.contrastOnly).toBe(false);
    expect(ruleHit(rule({ phrases: ["accept"] }), "accepting H0")?.said).toBe("accepting");
    expect(ruleHit(rule({ phrases: ["type i … accepting"] }), "A Type I error is accepting H₀")).not.toBeNull();
    expect(ruleHit(rule({ phrases: ["type i … accepting"] }), "A Type II error is accepting H₀")).toBeNull();
    expect(ruleHit(rule({ phrases: ["independent … measured"] }), "the independent variable is the one that you change so that the effect can be measured")).toBeNull();
  });

  it("treats a negated phrase as a contrast that never vetoes", () => {
    expect(ruleHit(rule({}), "Diffusion, not osmosis.")?.contrastOnly).toBe(true);
    expect(ruleHit(rule({}), "Diffusion rather than osmosis.")?.contrastOnly).toBe(true);
    expect(ruleHit(rule({ phrases: ["type ii … rejecting"] }), "A Type II error is not rejecting H₀ when it is false")?.contrastOnly).toBe(true);
    expect(ruleHit(rule({ phrases: ["type ii … rejecting"] }), "A Type II error is failing to go on rejecting H₀")?.contrastOnly).toBe(true);
    // "fails when" states a claim; only "fail to" negates.
    expect(ruleHit(rule({ phrases: ["when f(x) = 0"] }), "It fails when f(x) = 0")?.contrastOnly).toBe(false);
  });

  it("keeps the derivative apart from the function, however the prime is typed", () => {
    const r = rule({ phrases: ["when f(x) = 0"] });
    expect(ruleHit(r, "fails when f′(x) = 0")).toBeNull();
    expect(ruleHit(r, "fails when f'(x) = 0")).toBeNull();
  });

  it("stays inside one clause unless the rule asks for the whole answer", () => {
    expect(ruleHit(rule({ phrases: ["death … lag"] }), "Death, lag")).toBeNull();
    expect(ruleHit(rule({ phrases: ["death … lag"], scope: "answer" }), "Death, lag")).not.toBeNull();
  });

  it("an except phrase anywhere in the answer cancels the rule", () => {
    const r = rule({ phrases: ["0.05"], except: ["0.10"] });
    expect(ruleHit(r, "±0.05 cm³")).not.toBeNull();
    expect(ruleHit(r, "Each reading ±0.05 cm³, so the titre is ±0.10 cm³")).toBeNull();
  });

  it("quotes the learner's own words back", () => {
    const hit = rejectedStatement({ rejects: [rule({ phrases: ["variance … λ2"] })] }, 0, "The variance is λ².")!;
    expect(hit.said).toBe("variance is λ²");
    expect(rejectExplanation(hit)).toContain("does not accept “variance is λ²”");
  });
});

describe("authored reject rules in the bank", () => {
  const withRules = seedQuestions.flatMap((q) => q.parts.filter((p) => p.rejects?.length).map((p) => ({ q, p })));

  it("are present on the recall probes they were written for", () => {
    expect(withRules.length).toBeGreaterThanOrEqual(16);
  });

  it("every rule points at a real scheme point and gives a reason", () => {
    for (const { p } of withRules) for (const r of p.rejects!) {
      expect(r.point, p.id).toBeGreaterThanOrEqual(0);
      expect(r.point, p.id).toBeLessThan(p.markScheme.length);
      expect(r.reason.trim().length, p.id).toBeGreaterThan(10);
    }
  });

  it("the content schema accepts the bank's rules and refuses a rule for a point that does not exist", () => {
    for (const { p } of withRules) expect(contentQuestionPartSchema.safeParse(p).success, p.id).toBe(true);
    const { p } = withRules[0]!;
    expect(contentQuestionPartSchema.safeParse({ ...p, rejects: [{ point: p.markScheme.length, phrases: ["x"], reason: "y" }] }).success).toBe(false);
  });

  it("no authored model answer trips a rule on its own part", () => {
    const tripped = withRules.flatMap(({ p }) => p.markScheme
      .map((_, i) => rejectedStatement(p, i, p.modelAnswer))
      .filter((hit) => hit && !hit.contrastOnly)
      .map((hit) => `${p.id}: “${hit!.said}”`));
    expect(tripped).toEqual([]);
  });

  it("held-out correct answers never lose a mark to a rule", () => {
    const lost = right.filter(([slug, a]) => marks(probe(slug), a) < marks(probe(slug), a, false)).map(([slug, a]) => `${slug}: ${a}`);
    expect(lost).toEqual([]);
  });

  it("held-out wrong answers are no longer over-credited", () => {
    const before = wrong.filter(([slug, a, ex]) => marks(probe(slug), a, false) > ex).length;
    const over = wrong.filter(([slug, a, ex]) => marks(probe(slug), a) > ex).map(([slug, a]) => `${slug}: ${a}`);
    // Measured 2026-10-12: 7 of these 12 were over-credited without the rules.
    expect(before).toBeGreaterThanOrEqual(7);
    expect(over).toEqual([]);
  });

  it("held-out wrong answers are never under-credited", () => {
    expect(wrong.filter(([slug, a, ex]) => marks(probe(slug), a) < ex).map(([slug, a]) => `${slug}: ${a}`)).toEqual([]);
  });
});

describe("feedback and the AI path", () => {
  const q = probe("math-error-types-recall");
  const part = q.parts[0]!;
  const swapped = "A Type I error is accepting H₀ when H₀ is false. A Type II error is rejecting H₀ when H₀ is true.";

  it("the offline mark says which statement the scheme does not accept, and why", () => {
    const marked = markQuestion(q, { [part.id]: swapped }).marked[0]!;
    expect(marked.awarded).toBe(0);
    const ev = marked.evidence!.find((e) => e.point === part.markScheme[0])!;
    expect(ev.status).toBe("missed");
    expect(ev.explanation).toMatch(/does not accept “Type I error is accepting”/);
    expect(ev.explanation).toContain("A Type I error is rejecting H₀ when H₀ is true");
  });

  it("an AI mark that credits a rejected statement is contested and provisional", () => {
    const answers = { [part.id]: swapped };
    const aiMark = withMarkEvidence(q, answers, { marked: [{ partId: part.id, awarded: 2, max: 2, creditedPoints: [...part.markScheme], missedPoints: [], comment: "" } as MarkedPart], confidence: 0.95 });
    expect(aiMark.marked[0]!.evidence!.every((e) => e.contested)).toBe(true);
    const assessment = assessMarkConfidence({ question: q, answers, mark: aiMark, tier: "ai", rubric: markQuestion(q, answers).marked });
    expect(assessment.provisional).toBe(true);
  });

  it("the marking prompt carries the rules as scheme notes, and egress keeps them bounded", () => {
    expect(doNotAcceptLines(part.rejects, 0)).toMatch(/Do not accept: .*"type i error is accept"/);
    expect(doNotAcceptLines(part.rejects, 5)).toBe("");
    expect(doNotAcceptLines(undefined, 0)).toBe("");
    const minimal = minimalMarkQuestion(q) as { parts: Array<{ rejects?: MarkSchemeReject[] }> };
    expect(minimal.parts[0]!.rejects!.length).toBe(part.rejects!.length);
    expect(Object.keys(minimal.parts[0]!.rejects![0]!).sort()).toEqual(["phrases", "point", "reason"]);
    const plain = minimalMarkQuestion(probe("bio-insulin-recall")) as { parts: Array<Record<string, unknown>> };
    expect("rejects" in plain.parts[0]!).toBe(false);
    const flood = minimalMarkQuestion({ id: "x", parts: [{ id: "p", markScheme: ["a"], rejects: Array.from({ length: 50 }, () => ({ point: 0, phrases: ["x".repeat(500)], reason: "r" })) }] }) as { parts: Array<{ rejects: MarkSchemeReject[] }> };
    expect(flood.parts[0]!.rejects.length).toBe(12);
    expect(flood.parts[0]!.rejects[0]!.phrases[0]!.length).toBe(120);
  });

  it("a part without rules keeps its cache fingerprint; a part with rules gets a new one", () => {
    const plain = probe("bio-insulin-recall").parts[0]!;
    expect(schemeHashForPart(plain)).toBe(schemeHashForPart({ id: plain.id, marks: plain.marks, markScheme: plain.markScheme }));
    expect(schemeHashForPart(part)).not.toBe(schemeHashForPart({ id: part.id, marks: part.marks, markScheme: part.markScheme }));
  });
});
