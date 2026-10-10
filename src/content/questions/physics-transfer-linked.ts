import type { Question, QuestionPart, SetupFingerprint } from "@/domain/types";
import { fingerprintSetup, reasoningGraphForPart } from "@/domain/reasoning-graph";
import { defineQuestion } from "./authoring";
import { physicsDepth50CircuitsFieldsQuestions } from "./physics-depth-50-circuits-fields";
import { physicsReasoningDepthQuestions } from "./physics-reasoning-depth";

// ---------------------------------------------------------------------------
// WJEC A-level Physics transfer items with an explicit, real baseline.
//
// Physics has 234 parts labelled "transfer" with no baseline link, so none of
// them can be approved as transfer (review gate
// `transfer-label-without-transfer`) and no statement meets the core bar.
// These are new, separately authored transfer items for two of the three
// statements `npm run wjec:authoring:plan -- physics` ranks first
// (alternating currents sp-01 and sp-03). A drafted sp-02 item (series RC
// crossover) was withheld: the repo's structural-novelty comparison, which
// is not yet applied to Physics, rated it too close to its baseline, and an
// item that would fail the stricter check should not count here. Each one:
//   - links to an EXISTING application/calculation part of the same
//     capability and statement (looked up below; the module throws if the
//     baseline ever disappears, so a link can never point at nothing);
//   - changes what is known and what is unknown (an inverse problem in an
//     unfamiliar setting), so the setup fingerprint differs from its baseline;
//   - has a worked answer and a point-per-mark scheme with checked numbers.
//
// Provenance is honest: `source: "generated"` (authored by an AI agent, so the
// gate warns the reviewer to confirm correctness and realism) and
// `verification: "unverified"`. Nothing here is approved; two independent
// teacher approvals are still required before any of it counts as proof.
// ---------------------------------------------------------------------------

const S = "wjec-alevel-physics";

function baselinePart(questions: readonly Question[], questionId: string): QuestionPart {
  const question = questions.find((q) => q.id === questionId);
  const part = question?.parts[0];
  if (!question || !part) throw new Error(`Physics transfer baseline ${questionId} does not exist.`);
  return part;
}

interface LinkedTransfer {
  slug: string;
  topic: string;
  point: string;
  baseline: QuestionPart;
  family: string;
  context: string;
  move: string;
  prompt: string;
  scheme: string[];
  answer: string;
}

function linkedTransferQuestion(spec: LinkedTransfer): Question {
  const specPoint = `${S}.${spec.topic}.${spec.point}`;
  const capability = `phys.${spec.topic}.${spec.point}`;
  if (spec.baseline.capabilityIds?.length !== 1 || spec.baseline.capabilityIds[0] !== capability ||
    spec.baseline.specPointIds?.[0] !== specPoint ||
    (spec.baseline.learning?.demand !== "application" && spec.baseline.learning?.demand !== "calculation")) {
    throw new Error(`Physics transfer ${spec.slug}: baseline ${spec.baseline.id} is not an application/calculation part of ${capability}.`);
  }
  const draft: QuestionPart = {
    id: "draft", label: "", prompt: spec.prompt, marks: spec.scheme.length, markScheme: spec.scheme, modelAnswer: spec.answer,
    specPointIds: [specPoint], capabilityIds: [capability],
    learning: { familyId: spec.family, contextId: spec.context, demand: "transfer", reasoningMoves: [spec.move] },
  };
  const transferLink = {
    baselinePartId: spec.baseline.id,
    baselineSetupFingerprint: fingerprintSetup(spec.baseline.prompt) as SetupFingerprint,
    transferSetupFingerprint: fingerprintSetup(spec.prompt, spec.answer) as SetupFingerprint,
    baselineReasoningGraph: reasoningGraphForPart(spec.baseline, S),
    transferReasoningGraph: reasoningGraphForPart(draft, S),
  };
  return defineQuestion({
    slug: spec.slug,
    subjectId: S,
    topics: [spec.topic],
    kind: "calculation",
    stem: spec.prompt,
    difficulty: 4,
    calculator: true,
    source: "generated",
    verification: "unverified",
    reviewer: null,
    // Date the author checked the numbers and specification mapping. It is
    // not a review: reviewer stays null and verification stays unverified.
    lastChecked: "2026-10-10",
    specVersion: "2024-1.0",
    parts: [{
      prompt: spec.prompt,
      marks: spec.scheme.length,
      scheme: spec.scheme,
      answer: spec.answer,
      aos: ["AO2", "AO3"],
      specPointIds: [specPoint],
      capabilityIds: [capability],
      learningClaims: [spec.move],
      learning: { familyId: spec.family, contextId: spec.context, demand: "transfer", reasoningMoves: [spec.move], transferLink },
    }],
    learning: { familyId: spec.family, contextId: spec.context, demand: "transfer", expectedMinutes: 5, reasoningMoves: [spec.move] },
  });
}

export const physicsTransferLinkedQuestions: Question[] = [
  // sp-01 rms and peak values. Baseline: 230 V rms supply, 1.0 kW heater ->
  // rms and peak current. Transfer: only the peak voltage and an energy meter
  // reading are known; the learner must convert peak to rms and energy to
  // power before inverting P = VI and V = IR.
  linkedTransferQuestion({
    slug: "physics-transfer-ac-sp-01-logger-heater",
    topic: "alternating-currents",
    point: "sp-01",
    baseline: baselinePart(physicsReasoningDepthQuestions, "cnt:question:physics-depth-alternating-currents-sp-01-mains-bulb-power-4"),
    family: "physics-transfer:ac-rms-from-energy-log",
    context: "physics-transfer:ac-rms-from-energy-log:data-logger-heater",
    move: "convert a logged peak voltage and metered energy into rms current and resistance",
    prompt: "A data logger shows that the voltage across a resistive heating element is a sinusoid with a peak value of 170 V. A joulemeter in the circuit records 54 kJ transferred to the element in 60 s. Determine the rms current in the element and its resistance.",
    scheme: [
      "V_rms = V₀/√2 = 170/√2 = 120 V",
      "Mean power P = E/t = 54 000/60 = 900 W",
      "I_rms = P/V_rms = 900/120 = 7.5 A",
      "R = V_rms/I_rms (or V_rms²/P) = 16 Ω",
    ],
    answer: "Mean power uses rms values, so first V_rms = 170/√2 = 120.2 V. The meter gives P = 54 000 J/60 s = 900 W. Then I_rms = P/V_rms = 900/120.2 = 7.5 A, and R = V_rms/I_rms = 120.2/7.49 = 16 Ω. As a check, V_rms²/P = 14 450/900 also gives 16 Ω.",
  }),
  // sp-03 transformer ratios and transmission. Baseline: known power, voltage
  // and resistance -> cable loss. Transfer: the loss limit is given and the
  // learner must work back to the minimum transmission voltage and the
  // step-up turns ratio.
  linkedTransferQuestion({
    slug: "physics-transfer-ac-sp-03-wind-farm-line",
    topic: "alternating-currents",
    point: "sp-03",
    baseline: baselinePart(physicsDepth50CircuitsFieldsQuestions, "cnt:question:physics-depth50-alternating-currents-sp-03-transmission-current-8"),
    family: "physics-transfer:ac-minimum-transmission-voltage",
    context: "physics-transfer:ac-minimum-transmission-voltage:wind-farm",
    move: "work back from a permitted cable loss to the minimum transmission voltage and the step-up turns ratio",
    prompt: "A wind farm sends 2.0 MW into a transmission line of total resistance 5.0 Ω. The operator allows no more than 0.50% of this power to be lost in the line. The turbines generate at 690 V rms and an ideal step-up transformer feeds the line. Calculate the minimum transmission voltage and the turns ratio Ns/Np this requires.",
    scheme: [
      "Maximum loss = 0.0050 × 2.0×10⁶ = 1.0×10⁴ W",
      "I²R ≤ 1.0×10⁴ so I ≤ √(1.0×10⁴/5.0) = 45 A",
      "V = P/I = 2.0×10⁶/44.7 = 4.5×10⁴ V (45 kV)",
      "Ns/Np = Vs/Vp = 44 700/690 ≈ 65",
    ],
    answer: "The permitted loss is 0.0050 × 2.0 MW = 10 kW. Since P_loss = I²R, I ≤ √(10 000/5.0) = 44.7 A. Sending 2.0 MW at that current needs V = P/I = 2.0×10⁶/44.7 = 4.5×10⁴ V, about 45 kV, as a minimum. For an ideal transformer Ns/Np = Vs/Vp = 44 700/690 ≈ 65.",
  }),
];
