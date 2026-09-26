import { z } from "zod";

const id = z.string().trim().min(1);
const nonEmpty = z.string().trim().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoInstant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/);
const ao = z.enum(["AO1", "AO2", "AO3"]);
const calculationOperand = z.union([z.number().finite(), id]);
const calculationRuleSchema = z.object({
  kind: z.enum(["method", "accuracy", "follow-through", "unit", "precision"]),
  label: nonEmpty,
  aliases: z.array(nonEmpty).optional(),
  expected: z.number().finite(),
  method: z.object({
    operator: z.enum(["+", "-", "*", "/"]),
    operands: z.tuple([calculationOperand, calculationOperand]),
  }).optional(),
  unitAliases: z.array(nonEmpty).optional(),
  significantFigures: z.number().int().min(1).max(10).optional(),
}).passthrough();

const capabilityStructureKind = z.enum([
  "polynomial", "quadratic", "radical-expression", "factor-theorem-instance",
  "simultaneous-equations", "inequality-domain", "transformation-graph",
  "exponential-function", "logarithmic-expression",
  "coordinate-geometry", "function", "derivative-target", "tangent-normal",
  "rate-of-change", "optimisation-constraint", "integral",
  "definite-integral", "trigonometric-triangle", "trigonometric-identity",
  "trigonometric-equation", "probability-events", "probability-tree",
  "conditional-probability", "vector-components", "table-dataset", "graph-dataset",
  "membrane-gradient", "membrane-model", "enzyme-assay", "micrograph", "dna-sequence",
  "controlled-experiment", "biological-molecule", "cell-ultrastructure",
  "chemical-equation", "stoichiometric-data", "titration-dataset",
  "equilibrium-system", "mass-spectrum", "electron-configuration",
  "molecular-structure", "redox-species", "gas-data", "bonding-model",
  "particle-model", "numeric-data",
]);
const capabilitySetupFingerprintSchema = z.object({
  subject: z.enum(["maths", "biology", "chemistry", "physics"]).optional(),
  structures: z.array(capabilityStructureKind).max(24),
  representations: z.array(nonEmpty).max(12),
  operations: z.array(nonEmpty).max(12),
  relationships: z.array(nonEmpty).max(12),
  outputTypes: z.array(nonEmpty).max(8),
}).passthrough();
const capabilityStructureContractSchema = z.object({
  requiredStructures: z.array(capabilityStructureKind).max(12).optional(),
  requiredStructureGroups: z.array(z.array(capabilityStructureKind).min(1).max(12)).max(8).optional(),
  requiredRepresentations: z.array(nonEmpty).max(12).optional(),
  requiredOperations: z.array(nonEmpty).max(12).optional(),
  requiredOperationGroups: z.array(z.array(nonEmpty).min(1).max(12)).max(8).optional(),
  requiredRelationships: z.array(nonEmpty).max(12).optional(),
  expectedOutputTypes: z.array(nonEmpty).max(8).optional(),
  invalidSubstituteStructures: z.array(capabilityStructureKind).max(12).optional(),
  requireDerivationOperation: z.boolean().optional(),
}).passthrough();
const capabilityDerivationSchema = z.object({
  setupStructures: z.array(capabilityStructureKind).max(24),
  capabilityOperation: nonEmpty,
  intermediateResults: z.array(nonEmpty).max(16),
  finalResult: nonEmpty,
  primaryEvidence: z.array(nonEmpty).max(8).optional(),
  secondaryEvidence: z.array(nonEmpty).max(8).optional(),
  joiningDependency: nonEmpty.optional(),
}).passthrough();
const capabilityEvidenceSchema = z.object({
  capabilityId: id,
  // Structural contracts are the authoritative evidence for generated cells;
  // lexical entities/operations may legitimately be empty when a task is
  // described entirely by structure groups and output constraints.
  requiredEntities: z.array(nonEmpty).max(12),
  requiredOperations: z.array(nonEmpty).max(8),
  requiredRelations: z.array(nonEmpty).max(8).optional(),
  structuralContract: capabilityStructureContractSchema.optional(),
  setupFingerprint: capabilitySetupFingerprintSchema.optional(),
  derivation: capabilityDerivationSchema.optional(),
  secondaryCapability: nonEmpty.optional(),
  secondaryCapabilityId: id.optional(),
  secondaryStructuralContract: capabilityStructureContractSchema.optional(),
  joiningDependency: nonEmpty.optional(),
}).passthrough();

const humanVerificationSchema = z.object({
  status: z.enum(["pending", "approved", "changes-requested"]),
  reviewerId: id.optional(),
  reviewerRole: z.enum(["examiner", "teacher", "subject-expert"]).optional(),
  reviewerQualification: nonEmpty.optional(),
  reviewedAt: isoInstant.optional(),
  contentFingerprint: nonEmpty.optional(),
  checks: z.object({
    question: z.boolean(),
    marking: z.boolean(),
    workedSolution: z.boolean(),
    capabilityMapping: z.boolean(),
    specificationMapping: z.boolean().optional(),
    examRealism: z.boolean().optional(),
  }),
  notes: z.string().optional(),
}).passthrough();

const paperProvenanceSchema = z.object({
  board: nonEmpty,
  specification: nonEmpty,
  specificationVersion: nonEmpty.optional(),
  paperId: id,
  sittingId: id.optional(),
  year: z.number().int().min(2015).max(2100).optional(),
  series: nonEmpty.optional(),
  questionNumber: nonEmpty,
  sourceUrl: z.string().url(),
  sourceDigest: nonEmpty,
  status: z.enum(["pending", "verified", "rejected"]),
  verifiedBy: id.optional(),
  verifiedAt: isoInstant.optional(),
  notes: z.string().optional(),
}).passthrough();

const learningPartSchema = z.object({
  familyId: id,
  contextId: id,
  demand: z.enum(["recall", "explanation", "application", "misconception", "calculation", "transfer", "synoptic"]),
  reasoningMoves: z.array(nonEmpty).min(1).max(8),
  quality: z.enum(["substantive", "scaffold"]).optional(),
  // Authoring trace is retained for audits but is never part of the prompt
  // projection shown to a learner.
  promptTarget: nonEmpty.optional(),
  expectedResult: nonEmpty.optional(),
  derivation: z.array(nonEmpty).max(16).optional(),
  evidenceSources: z.array(nonEmpty).max(16).optional(),
  capabilityEvidence: capabilityEvidenceSchema.optional(),
  setupFingerprint: capabilitySetupFingerprintSchema.optional(),
  provenance: z.object({
    sourceEvidence: z.array(nonEmpty).min(1).max(12),
    operation: nonEmpty,
    intermediateResults: z.array(nonEmpty).max(12),
    finalResult: nonEmpty,
  }).optional(),
}).passthrough();

export const contentQuestionPartSchema = z.object({
  id,
  label: z.string(),
  prompt: nonEmpty,
  marks: z.number().int().min(1).max(30),
  markScheme: z.array(nonEmpty).min(1).max(30),
  modelAnswer: nonEmpty,
  aos: z.array(ao).optional(),
  specPointIds: z.array(id).optional(),
  learningClaims: z.array(nonEmpty).optional(),
  claimMap: z.array(z.number().int().min(0)).optional(),
  capabilityIds: z.array(id).min(1).optional(),
  learning: learningPartSchema.optional(),
  calculationRules: z.array(calculationRuleSchema).optional(),
}).passthrough().superRefine((part, ctx) => {
  if (part.claimMap !== undefined) {
    if (part.claimMap.length !== part.markScheme.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["claimMap"],
        message: `claimMap (${part.claimMap.length}) must allocate every markScheme point (${part.markScheme.length})`,
      });
    }
    const claims = part.learningClaims?.length ?? 0;
    if (part.claimMap.some((index) => index >= claims)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["claimMap"],
        message: "claimMap entries must index into learningClaims",
      });
    }
  }
});

export const contentQuestionSchema = z.object({
  id,
  subjectId: id,
  topicIds: z.array(id).min(1),
  kind: z.enum(["mcq", "short", "structured", "calculation", "extended"]),
  stem: nonEmpty,
  options: z.array(nonEmpty).max(6).optional(),
  correctIndex: z.number().int().min(0).optional(),
  parts: z.array(contentQuestionPartSchema).min(1).max(12),
  totalMarks: z.number().int().min(1).max(100),
  calculatorAllowed: z.boolean(),
  difficulty: z.number().int().min(1).max(5),
  origin: z.enum(["seed", "ai", "past-paper"]),
  createdAt: isoInstant,
  humanVerification: humanVerificationSchema.optional(),
  paperProvenance: paperProvenanceSchema.optional(),
  learning: z.object({
    familyId: id, contextId: id,
    demand: z.enum(["recall", "explanation", "application", "misconception", "calculation", "transfer", "synoptic"]),
    expectedMinutes: z.number().finite().positive().max(120),
    reasoningMoves: z.array(nonEmpty).min(1).max(8).optional(),
    quality: z.enum(["substantive", "scaffold"]).optional(),
    promptTarget: nonEmpty.optional(),
    expectedResult: nonEmpty.optional(),
    derivation: z.array(nonEmpty).max(16).optional(),
    evidenceSources: z.array(nonEmpty).max(16).optional(),
    capabilityEvidence: capabilityEvidenceSchema.optional(),
    setupFingerprint: capabilitySetupFingerprintSchema.optional(),
    provenance: z.object({
      sourceEvidence: z.array(nonEmpty).min(1).max(12),
      operation: nonEmpty,
      intermediateResults: z.array(nonEmpty).max(12),
      finalResult: nonEmpty,
    }).optional(),
  }).optional(),
}).passthrough().superRefine((question, ctx) => {
  const marks = question.parts.reduce((sum, part) => sum + part.marks, 0);
  if (question.totalMarks !== marks) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["totalMarks"], message: "totalMarks must equal the part allocations" });
  }
  if (question.kind === "mcq") {
    if (!question.options || question.options.length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "MCQs need at least two options" });
    }
    if (question.correctIndex === undefined || question.correctIndex >= (question.options?.length ?? 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["correctIndex"], message: "MCQs need an in-range correctIndex" });
    }
  }
});

export const contentCardSchema = z.object({
  id,
  userId: id,
  subjectId: id,
  topicId: id,
  kind: z.enum(["basic", "cloze", "image", "equation", "mistake", "audio"]),
  front: nonEmpty,
  back: nonEmpty,
  tags: z.array(nonEmpty),
  origin: z.enum(["seed", "manual", "ai", "document", "mistake", "import"]),
  due: isoDate,
  stability: z.number().finite().nonnegative(),
  difficulty: z.number().finite().nonnegative(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  state: z.number().int().nonnegative(),
  lastReviewedAt: z.union([isoInstant, z.null()]),
  createdAt: isoInstant,
  updatedAt: isoInstant,
}).passthrough();

export const contentTopicSchema = z.object({
  id,
  subjectId: id,
  unitId: id,
  title: nonEmpty,
  order: z.number().int().nonnegative(),
  intrinsicDifficulty: z.number().int().min(1).max(5),
  summary: nonEmpty,
  keyPoints: z.array(nonEmpty).min(1),
  commonErrors: z.array(nonEmpty).min(1),
}).passthrough();

export const CONTENT_SCHEMAS = {
  question: contentQuestionSchema,
  card: contentCardSchema,
  topic: contentTopicSchema,
} as const;
