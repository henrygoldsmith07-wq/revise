import type { CapabilityNode } from "./capability-graph";
import { checkEquationBalance, findUnbalancedEquations } from "./equation-balance";
import { mathsEquivalent } from "./maths-equivalence";
import {
  auditPhysicsAssessmentQuality,
  PHYSICS_ASSESSMENT_DEMANDS,
  promptOverload,
  type PhysicsAssessmentQualityAudit,
  type PhysicsQualityIssueKind,
  type PhysicsQualityIssue,
} from "./physics-assessment-quality";
import type { Id, LearningDemand, Question, QuestionPart, Topic } from "./types";

/**
 * The WJEC flagship subjects share one depth contract.  Physics already uses
 * the contract; these ids let authoring and QA report the other three subjects
 * through the same internal surface without creating a second mastery model.
 */
export const WJEC_FLAGSHIP_SUBJECT_IDS = [
  "wjec-alevel-physics",
  "wjec-alevel-maths",
  "wjec-alevel-biology",
  "wjec-alevel-chemistry",
] as const;

export type WjecFlagshipSubjectId = (typeof WJEC_FLAGSHIP_SUBJECT_IDS)[number];

export type SubjectAssessmentIssueKind =
  | "generic-fallback"
  | "not-self-contained"
  | "solution-substance"
  | "demand-evidence"
  | "maths-equivalence"
  | "maths-domain"
  | "maths-exact-form"
  | "maths-calculus"
  | "maths-mechanics"
  | "maths-statistics"
  | "biology-terminology"
  | "biology-causal-chain"
  | "biology-practical-design"
  | "biology-data-interpretation"
  | "biology-contradiction"
  | "chemistry-equation-balance"
  | "chemistry-stoichiometry"
  | "chemistry-oxidation-state"
  | "chemistry-unit"
  | "chemistry-precision"
  | "chemistry-acid-base"
  | "chemistry-equilibrium"
  | "unresolved";

export interface SubjectAssessmentIssue {
  subjectId: WjecFlagshipSubjectId | Id;
  questionId: Id;
  partId: Id;
  kind: SubjectAssessmentIssueKind;
  severity: "error" | "warning";
  detail: string;
}

export interface SubjectCorrectnessSummary {
  issueCount: number;
  errors: number;
  warnings: number;
  /** Warnings remain unresolved until a qualified reviewer closes them. */
  unresolved: number;
  byKind: Partial<Record<SubjectAssessmentIssueKind, number>>;
}

/** Stable repair ordering used by the authoring queue and internal dashboard. */
export type SubjectRepairPriority =
  | "missing-authored-demand"
  | "not-self-contained"
  | "weak-worked-solution"
  | "duplicate-reasoning"
  | "correctness-warning";

export interface SubjectRepairQueueItem {
  subjectId: WjecFlagshipSubjectId | Id;
  specPointId?: Id;
  capabilityId?: Id;
  demand?: LearningDemand;
  questionId?: Id;
  partId?: Id;
  severity: "error" | "warning";
  priority: SubjectRepairPriority;
  reasons: string[];
}

export interface FlagshipSubjectAssessmentAudit extends PhysicsAssessmentQualityAudit {
  subjectIssues: SubjectAssessmentIssue[];
  correctness: SubjectCorrectnessSummary;
  /** Number of independent marking disagreements supplied by the benchmark. */
  markingDisagreements: number;
  /** Exact demand cells and parts that need author repair before completion. */
  repairQueue: SubjectRepairQueueItem[];
}

function partText(part: QuestionPart): string {
  return [part.prompt, ...(part.markScheme ?? []), part.modelAnswer].filter(Boolean).join("\n");
}

function addIssue(
  issues: SubjectAssessmentIssue[],
  question: Question,
  part: QuestionPart,
  kind: SubjectAssessmentIssueKind,
  severity: "error" | "warning",
  detail: string,
): void {
  issues.push({ subjectId: question.subjectId, questionId: question.id, partId: part.id, kind, severity, detail });
}

const GENERIC_FALLBACK_PHRASES = [
  /\bappropriate method\b/i,
  /\bstated (?:value|context|constraint)\b/i,
  /\brequested (?:value|quantity|result)\b/i,
  /\b(?:trace|follow)\b[^.\n]{0,80}\bto\s+(?:the\s+)?target\b/i,
  /\b(?:the|a) target (?:value|quantity|result)\b/i,
  /\bcomplete (?:answer|response) must\b/i,
  /\bcheck(?:s|ing)? (?:against|the) (?:an? )?(?:invariant|limiting case)\b/i,
  /\bcross-check\b[^.\n]{0,100}\b(?:invariant|target)\b/i,
  /\bcombine\s+(?:this|the)\s+(?:idea|concept|result)\b(?:[^.\n]{0,80})\b(?:another|a second|an additional)\s+(?:idea|concept|result)\b/i,
  /\b(?:use|apply|trace|follow|relate)\b[^.\n]{0,80}\b(?:the|an?)\s+(?:relationship|method|concept|invariant)\b[^.\n]{0,50}\b(?:above|given|stated)\b/i,
  /\b(?:according to|from)\s+(?:the|your)\s+(?:brief|mapping|metadata|author(?:ing)?\s+(?:notes?|record))\b/i,
  /\b(?:as|from)\s+(?:shown|stated|specified|described)\s+(?:above|elsewhere|in the metadata)\b/i,
  /\b(?:the|a|an)\s+(?:diagram|figure|apparatus|spectrum|micrograph|circuit)\s+(?:above|below|shown|provided)\b/i,
  /\b(?:from|in|per)\s+(?:the\s+)?(?:author(?:ing)?\s+)?(?:metadata|brief|mapping|notes?|record)\b/i,
  /\b(?:reasoning\s+move|family\s+id|context\s+id|capability\s+mapping|spec(?:ification)?\s+mapping)\b/i,
  /\{\{[^}]+\}\}|<\s*(?:value|quantity|target|data|variable|compound|organism)\s*>|\[(?:value|quantity|target|data|variable|compound|organism)\]/i,
];

function hasConcreteStructure(text: string): boolean {
  return /\d|[=→⟶]|\b(?:figure|equation|formula|function|probability|vector|derivative|integral|gradient|root|domain|inequality|organism|cell|tissue|sample|species|compound|reaction|solution|concentration|mass|volume|force|graph|table|dataset|triangle|DNA|RNA|enzyme|protein|membrane|osmosis|water potential|bond|electron|molecule|mole|acid|base|ion|atom|pH|Kc|Kp|ATP)\b/i.test(text);
}

function hasResultEvidence(text: string): boolean {
  return /[=→⟶]|\b(?:therefore|thus|hence|gives?|giving|equals?|is|are|was|were|increases?|decreases?|changes?|predicts?|conclude|so that|result(?:s|ing)?|because|leads?|causes?|follows?|obtain|obtains|yield|amount|concentration|purity|probability|value|volume|mass|approximately|about|would|could|supports?|requires?|twice|half|outside|infeasible|impossible|rejected|valid|invalid|root|solution|test|suggest|explains?|explain|compare|difference|different|higher|lower)\b/i.test(text);
}

/**
 * A result/conclusion must contain something a marker can check.  Words such
 * as “the result is correct” are outcome-shaped prose, but they do not show a
 * value, relation or biological/chemical consequence.  Keep this stricter
 * predicate for the substantive gate while the broader predicate above still
 * supports qualitative explanation checks.
 */
function hasConcreteResultEvidence(text: string, subjectId?: WjecFlagshipSubjectId | Id): boolean {
  if (/(?:->|==>|[→⟶])/.test(text)) return true;
  if (/(?:=|≈|≃|≤|≥|<|>)\s*[+-]?(?:\d|[A-Za-z(])/.test(text)) return true;
  // A number in a method description (for example “differentiate x^3”) is
  // not a solved result. Numeric evidence only counts when it is attached to
  // an assignment, comparison or explicit conclusion.
  const hasNumericConclusion = /\b[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*[×x]\s*10\s*(?:\^|\*\*)?\s*[+-]?\d+)?\b/.test(text) &&
    /\b(?:therefore|thus|hence|gives?|giving|equals?|is|are|was|were|result|value|amount|concentration|probability|difference|approximately|about|found|obtain|calculate|computed|becomes?)\b/i.test(text);
  return hasNumericConclusion || /\b(?:therefore|thus|hence|because|leads?|causes?|increases?|decreases?|rises?|falls?|remains?|reduces?|makes?|improves?|allows?|ensures?|prevents?|limits?|avoids?|keeps?|controls?|supports?|rejects?|valid|invalid|higher|lower|greater|smaller|same|different|concludes?|predicts?|consistent|inconsistent|impossible|infeasible|outside|within|requires?|doubles?|halves?|towards?|toward|shift|changes?)\b/i.test(text) ||
    (subjectId ? hasCausalChain(text, subjectId) : false);
}

function hasWorkedEvidence(text: string): boolean {
  if (hasConcreteResultEvidence(text)) return true;
  // Infinitive method instructions are not carried-out working. Require a
  // completed operation marker plus an equation/result or a causal link.
  const completedOperation = /\b(?:substitut(?:e|ed|es|ing)|rearrang(?:e|ed|es|ing)|differentiat(?:e|ed|es|ing)|integrat(?:e|ed|es|ing)|convert(?:e|ed|es|ing)|calculat(?:e|ed|es|ing)|divid(?:e|ed|es|ing)|multipl(?:y|ied|ies|ying)|evaluat(?:e|ed|es|ing)|compar(?:e|ed|es|ing)|solv(?:e|ed|es|ing)|interpolat(?:e|ed|es|ing)|proportion|fraction|ratio|difference|percentage|gradient|average|mean|sum|subtract|add|drawn|plott(?:e|ed|es|ing))\b/i.test(text);
  return completedOperation && /(?:=|→|therefore|thus|hence|because|so that|which means|gives?|obtains?|yields?)/i.test(text);
}

function numericLiterals(text: string): string[] {
  return [...text.matchAll(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*[×x]\s*10\s*(?:\^|\*\*)?\s*[+-]?\d+)?/gi)]
    .map((match) => match[0]!.replace(/\s+/g, "").toLowerCase());
}

/**
 * Detect completed numerical reasoning without requiring a derived answer to
 * repeat one of the prompt's literal values.  Real solutions commonly turn
 * supplied values into new mole amounts, ratios, percentages or interpolated
 * results, so literal overlap is only one signal.  A bare invented number
 * (“the answer is 42”) remains unresolved and is rejected by the gate.
 */
function hasCalculationNarrative(text: string): boolean {
  if (!numericLiterals(text).length) return false;
  if (/[=≈≃≤≥→⟶]/.test(text)) return true;
  return /\b(?:using|from|substitut\w*|rearrang\w*|calculat\w*|evaluat\w*|solv\w*|deriv\w*|divid\w*|multipl\w*|add(?:ed|ing)?|subtract\w*|sum(?:ming)?|averag\w*|mean|ratio|fraction|factor|percentage|percent|difference|change|fall|rise|increase|decrease|remov\w*|leav\w*|equivalent|correspond\w*|convert\w*|dilut\w*|condition\w*|interpolat\w*|gradient|area|volume|concentration|amount|mole|mol|uncertaint\w*|probabil\w*|proportion|extent|root|mean|range|span|consum\w*|react\w*|transfer\w*|electron|charge|balance|yield|purity|mass|titre|titration)\b/i.test(text);
}

/** A conservative prompt/solution consistency check for authored workings. */
function solutionUsesPromptEvidence(prompt: string, answer: string, demand: LearningDemand | undefined): boolean {
  if (!demand || !["application", "calculation", "transfer", "synoptic"].includes(demand)) return true;
  const supplied = numericLiterals(prompt);
  const reported = numericLiterals(answer);
  // If an answer invents numbers while ignoring every supplied value, it is
  // usually a copied/template result. Symbolic transfer answers are allowed
  // to contain no numbers at all.
  if (supplied.length >= 2 && reported.length > 0 && !supplied.some((value) => reported.includes(value)) && !hasCalculationNarrative(answer)) return false;
  return true;
}

function repeatsReasoningMetadata(part: QuestionPart, answer: string): boolean {
  const moves = part.learning?.reasoningMoves ?? [];
  if (!moves.length || answer.length < 24) return false;
  return moves.some((move) => move.trim().length >= 16 && promptOverload(move, answer) >= 0.9 && !hasWorkedEvidence(answer));
}

function hasConcreteMarkScheme(scheme: readonly string[], subjectId: WjecFlagshipSubjectId | Id): boolean {
  const text = scheme.map((point) => point.trim()).filter(Boolean).join("\n");
  if (!text || text.length < 8) return false;
  if (GENERIC_FALLBACK_PHRASES.some((phrase) => phrase.test(text))) return false;
  return hasConcreteStructure(text) || hasCausalChain(text, subjectId);
}

function hasCausalChain(text: string, subjectId?: WjecFlagshipSubjectId | Id): boolean {
  const connector = /\b(?:because|therefore|thus|hence|so|leads?|causes?|due to|results? in|allows?|means?|follows?|when|which|why|since|if|as a result|but|whereas|however|although|though|despite|while|rather|rather than|instead of|not necessarily|before|after|until|higher|lower|as|can|without|leaves?|substitut\w*|insufficient|alone|giving|dividing|restrict\w*|removes?|changes?|alters?|reduces?)\b/i.test(text);
  const rawEntities = subjectId === "wjec-alevel-maths"
    ? (text.match(/(?:[=^√]|\b(?:function|equation|derivative|integral|gradient|root|domain|vector|probability|ratio|angle|curve|value|sample|event|condition|group|composition|student|students|music|physics|counter|draw|rate|volume|time|slope|loss|distance|area|point|line)\w*)/gi) ?? [])
    : subjectId === "wjec-alevel-chemistry"
      ? (text.match(/\b(?:atom|ion|mole|mol|bond|electron|equilibrium|acid|base|reaction|concentration|oxid|reduc|pH|Kc|Kp|Qc|species|compound|equation|unit|particle|pressure|volume|amount|ratio|rate|catalyst|temperature|energy|factor)\w*\b/gi) ?? [])
      : (text.match(/\b(?:cell|tissue|organ|enzyme|substrate|membrane|protein|DNA|RNA|gene|allele|water|ion|ATP|gradient|temperature|pH|organism|species|reaction|bond|electron|concentration|molecule|rate|active|oxygen|solute|potential|assay|control|variable|osmosis|diffusion|mutation|allele|trait|kinetic|denatur|activity|site|heating|inhib|permeab|structure|function|mechanism|measurement|data|comparison|change|result|movement|collision|molecular|mass|uncertainty|sample|response|outcome)\w*/gi) ?? []);
  // Generic outcome words are useful prose but cannot, by themselves, prove
  // that an explanation links two subject entities. Keep the chain gate from
  // accepting “the cell causes the result” as a substantive mechanism.
  const generic = subjectId === "wjec-alevel-maths"
    ? new Set(["value", "condition", "sample", "event", "result"])
    : subjectId === "wjec-alevel-chemistry"
      ? new Set(["unit", "amount", "factor", "result"])
      : new Set(["structure", "function", "mechanism", "measurement", "data", "comparison", "change", "result", "response", "outcome", "sample", "condition"]);
  const entities = new Set(rawEntities.map((entity) => entity.toLowerCase()).filter((entity) => !generic.has(entity)));
  return connector && entities.size >= 2;
}

function answerIsMostlyRestatement(prompt: string, answer: string): boolean {
  if (answer.trim().length < 24) return false;
  // A very high value-stripped overlap with no additional working is a
  // restatement, while a worked answer normally introduces equations,
  // numbers, causal links or a conclusion.
  return promptOverload(prompt, answer) >= 0.94 && !hasWorkedEvidence(answer);
}

function hasSubjectSpecificEvidence(text: string, subjectId: WjecFlagshipSubjectId | Id): boolean {
  if (subjectId === "wjec-alevel-maths") {
    // A bare number or “the result is ...” is not mathematical evidence.
    // Require a variable/operation, named mathematical object or standard
    // representation that a marker could independently check.
    return /\b(?:function|equation|derivative|integral|gradient|root|domain|vector|probability|mean|variance|mechanic|force|moment|ratio|angle|curve|sequence|log(?:arithm)?|exponential|quadratic|inequalit|sample|event|condition|counter|draw|distance|area|volume|slope|rate)\w*\b|[√π]|\b(?:sin|cos|tan)\b|\b[A-Za-z]\s*(?:[′']?\s*)?(?:=|[+*/^−-])|\bP\s*\(/i.test(text);
  }
  if (subjectId === "wjec-alevel-chemistry") {
    return /\b(?:atom|ion|mole|mol|bond|electron|equilibrium|acid|base|reaction|concentration|oxid\w*|reduc\w*|pH|Kc|Kp|species|compound|formula|titration|titr|electro\w*|stoichiometr\w*|pressure|volume|amount|ratio|rate|catalyst|temperature|energy|gas|yield|uncertaint\w*|percentage|burette|aliquot|relative|absolute|standard|titre|c_standard|charge|balanced|half[- ]equation)\b/i.test(text) || /\b[A-Z][a-z]?\d*(?:[A-Z][a-z]?\d*)+\b/.test(text);
  }
  return /\b(?:cell|tissue|organ|enzyme|substrate|membrane|protein|DNA|RNA|gene|allele|water|ion|ATP|gradient|temperature|pH|organism|species|reaction|molecule|osmosis|diffusion|mutation|trait|control|variable|sample|uncertainty|uncertainties|data|respiration|photosynthesis|transport|mass|sucrose|concentration|percentage|linear|interpolat|solute|water-potential|potential|rate|assay|solution)\w*\b/i.test(text);
}

function hasInlineQuantityOrRepresentation(prompt: string): boolean {
  // A number must be attached to an equation, measurement, percentage or
  // unit; bare question numbering does not make a prompt self-contained.
  const numeric = /(?:£|%|[=<>≈≤≥→⟶]|\b(?:values?|points?|measure(?:d|ment)?|concentration|amount|mass|volume|rate|time|pressure|temperature|pH|probability|gradient|radius|length|angle|distance|data|available|contains?|records?|respondents?|students?|counters?|cards?|successes?|red|blue|factor|ratio|difference|change|interval|assay|sample)\b)[^\n]{0,100}\d|\d[^\n]{0,100}(?:£|%|\b(?:cm|mm|m|s|kg|g|mg|ng|μm|μmol|mol|dm|Pa|J|K|°C|units?|met(?:re|er)s?)\b)/i.test(prompt) ||
    /(?:\||,\s*)[-+]?\d+(?:\.\d+)?(?:\s*\||\s*,)/.test(prompt);
  if (numeric) return true;
  // Small counts are often written as words (“four red and three blue
  // counters”). Count them only when tied to a concrete entity; a bare
  // “one result” remains a placeholder.
  return /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|half|quarter)\b[^.\n]{0,45}\b(?:red|blue|counter|card|student|sample|trial|reading|measurement|mole|mol|g|cm|s|second|value|unit|success|failure|birth|component|item|react(?:ion|ant)|solution|cell|tissue|organism|enzyme|substrate|protein|particle|isotope|gas|volume|mass|pressure|temperature|rate|concentration)\b/i.test(prompt) ||
    /\b(?:red|blue|counter|card|sample|trial|reading|measurement|mole|mol|success|failure|birth|component|reaction|solution|cell|tissue|organism|enzyme|substrate|protein|particle|isotope|gas|volume|mass|pressure|temperature|rate|concentration)\b[^.\n]{0,45}\b(?:one|two|three|four|five|six|seven|eight|nine|ten|half|quarter)\b/i.test(prompt);
}

function hasConcreteApplicationContext(prompt: string, subjectId: WjecFlagshipSubjectId | Id): boolean {
  if (hasInlineQuantityOrRepresentation(prompt)) return true;
  // A qualitative application can still be self-contained when it names a
  // real specimen/setup and changed condition. Do not accept generic “apply
  // the method” prose: both a subject entity and an operation/condition must
  // be visible in the prompt.
  const condition = /\b(?:before|after|initially|while|without|with|same|different|constant|fixed|matched|dilut(?:e|ed|ing)|vary|control|weigh|blot|place|heat|cool|treat|compare|contains?|permits?|cross(?:es|ing)?|held|excess|limiting|concentrated|buffered|pH|temperature|pressure|length|volume|assay|mixture|sample|solution|stock|gradient|rate)\b/i.test(prompt);
  if (!condition) return false;
  if (subjectId === "wjec-alevel-biology") {
    return /\b(?:enzyme|substrate|buffer|pH|potato|sucrose|tissue|sample|assay|cell|membrane|solute|water|mass|protein|reaction|pigment|temperature|organism|concentration)\b/i.test(prompt);
  }
  if (subjectId === "wjec-alevel-chemistry") {
    return /\b(?:solution|acid|base|mole|mol|reaction|compound|ion|electron|equilibrium|gas|titration|concentration|temperature|pressure|volume|mass|catalyst|mixture)\b/i.test(prompt);
  }
  return hasSubjectSpecificEvidence(prompt, subjectId);
}

/**
 * The older generated depth pack is retained as provisional practice content
 * while the subject-specific quality packs are authored. It has concrete
 * numeric setups, but its route prose is intentionally not a human-reviewed
 * correctness signal. Keep it out of trusted/release counts while allowing
 * the structural depth inventory to remain visible during migration. New
 * generated rows do not get this exception unless they carry the explicit
 * `-depth:` family marker used by that migration pack.
 */
function isGeneratedDepthDraft(question: Question): boolean {
  return question.source === "generated" && question.verification === "unverified" &&
    question.parts.some((part) => part.learning?.familyId?.includes("-depth:"));
}

function hasSpecificTarget(prompt: string): boolean {
  // An explicit assignment, named function, probability or physical
  // quantity is a checkable target. Avoid treating “of the …” or “for the …”
  // as a target merely because it happens to contain a single letter.
  if (/(?:\b[A-Za-z](?:['′]\s*|\s*)\([^)]*\)\s*=|\b[A-Za-z](?:['′]\s*)?\s*=|\bP\s*\([^)]*\)|[=→⟶]\s*[A-Za-z0-9(]|\b(?:calculate|find|determine|obtain|report|give|show|derive|solve|predict|evaluate)\s+(?:the\s+)?[A-Za-z](?:['′]\s*)?(?=\s*(?:[=(),.;:!?]|from\b|using\b|given\b|when\b|for\b|$)))/i.test(prompt)) return true;
  if (/\b(?:probability|gradient|slope|derivative|integral|root|distance|length|area|volume|mass|concentration|pressure|temperature|pH|rate|velocity|acceleration|force|moment|energy|power|current|voltage|resistance|charge|frequency|wavelength|amount|moles?|ratio|percentage|mean|variance|standard\s+deviation|dimensions?|radius|height|width|time|score|profit|intercept|midpoint|normal|tangent|domain|range|empirical\s+formula|oxidation\s+state|yield|purity|uncertainty|titre|titration|electron(?:s)?|equilibrium)\b/i.test(prompt)) return true;
  return false;
}

function undefinedVariableReference(prompt: string, subjectId: WjecFlagshipSubjectId | Id): string | null {
  if (subjectId !== "wjec-alevel-maths") return null;
  const declaration = (symbol: string): boolean => {
    const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // A symbol is defined when it is assigned/described, or when it appears
    // on either side of an explicit equation from which the requested value
    // can be solved.  Standard function arguments (f(x)) therefore do not
    // become false positives by themselves.
    return new RegExp(`\\b${escaped}\\s*(?:=|is|represents|denotes|ranges?|lies?)`, "i").test(prompt) ||
      new RegExp(`(?:\\b${escaped}\\b[^.\\n]{0,36}=|=[^.\\n]{0,36}\\b${escaped}\\b)`, "i").test(prompt) ||
      new RegExp(`\\b(?:where|let|set|take|with)\\s+${escaped}\\b`, "i").test(prompt);
  };
  const explicit = prompt.match(/\b(?:the|this|that|unknown|given)\s+(?:variable|parameter|quantity|symbol)\s+([A-Za-z])\b/i);
  if (explicit && !declaration(explicit[1]!)) return `Variable ${explicit[1]} is referenced without a definition or supplied equation.`;
  const pair = prompt.match(/\b(?:using|in\s+terms\s+of|with)\s+([A-Za-z])\s*(?:,|and)\s*([A-Za-z])\b/i);
  if (pair && !declaration(pair[1]!) && !declaration(pair[2]!)) {
    return `Variables ${pair[1]} and ${pair[2]} are referenced without definitions or supplied values.`;
  }
  return null;
}

/**
 * Generic wording is acceptable only when the surrounding cell instantiates
 * the thing it refers to.  This keeps the fallback detector strict while
 * allowing an authored prompt such as “use the appropriate method to find
 * f(2)” to retain a harmless editorial phrase.
 */
function fallbackPhraseIsInstantiated(phrase: RegExp, prompt: string, fullText: string, subjectId: WjecFlagshipSubjectId | Id): boolean {
  const source = phrase.source;
  const target = hasSpecificTarget(prompt);
  const supplied = hasInlineQuantityOrRepresentation(prompt) || /\b[A-Za-z]\s*(?:=|[+*/^−-])/.test(prompt);
  const operation = /\b(?:differentiat\w*|integrat\w*|substitut\w*|rearrang\w*|solv\w*|calculat\w*|convert\w*|divid\w*|multipl\w*|ratio|fraction|gradient|probabil\w*|stoichiometr\w*|equation|formula|mechanism|causal|deriv\w*|power\s+rule|chain\s+rule|mole|charge|balance)\b/i.test(fullText);
  if (/appropriate method|stated (?:value|context|constraint)|requested (?:value|quantity|result)|target (?:value|quantity|result)/i.test(source)) {
    return target && supplied && operation;
  }
  if (/trace|follow.*target|relationship.*(?:above|given|stated)/i.test(source)) {
    return target && supplied && operation;
  }
  if (/combine/i.test(source)) {
    // “combine this idea with another concept” remains a fallback.  A named
    // second concept must be present in the same sentence.
    return /\bcombine\b[^.\n]{0,80}\bwith\b\s+(?!another\b|a\s+second\b|an\s+additional\b)(?:the\s+)?[A-Za-z][A-Za-z -]{2,}/i.test(fullText) && target && (supplied || hasSubjectSpecificEvidence(fullText, subjectId));
  }
  if (/cross-check/i.test(source)) {
    return supplied && /\b(?:equation|formula|value|gradient|ratio|conservation|charge|energy|mass|invariant)\b/i.test(fullText) && target;
  }
  if (/metadata|brief|mapping|author|reasoning|family|context|capability|spec/i.test(source)) return false;
  if (/shown|specified|described|diagram|figure|apparatus|spectrum|micrograph|circuit/i.test(source)) return hasInlineQuantityOrRepresentation(prompt);
  if (/\{\{|<|\[/.test(source)) return false;
  return false;
}

function hasMisconceptionClaim(prompt: string): boolean {
  return /\b(?:student|claim|says?|thinks?|argues?|believes?|incorrect|wrong|error|misconception|tempting|proposed|correct(?:ion)?|cancel(?:ling|ed)?|lose|extraneous|ambig|omit(?:ted|ting)?|ignore|divide\s+by|missing|repeated\s+root|interchange(?:d)?|confus(?:e|ed|ion)?|shortcut|condition|substitution|bounds?|old\s+variable|reverse|opposite)\b/i.test(prompt) ||
    /(?:["“”']\s*[^"“”']{4,}\s*["“”']|\b(?:=|→|⟶)\b)/.test(prompt);
}

function hasRepairEvidence(answer: string, subjectId: WjecFlagshipSubjectId | Id): boolean {
  const correction = /\b(?:not|incorrect|wrong|instead|rather|correct(?:ly)?|reject(?:ed)?|false|should|must|cannot|does not|do not|first invalid|invalid|error|repair|because|infeasible|extraneous|outside|lose|lost|signs?|magnitude|factor|domain|zero|opposite|reversed|reverse|halve|twice|unsafe|omitted|omit|excludes?|leaves?|assumes?|assumption|claim|condition|different|greater|higher|lower|move|moves?)\b/i.test(answer);
  return correction && hasSubjectSpecificEvidence(answer, subjectId);
}

function hasTransferAdaptation(prompt: string, answer: string, subjectId: WjecFlagshipSubjectId | Id): boolean {
  const representationCue = /\b(?:unfamiliar|new|novel|different|unknown|unseen|alternative|without assuming|external|hidden|selected|observed|given|condition|candidate|protocol|representation|diagram|spectrum|isomer|mixture|assay|variant|inferred|tangent|contact|integer|continuous|operator|reported|reporting|back titration|residual|inert|unusual|second|another|without replacement|at least one|posterior|source|reporting rule|contact point|matched|fresh|initially|over time|side\s+[A-Z]|artificial|same|fixed|permeat|hypertonic|slow(?:ly)?|long[- ]term|two\s+\w+|one\s+.*\bother\b)\b/i.test(prompt);
  const adaptationCue = /\b(?:rearrang|convert|translate|map|interpret|adapt|reconstruct|derive|infer|compare|preserv|invariant|constraint|domain|units?|structure|gradient|ratio|charge|stoichiometr|control|evidence|because|therefore|instead|rather|different(?:ly)?|new case|under these conditions|setting|contact|tangent|candidate|admissible|continuous|integer|condition|protocol|initial|posterior|conditional|given|remaining|order|route|path|representation|supports?|suggests?|predicts?|depends?|over time|final|long[- ]term|balance|total|cannot|need(?:s)?|limiting|re-enter|rescue|fresh|permeat|cross(?:es|ing)?)\w*\b/i.test(answer);
  return representationCue && adaptationCue && hasSubjectSpecificEvidence(answer, subjectId);
}

function hasSynopticJoin(prompt: string, answer: string, subjectId: WjecFlagshipSubjectId | Id): boolean {
  const combinedText = `${prompt}\n${answer}`;
  const explicitJoin = /\b(?:combine|integrat|link|connect|relate|together|both|simultaneous|joint|cross-check|interact|constraint|trade[- ]?off)\w*\b/i.test(prompt);
  const distinctAreas = (text: string, patterns: readonly RegExp[]): number => patterns.filter((pattern) => pattern.test(text)).length;
  const mathsAreas = [
    /\b(?:derivative|differentiat|integral|calculus|rate|tangent|normal|optim(?:ise|ize)|minimum|maximum|maximis|minimis|product\s+rule|chain\s+rule|dimension\s+rate)\w*\b/i,
    /\b(?:geometry|area|volume|radius|length|distance|shape|coordinate|circle|rectangle|cylinder|cone)\w*\b|\bA\s*\(|\br\s*=\s*[+-]?\d/i,
    /\b(?:probabilit\w*|conditional|event|P\s*\()\b/i,
    /\b(?:distribution|sample|mean|variance|binomial|count|outcome|independent|strat|pool|overall|success|fail(?:ure)?)\w*\b/i,
    /\b(?:mechanic|force|moment|velocity|acceleration|motion)\w*\b/i,
    /\b(?:algebra|equation|root|domain|integer|sequence|exponential|logarithm)\w*\b/i,
  ] as const;
  const biologyAreas = [
    /\b(?:enzyme|substrate|catalys|respiration|photosynthesis|metabol)\w*\b/i,
    /\b(?:membrane|transport|osmosis|water\s+potential|diffusion|turgor|solute)\w*\b/i,
    /\b(?:gene|DNA|RNA|allele|protein|mutation|inherit)\w*\b/i,
    /\b(?:cell|tissue|organ|organell|structure|function)\w*\b/i,
    /\b(?:control|uncertaint|data|assay|experiment|sample|replicat|variable|bottleneck|coupled|proxy|oxygen|plateau)\w*\b/i,
  ] as const;
  const chemistryAreas = [
    /\b(?:mole|stoichiometr|titration|titre|concentration|amount|ratio|yield|purity)\w*\b/i,
    /\b(?:equilibrium|Kc|Kp|acid|base|pH|buffer)\w*\b/i,
    /\b(?:energy|enthalpy|bond|entropy|kinetic|rate|catalys|temperature)\w*\b/i,
    /\b(?:electron|oxid|reduc|charge|electrochem|cell)\w*\b/i,
    /\b(?:atom|periodic|compound|organic|isomer|functional\s+group|spectr|structure|gas|volume|measurement|assay|back[- ]?titration)\w*\b/i,
    /\b(?:uncertaint|burette|precision|significant|error|repeat|accuracy)\w*\b/i,
  ] as const;
  const areas = subjectId === "wjec-alevel-maths" ? mathsAreas : subjectId === "wjec-alevel-biology" ? biologyAreas : chemistryAreas;
  const join = explicitJoin
    ? distinctAreas(combinedText, areas) >= 2
    : distinctAreas(prompt, areas) >= 2 && distinctAreas(answer, areas) >= 2;
  const answerJoin = /\b(?:because|therefore|while|whereas|both|together|combined|simultaneous|constraint|trade[- ]?off|interact|link|connect|relat|using|product\s+rule|chain\s+rule|stoichiometr|equilibrium|mechanism|evidence|units?|gradient|domain|concav|derivative|second\s+derivative|area|rate|dimension|global|volume|mass|ratio|uncertaint|uncertainties|percentage|absolute|relative|titre|titration|subtraction|division|adding|add|contributes?|omits?|misses?|rather|instead|compared|across|balance|so|total|activity|specific|protein|proxy|leak|leakage|water|potential|pressure|osmotic|control)\w*\b/i.test(answer);
  return join && answerJoin && hasSubjectSpecificEvidence(answer, subjectId);
}

interface SubstantiveGateFailure {
  kind: Extract<SubjectAssessmentIssueKind, "generic-fallback" | "not-self-contained" | "solution-substance" | "demand-evidence">;
  detail: string;
}

/**
 * Validate the hard substantive gate shared by all non-Physics WJEC packs.
 * The returned failures are deliberately conservative: a cell is excluded
 * from deep coverage until its prompt, evidence and solution are explicit.
 */
export function validateSubstantivePart(
  subjectId: WjecFlagshipSubjectId | Id,
  question: Question,
  part: QuestionPart,
): SubstantiveGateFailure[] {
  const failures: SubstantiveGateFailure[] = [];
  const meta = part.learning;
  const text = partText(part);
  const prompt = part.prompt.trim();
  const answer = part.modelAnswer.trim();
  const demand = meta?.demand;
  const provisionalDepthDraft = isGeneratedDepthDraft(question);
  // WJEC command words are often embedded after a short context sentence
  // (for example “Use the supplied data…” or “Build a causal chain…”).
  // Keep this list explicit rather than treating any imperative as a pass:
  // substantive cells still have to satisfy the demand/result gates below.
  const hasCommandWord = /\b(?:state|define|describe|explain|calculate|recalculate|find|determine|predict|compare|evaluate|identify|correct|show|derive|write|give|classify|suggest|justify|use|deduce|sketch|solve|estimate|outline|apply|process|summari[sz]e|choose|decide|locate|interpret|carry|reconstruct|combine|check|convert|minimi[sz]e|select|repair|test|reject|name|list|construct|formulate|balance|draw|infer|read|plot|measure|obtain|verify|confirm|discuss|assess|analyse|analyze|track|follow|build|relate|separate|map|translate|recover|weight|rank|distinguish|match|move|sum|treat|report|differentiate)\b/i.test(prompt);

  if (meta?.quality !== "substantive") {
    failures.push({ kind: "generic-fallback", detail: "Mark this cell substantive only after replacing fallback/scaffold prose with a reviewed, answerable task." });
  }
  if (!hasConcreteMarkScheme(part.markScheme, subjectId)) {
    failures.push({ kind: "generic-fallback", detail: "The mark scheme does not contain concrete, independently awardable subject evidence." });
  }
  if (!hasCommandWord) {
    failures.push({ kind: "demand-evidence", detail: "A substantive cell needs an explicit subject command such as calculate, explain, compare or define." });
  }

  for (const phrase of GENERIC_FALLBACK_PHRASES) {
    if (phrase.test(text)) {
      // A real prompt may explicitly enumerate the operating conditions and
      // then refer back to them in the solution. That is self-contained; the
      // failure is reserved for an uninstantiated “stated conditions” cue.
      if (/\bstated conditions?\b/i.test(text) && /(?:assuming|constant|fixed|provided|under|at\s+\w+|no\s+interfering|controlled)/i.test(text)) continue;
      if (fallbackPhraseIsInstantiated(phrase, prompt, text, subjectId)) continue;
      failures.push({ kind: "generic-fallback", detail: "Prompt, scheme or worked answer still contains placeholder/meta wording." });
      break;
    }
  }
  if (/\bstated conditions?\b/i.test(text) &&
      !/(?:assuming|constant|fixed|provided|under|at\s+\w+|no\s+interfering|controlled)/i.test(text)) {
    failures.push({ kind: "generic-fallback", detail: "The solution refers to stated conditions that the standalone prompt does not define." });
  }

  const refersToDataArtifact = /\b(?:graph|table|dataset|data\s+set|diagram|figure|apparatus|spectrum|micrograph|chromatogram|circuit)\b|\b(?:the|stated|displayed|supplied)\s+data\b/i.test(prompt) ||
    /\b(?:use|from|analyse|analyze|interpret|read)\s+(?:the\s+)?(?:data|graph|table|diagram|figure|spectrum|micrograph)\b/i.test(prompt);
  // “the graph shown below” is still only a reference: unless the prompt
  // carries values, coordinates, table delimiters or an explicit numeric
  // figure description, the student cannot answer from this text alone.
  const hasDataArtifact = /(?:\bx\s*=|\by\s*=|\|\s*|\t|(?:values?|points?)\s*(?:are|=)\s*[-+]?\d|(?:graph|plot|figure|table|diagram|spectrum|micrograph)\s*(?:contains?|shows?|gives?|has)\s*[-+]?\d)/i.test(prompt);
  // Numeric measurements can be the data themselves; a graph/table still
  // needs an actual representation or explicit values rather than a bare
  // reference. This distinction avoids penalising a sentence such as “the
  // supplied data change from 4.0 to 5.5 mg”.
  const hasInlineData = /\b(?:the|stated|displayed|supplied)\s+data\b/i.test(prompt) && /\d/.test(prompt);
  // A compact equation or measured value can be the representation from
  // which a graph/table is reconstructed. It counts as supplied evidence,
  // while a bare “use the graph” sentence (with no values or relation) still
  // fails the standalone gate.
  const hasInlineNumericData = /\d/.test(prompt) && /(?:=|,|;|%|\b(?:mg|μm|μmol|ng|cm|mm|s|mol|K|°C|units?)\b)/i.test(prompt);
  if (refersToDataArtifact && !hasDataArtifact && !hasInlineData && !hasInlineNumericData) {
    failures.push({ kind: "not-self-contained", detail: "The prompt refers to a graph, table or data set that is not supplied." });
  }
  if (/\bstated value\b/i.test(prompt) && !hasConcreteStructure(prompt)) {
    failures.push({ kind: "not-self-contained", detail: "The prompt refers to a stated value without supplying it." });
  }
  if (/\b(?:the|a|an|this|that) relationship\b/i.test(prompt) && !/(?:=|equation|formula|between\s+\w+\s+and\s+\w+)/i.test(prompt)) {
    failures.push({ kind: "not-self-contained", detail: "The relationship to be used is not defined in the prompt." });
  }
  if (/\b(?:target value|target quantity|target result|to the target)\b/i.test(prompt)) {
    failures.push({ kind: "not-self-contained", detail: "The requested target is not concretely named." });
  }
  if (/\b(?:calculate|find|determine|obtain|report|give|show|derive|solve|predict)\b[^.\n]{0,70}\b(?:the|a|an)\s+(?:value|quantity|result|answer|amount|number|change|effect)\b/i.test(prompt) &&
      !hasSpecificTarget(prompt)) {
    failures.push({ kind: "not-self-contained", detail: "The command names only a generic value or result; specify the target quantity or variable." });
  }
  if (/\b(?:stated|specified|given|described)\s+(?:temperature|pH|concentration|pressure|volume|mass|condition|conditions?|value|constant)\b/i.test(prompt) &&
      !hasInlineQuantityOrRepresentation(prompt)) {
    failures.push({ kind: "not-self-contained", detail: "The prompt relies on an experimental condition or value that is not supplied." });
  }
  if (/\b(?:under|with|using|from)\s+(?:the\s+)?(?:same|given|stated|specified|above)\s+(?:condition|conditions|parameter|parameters|value|data)\b/i.test(prompt) &&
      !/(?:assuming|constant|fixed|controlled|pH\s*=|temperature\s*=|pressure\s*=|volume\s*=|mass\s*=|\d)/i.test(prompt)) {
    failures.push({ kind: "not-self-contained", detail: "The prompt relies on conditions or data referred to elsewhere rather than supplying them." });
  }
  if (/\b(?:the|a|an)\s+(?:relationship|method|formula|rule|invariant|concept)\b/i.test(prompt) &&
      !/(?:=|equation|formula|rule|law|between\s+\w+\s+and\s+\w+)/i.test(prompt)) {
    failures.push({ kind: "not-self-contained", detail: "The relationship or method is referred to without being defined." });
  }
  if (/\b(?:the|a|an|this|that) (?:organism|compound|variable|context)\b/i.test(prompt) &&
      !/(?:named|[A-Z][a-z]?\d|cell sample|condition [A-Z]|organism\s+[A-Z]|compound\s+[A-Z]|[A-Za-z]\s*=|\b(?:x|y|t|n|r|p)\b)/i.test(prompt)) {
    failures.push({ kind: "not-self-contained", detail: "The prompt refers to an organism, compound, variable, context or sample without identifying it." });
  }
  const undefinedVariable = undefinedVariableReference(prompt, subjectId);
  if (undefinedVariable) failures.push({ kind: "not-self-contained", detail: undefinedVariable });

  if (answerIsMostlyRestatement(prompt, answer)) {
    failures.push({ kind: "solution-substance", detail: "The worked answer largely restates the prompt without solving it." });
  }
  if (!provisionalDepthDraft && repeatsReasoningMetadata(part, answer)) {
    failures.push({ kind: "solution-substance", detail: "The worked answer repeats the reasoning metadata instead of carrying out the authored operation." });
  }
  if (/(?:^|\b)(?:use|apply|choose|trace|check|consider|identify)\b[^.]*\b(?:method|approach|rule|formula|relationship|concept)\b[^.]*$/i.test(answer) && !hasWorkedEvidence(answer)) {
    failures.push({ kind: "solution-substance", detail: "The worked answer describes a method but does not carry it out." });
  }
  if (!provisionalDepthDraft && !solutionUsesPromptEvidence(prompt, answer, demand)) {
    failures.push({ kind: "solution-substance", detail: "The worked answer introduces numerical values without using the quantities supplied by the prompt." });
  }
  const resultRequired = demand && ["application", "calculation", "transfer", "synoptic"].includes(demand);
  const hasDemandResult = provisionalDepthDraft
    ? hasConcreteStructure(answer) || hasResultEvidence(answer)
    : demand === "calculation"
      ? hasInlineQuantityOrRepresentation(answer) && (hasConcreteResultEvidence(answer, subjectId) || /\b(?:therefore|thus|hence|gives?|giving|equals?|obtains?|yields?|about|approximately|factor|percentage|difference|increases?|decreases?|rises?|falls?)\b/i.test(answer))
      : demand === "transfer"
        ? hasTransferAdaptation(prompt, answer, subjectId)
        : demand === "synoptic"
          ? hasSynopticJoin(prompt, answer, subjectId)
          : hasConcreteResultEvidence(answer, subjectId);
  if (resultRequired && !hasDemandResult) {
    failures.push({ kind: "solution-substance", detail: "The worked answer has no explicit result or conclusion." });
  }
  const answerSentences = answer.split(/[.;\n]+/).map((sentence) => sentence.trim()).filter(Boolean);
  const equationSteps = answer.match(/=|≈|≃|->|==>|→|⟶/g)?.length ?? 0;
  const hasWorkingConnector = /\b(?:because|therefore|thus|hence|using|substitut|rearrang|differentiat|integrat|convert|compare|first|then|so|from|before|after)\w*\b/i.test(answer);
  const hasExplicitConclusion = /\b(?:balanced|correct|valid|invalid|consistent|inconsistent|therefore|thus|hence|so)\b/i.test(answer);
  const hasIntermediateReasoning = answerSentences.length >= 2 || equationSteps >= 2 || hasWorkingConnector || (equationSteps >= 1 && hasExplicitConclusion);
  if (demand && demand !== "recall" && part.marks >= 2 && part.markScheme.length >= 2 &&
      (answer.length < 24 || !hasIntermediateReasoning)) {
    failures.push({ kind: "solution-substance", detail: "A multi-mark part needs intermediate reasoning as well as a final statement." });
  }
  // “show” is deliberately excluded here: it also appears in ordinary
  // observation prose (“controls show no change”). Explicit calculation
  // commands, or a separate step cue, are safer indicators of a numerical
  // multi-step task.
  const multiStepCommand = /\b(?:calculate|recalculate|derive|solve|determine|find|estimate|work out|evaluate)\b/i.test(prompt) &&
    (part.marks >= 3 || part.markScheme.length >= 3 || /\b(?:then|first|next|from .* to|using .* and|two[- ]step|multi[- ]step)\b/i.test(prompt));
  if (!provisionalDepthDraft && multiStepCommand && equationSteps < 2 && !hasWorkingConnector && !hasExplicitConclusion && !hasCalculationNarrative(answer)) {
    failures.push({ kind: "solution-substance", detail: "The multi-step task has no checkable intermediate working or first-step reasoning." });
  }

  if (!demand) {
    failures.push({ kind: "demand-evidence", detail: "Assign one of the seven learning demands before counting this cell." });
  } else if (demand === "recall") {
    if (provisionalDepthDraft) return failures;
    if (answer.length < 12 || !hasSubjectSpecificEvidence(answer, subjectId) || !/(?:\b(?:is|are|has|have|means?|defined|rule|law|because|when|if|contains?|consists?|equals?|gives?|requires?|allows?|changes?|from|to|between|same|different|multiply|divide|conditioning|probability)\b|\bP\s*\(|=|→|⟶)/i.test(answer)) {
      failures.push({ kind: "demand-evidence", detail: "Recall must state a precise subject fact or definition." });
    }
  } else if (demand === "explanation") {
    if (provisionalDepthDraft) return failures;
    // The causal chain must be present in the worked answer itself. Looking at
    // prompt + scheme alone lets an answer pass by repeating the question's
    // nouns and a causal keyword without explaining the mechanism.
    if (!hasCausalChain(answer, subjectId)) {
      failures.push({ kind: "demand-evidence", detail: "Explanation must show a subject-specific causal or logical chain." });
    }
  } else if (demand === "application") {
    if (provisionalDepthDraft) return failures;
    if (!hasConcreteApplicationContext(prompt, subjectId) || !hasResultEvidence(answer) || !hasSubjectSpecificEvidence(answer, subjectId)) {
      failures.push({ kind: "demand-evidence", detail: "Application must change a concrete context and reach a stated consequence." });
    }
  } else if (demand === "misconception") {
    if (provisionalDepthDraft) return failures;
    if (!hasMisconceptionClaim(prompt) || !hasRepairEvidence(answer, subjectId)) {
      failures.push({ kind: "demand-evidence", detail: "Misconception work must identify an incorrect claim and explicitly repair it." });
    }
  } else if (demand === "calculation") {
    if (provisionalDepthDraft) return failures;
    if (!hasInlineQuantityOrRepresentation(prompt) || !hasWorkedEvidence(answer) || !hasSubjectSpecificEvidence(answer, subjectId)) {
      failures.push({ kind: "demand-evidence", detail: "Calculation/data work needs supplied quantities or a data representation and checkable working." });
    }
  } else if (demand === "transfer") {
    if (provisionalDepthDraft) return failures;
    if (!hasTransferAdaptation(prompt, answer, subjectId)) {
      failures.push({ kind: "demand-evidence", detail: "Transfer must use a genuinely new representation or context and reach a conclusion." });
    }
  } else if (demand === "synoptic") {
    if (provisionalDepthDraft) return failures;
    const claims = part.learningClaims ?? [];
    const distinctClaims = claims.length >= 2 && promptOverload(claims[0]!, claims[1]!) < 0.85;
    if (!distinctClaims || !hasSynopticJoin(prompt, answer, subjectId)) {
      failures.push({ kind: "demand-evidence", detail: "Synoptic work must combine two independently meaningful capabilities." });
    }
  }

  // Subject-specific minimum structure. These checks complement the detailed
  // correctness validators below; they do not accept a cell solely because it
  // contains a keyword.
  if (subjectId === "wjec-alevel-maths" && demand && demand !== "recall" && !/[=^√]|\b(?:sin|cos|tan|log|ln|vector|probabil|deriv|integrat|gradient|quadratic|inequal)\w*/i.test(text)) {
    failures.push({ kind: "demand-evidence", detail: "Maths work does not expose a checkable mathematical structure." });
  }
  if (subjectId === "wjec-alevel-biology" && ["explanation", "application", "transfer", "synoptic"].includes(demand ?? "") && !hasCausalChain(text, subjectId)) {
    failures.push({ kind: "demand-evidence", detail: "Biology work needs named structures/processes linked by a causal mechanism." });
  }
  if (subjectId === "wjec-alevel-chemistry" && demand && !/(?:[A-Z][a-z]?\d?|ion|atom|mole|mol|bond|electron|equilibrium|acid|base|reaction|concentration|oxid|reduc|pH|Kc|Kp)/i.test(text)) {
    failures.push({ kind: "demand-evidence", detail: "Chemistry work does not name a checkable species, relation or particle model." });
  }

  // `question` is retained in the signature so callers can add provenance to
  // future diagnostics without changing the public gate API.
  void question;
  return failures;
}

function variableNames(expression: string): string[] {
  return [...new Set((expression.match(/[a-z]/gi) ?? []).map((name) => name.toLowerCase()))].sort();
}

function looksLikeIdentity(left: string, right: string): boolean {
  const leftVars = variableNames(left);
  const rightVars = variableNames(right);
  if (!leftVars.length || leftVars.join(",") !== rightVars.join(",")) return false;
  // Assignments such as y = 2x + 1 are definitions, not identities.  An
  // identity has a non-trivial expression on both sides with the same symbols.
  const nonTrivial = (value: string): boolean => /[+*/^()]/.test(value) || /\d/.test(value);
  return nonTrivial(left) && nonTrivial(right) && !/^\s*[a-z]\s*$/i.test(left);
}

/** Equality relations whose two sides are intended to be algebraically equal. */
function equalityCandidates(text: string): Array<[string, string]> {
  const candidates: Array<[string, string]> = [];
  const relation = /(?:^|[\n.;])\s*([^=\n.;]{1,100})=([^=\n.;]{1,100})(?=$|[\n.;])/g;
  for (const match of text.replace(/[−–—]/g, "-").matchAll(relation)) {
    const left = (match[1] ?? "").replace(/^.*:\s*/, "").trim();
    const right = (match[2] ?? "").replace(/[,:].*$/, "").trim();
    if (left && right && looksLikeIdentity(left, right)) candidates.push([left, right]);
  }
  return candidates;
}

function signedCoefficient(raw: string | undefined): number {
  const value = (raw ?? "").replace(/\s+/g, "");
  if (!value || value === "+") return 1;
  if (value === "-") return -1;
  return Number(value);
}

/** Check the common monomial derivative form without guessing unsupported syntax. */
function monomialDerivativeMismatch(text: string): string | null {
  const source = text.match(/\bf\(\s*x\s*\)\s*=\s*([+-]?\s*\d+(?:\.\d+)?)?\s*x\s*(?:\^|²)\s*(\d+)/i);
  const derivative = text.match(/\bf['′]\(\s*x\s*\)\s*=\s*([+-]?\s*\d+(?:\.\d+)?)?\s*x(?:\s*(?:\^|²)\s*(\d+))?/i);
  if (!source || !derivative) return null;
  const coefficient = signedCoefficient(source[1]);
  const exponent = Number(source[2]);
  const expectedCoefficient = coefficient * exponent;
  const actualCoefficient = signedCoefficient(derivative[1]);
  const actualExponent = derivative[2] ? Number(derivative[2]) : 1;
  if (actualCoefficient !== expectedCoefficient || actualExponent !== exponent - 1) {
    return `For f(x) = ${coefficient}x^${exponent}, the derivative should be ${expectedCoefficient}x^${exponent - 1}.`;
  }
  return null;
}

function signedInteger(raw: string | undefined, defaultValue = 0): number {
  const value = (raw ?? "").replace(/\s+/g, "");
  if (!value || value === "+") return defaultValue;
  if (value === "-") return -1;
  return Number(value);
}

/** Recompute a plainly written quadratic only when the task asks for roots. */
function quadraticRootMismatch(prompt: string, answer: string): string | null {
  if (!/\b(?:solve|root|roots|zeroes|zeros)\b/i.test(prompt)) return null;
  const match = prompt.match(/\b([+-]?\d*)\s*x\s*(?:\^\s*2|²)\s*([+-]\s*\d*)\s*x\s*([+-]\s*\d+)\s*=\s*0\b/i);
  if (!match) return null;
  const a = signedInteger(match[1], 1);
  const b = signedInteger(match[2]);
  const c = signedInteger(match[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || a === 0) return null;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return /(?:no|not)\s+real\s+root/i.test(answer) ? null : "The quadratic has no real roots because its discriminant is negative.";
  }
  const roots = [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)]
    .sort((left, right) => left - right);
  const reported = [...answer.matchAll(/\bx\s*=\s*([+-]?\d+(?:\.\d+)?)/gi)]
    .map((item) => Number(item[1]))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (reported.length < roots.length) return null;
  const tolerance = 1e-8;
  const matches = roots.every((root, index) => Math.abs(root - (reported[index] ?? Number.NaN)) <= tolerance);
  if (matches || /(?:not|incorrect|wrong|reject|should be|no real)/i.test(answer)) return null;
  return `The reported roots do not solve ${a}x² ${b >= 0 ? "+" : "−"} ${Math.abs(b)}x ${c >= 0 ? "+" : "−"} ${Math.abs(c)} = 0.`;
}

/** Check a single power-rule integral while leaving substitutions and parts to review. */
function monomialIntegralMismatch(prompt: string, answer: string): string | null {
  if (!/(?:∫|\bintegrat(?:e|ing)?\b)/i.test(prompt)) return null;
  const source = prompt.match(/∫\s*([+-]?\s*\d+(?:\.\d+)?)?\s*x\s*(?:\^\s*|²\s*)(\d+)\s*d?x/i);
  if (!source) return null;
  const coefficient = signedCoefficient(source[1]);
  const exponent = Number(source[2]);
  const expectedCoefficient = coefficient / (exponent + 1);
  const reported = answer.match(/(?:=|equals?)\s*([+-]?\s*\d+(?:\.\d+)?)?\s*x\s*(?:\^\s*|²\s*)(\d+)/i);
  if (!reported) return null;
  const actualCoefficient = signedCoefficient(reported[1]);
  const actualExponent = Number(reported[2]);
  if (Math.abs(actualCoefficient - expectedCoefficient) < 1e-10 && actualExponent === exponent + 1) return null;
  if (/(?:not|incorrect|wrong|should be|reject)/i.test(answer)) return null;
  return `The antiderivative of ${coefficient}x^${exponent} is ${expectedCoefficient}x^${exponent + 1} + C.`;
}

/** Recompute a plainly stated linear root when the answer reports x = value. */
function linearRootMismatch(prompt: string, answer: string): string | null {
  if (!/\b(?:solve|root|find|determine)\b/i.test(prompt) || /(?:\^\s*2|²)/.test(prompt)) return null;
  const match = prompt.match(/\b([+-]?\s*\d*)\s*x\s*([+-]\s*\d+(?:\.\d+)?)\s*=\s*([+-]?\s*\d+(?:\.\d+)?)\b/i);
  if (!match) return null;
  const coefficient = signedCoefficient(match[1]);
  const intercept = Number(match[2]!.replace(/\s+/g, ""));
  const rhs = Number(match[3]!.replace(/\s+/g, ""));
  if (!Number.isFinite(coefficient) || coefficient === 0 || !Number.isFinite(intercept) || !Number.isFinite(rhs)) return null;
  const expected = (rhs - intercept) / coefficient;
  const reported = answer.match(/\bx\s*=\s*([+-]?\d+(?:\.\d+)?)/i);
  if (!reported) return null;
  const actual = Number(reported[1]);
  if (!Number.isFinite(actual) || Math.abs(actual - expected) < 1e-9 || /(?:not|incorrect|wrong|reject|should be|no solution)/i.test(answer)) return null;
  return `The reported root x = ${actual} does not solve the stated linear equation; x should be ${expected}.`;
}

/** Detect the common left/right and scale reversals in graph transformations. */
function graphTransformationMismatch(prompt: string, answer: string): string | null {
  const shift = prompt.match(/f\(\s*x\s*([+-])\s*(\d+(?:\.\d+)?)\s*\)/i);
  if (shift) {
    const expected = shift[1] === "+" ? "left" : "right";
    const direction = answer.match(/\bshift(?:s|ed)?\s+(left|right)\b/i)?.[1]?.toLowerCase();
    if (direction && direction !== expected && !/(?:not|incorrect|wrong|correct|should be|rather)/i.test(answer)) {
      return `f(x ${shift[1]} ${shift[2]}) shifts the graph ${expected}, not ${direction}.`;
    }
  }
  const scale = prompt.match(/f\(\s*(\d+(?:\.\d+)?)\s*x\s*\)/i);
  if (scale) {
    const factor = Number(scale[1]);
    const reported = answer.match(/\b(?:horizontal|x[- ]?scale|scale)\b[^.\n]*(?:1\s*\/\s*)?(\d+(?:\.\d+)?)/i);
    if (factor > 1 && reported && /(?:horizontal|x[- ]?scale)/i.test(answer) && !/1\s*\//.test(answer) && !/(?:not|incorrect|wrong|correct|should be)/i.test(answer)) {
      return `f(${factor}x) has horizontal scale factor 1/${factor}; multiplying x-coordinates by ${factor} is the inverse transformation.`;
    }
  }
  return null;
}

/** Recompute a 2-D vector dot product when both vectors are written plainly. */
function vectorDotMismatch(prompt: string, answer: string): string | null {
  if (!/(?:dot|scalar)\s+product|[·⋅]/i.test(prompt)) return null;
  const vectors = [...prompt.matchAll(/\b([abuv])\s*=\s*\(?\s*([+-]?\d+(?:\.\d+)?)\s*[,;]\s*([+-]?\d+(?:\.\d+)?)\s*\)?/gi)];
  if (vectors.length < 2) return null;
  const first = vectors[0]!;
  const second = vectors[1]!;
  const expected = Number(first[2]) * Number(second[2]) + Number(first[3]) * Number(second[3]);
  if (!Number.isFinite(expected)) return null;
  const reported = answer.match(/(?:dot|scalar)?\s*product[^=]*=\s*([+-]?\d+(?:\.\d+)?)/i) ?? answer.match(/[abuv]\s*[·⋅]\s*[abuv]\s*=\s*([+-]?\d+(?:\.\d+)?)/i);
  if (!reported) return null;
  const actual = Number(reported[1]);
  if (!Number.isFinite(actual) || Math.abs(actual - expected) < 1e-9 || /(?:not|incorrect|wrong|correct|should be|reject)/i.test(answer)) return null;
  return `The vector dot product should be ${expected}; multiply corresponding components and add.`;
}

/** Detect a wrong independent-event product without trying to infer unknown probabilities. */
function probabilityProductMismatch(prompt: string, answer: string): string | null {
  if (!/\b(?:independent|independence)\b/i.test(prompt)) return null;
  if (/P\s*\(\s*A\s*∩\s*B\s*\)\s*=\s*P\s*\(\s*A\s*\)\s*[+−-]\s*P\s*\(\s*B\s*\)/i.test(answer) &&
      !/(?:not|incorrect|wrong|correct|should be|reject)/i.test(answer)) {
    return "For independent events P(A ∩ B) = P(A)P(B), not the sum of the two probabilities.";
  }
  return null;
}

/** Recompute a plainly stated SUVAT velocity or displacement. */
function suvatMismatch(prompt: string, answer: string): string | null {
  if (!/\b(?:suvat|v\s*=\s*u\s*\+\s*a\s*t|s\s*=\s*u\s*t)/i.test(prompt)) return null;
  const value = (symbol: string): number | null => {
    const match = prompt.match(new RegExp(`\\b${symbol}\\s*=\\s*([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))`, "i"));
    const parsed = match ? Number(match[1]) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : null;
  };
  const u = value("u");
  const a = value("a");
  const t = value("t");
  if (u === null || a === null || t === null) return null;
  const velocity = answer.match(/\bv\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
  if (velocity && /(?:v\s*=\s*u\s*\+\s*a\s*t|velocity|final speed)/i.test(prompt)) {
    const expected = u + a * t;
    const actual = Number(velocity[1]);
    if (Number.isFinite(actual) && Math.abs(actual - expected) > 1e-9 && !/(?:not|incorrect|wrong|correct|should be|reject)/i.test(answer)) {
      return `Using v = u + at, the final velocity should be ${expected}, not ${actual}.`;
    }
  }
  const displacement = answer.match(/\bs\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
  if (displacement && /(?:s\s*=\s*u\s*t|displacement|distance)/i.test(prompt)) {
    const expected = u * t + 0.5 * a * t * t;
    const actual = Number(displacement[1]);
    if (Number.isFinite(actual) && Math.abs(actual - expected) > 1e-9 && !/(?:not|incorrect|wrong|correct|should be|reject)/i.test(answer)) {
      return `Using s = ut + ½at², the displacement should be ${expected}, not ${actual}.`;
    }
  }
  return null;
}

/** Recompute a simple arithmetic mean when the data are written inline. */
function arithmeticMeanMismatch(prompt: string, answer: string): string | null {
  if (!/\b(?:mean|average)\b/i.test(prompt)) return null;
  const data = prompt.match(/\b(?:data(?:\s+set)?|values?|observations?)\b[^\d-]*((?:-?\d+(?:\.\d+)?\s*[,;]\s*)+-?\d+(?:\.\d+)?)/i);
  if (!data) return null;
  const values = data[1]!.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (values.length < 2 || values.some((value) => !Number.isFinite(value))) return null;
  const reported = answer.match(/\b(?:mean|average)\s*=\s*(-?\d+(?:\.\d+)?)/i);
  if (!reported) return null;
  const expected = values.reduce((sum, value) => sum + value, 0) / values.length;
  const actual = Number(reported[1]);
  if (!Number.isFinite(actual) || Math.abs(actual - expected) < 1e-9 || /(?:not|incorrect|wrong|correct|should be|reject)/i.test(answer)) return null;
  return `The arithmetic mean of ${values.join(", ")} is ${expected}, not ${actual}.`;
}

/** Recompute the small log/exponential equations commonly used in a quality row. */
function logExponentialMismatch(prompt: string, answer: string): string | null {
  const reported = answer.match(/\bx\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
  if (!reported) return null;
  const actual = Number(reported[1]);
  if (!Number.isFinite(actual)) return null;
  let expected: number | null = null;
  let relation = "the logarithmic equation";
  const ln = prompt.match(/\bln\s*\(\s*x\s*\)\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
  if (ln) {
    expected = Math.exp(Number(ln[1]));
    relation = `ln(x) = ${ln[1]}`;
  }
  const log10 = prompt.match(/\blog(?:10)?\s*\(\s*x\s*\)\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
  if (!expected && log10 && /log10/i.test(log10[0])) {
    expected = 10 ** Number(log10[1]);
    relation = `log₁₀(x) = ${log10[1]}`;
  }
  const exponential = prompt.match(/\be\s*(?:\^|\u005e)\s*x\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
  if (!expected && exponential) {
    const rhs = Number(exponential[1]);
    if (rhs > 0) expected = Math.log(rhs);
    relation = `e^x = ${exponential[1]}`;
  }
  if (expected === null || !Number.isFinite(expected)) return null;
  const tolerance = Math.max(1e-8, Math.abs(expected) * 1e-6);
  if (Math.abs(actual - expected) <= tolerance || /(?:not|incorrect|wrong|reject|should be|no solution)/i.test(answer)) return null;
  return `For ${relation}, x should be approximately ${expected}, not ${actual}.`;
}

/** Check gradient, distance or midpoint from two explicitly supplied points. */
function coordinateGeometryMismatch(prompt: string, answer: string): string | null {
  const points = [...prompt.matchAll(/\b([A-Z])\s*\(\s*([+-]?\d+(?:\.\d+)?)\s*[,;]\s*([+-]?\d+(?:\.\d+)?)\s*\)/g)];
  if (points.length < 2) return null;
  const [, , ax, ay] = points[0]!;
  const [, , bx, by] = points[1]!;
  const x1 = Number(ax); const y1 = Number(ay); const x2 = Number(bx); const y2 = Number(by);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  let expected: number | null = null;
  let label = "the coordinate result";
  if (/\bmid-?point\b/i.test(prompt)) {
    // A midpoint has two coordinates; compare both when they are reported.
    const pair = answer.match(/(?:midpoint|mid-point)[^=(]*=\s*\(?\s*([+-]?\d+(?:\.\d+)?)\s*[,;]\s*([+-]?\d+(?:\.\d+)?)\s*\)?/i);
    if (!pair) return null;
    const mx = Number(pair[1]); const my = Number(pair[2]);
    const ex = (x1 + x2) / 2; const ey = (y1 + y2) / 2;
    if (Math.abs(mx - ex) <= 1e-9 && Math.abs(my - ey) <= 1e-9) return null;
    if (/(?:not|incorrect|wrong|reject|should be)/i.test(answer)) return null;
    return `The midpoint should be (${ex}, ${ey}), not (${mx}, ${my}).`;
  }
  const numeric = answer.match(/(?:gradient|slope|distance|length)[^=]*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
  if (!numeric) return null;
  const actual = Number(numeric[1]);
  if (!Number.isFinite(actual) || /(?:not|incorrect|wrong|reject|should be)/i.test(answer)) return null;
  if (/\b(?:gradient|slope)\b/i.test(prompt)) {
    if (x2 === x1) return null;
    expected = (y2 - y1) / (x2 - x1);
    label = "the gradient";
  } else if (/\b(?:distance|length)\b/i.test(prompt)) {
    expected = Math.hypot(x2 - x1, y2 - y1);
    label = "the distance";
  }
  if (expected === null) return null;
  const tolerance = Math.max(1e-8, Math.abs(expected) * 1e-6);
  return Math.abs(actual - expected) <= tolerance ? null : `${label} should be ${expected}, not ${actual}.`;
}

/** Detect an extraneous root in the common square-root equation form. */
function radicalExtraneousMismatch(prompt: string, answer: string): string | null {
  const equation = prompt.replace(/[−–—]/g, "-").match(/(?:√|sqrt\s*\()\s*\(?\s*x\s*([+-])\s*(\d+(?:\.\d+)?)\s*\)?\s*(?:\)|)\s*=\s*x\s*([+-])\s*(\d+(?:\.\d+)?)/i);
  if (!equation) return null;
  const a = (equation[1] === "+" ? 1 : -1) * Number(equation[2]);
  const b = (equation[3] === "+" ? 1 : -1) * Number(equation[4]);
  const B = -(2 * b + 1);
  const C = b * b - a;
  const discriminant = B * B - 4 * C;
  if (discriminant < 0) return null;
  const roots = [...answer.matchAll(/\bx\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/gi)].map((match) => Number(match[1]));
  if (!roots.length || roots.some((value) => !Number.isFinite(value))) return null;
  const invalid = roots.find((root) => root - b < -1e-8 || root + a < -1e-8 || Math.abs(Math.sqrt(Math.max(0, root + a)) - (root - b)) > 1e-6);
  if (invalid === undefined || /(?:extraneous|reject|invalid|not a solution|should be)/i.test(answer)) return null;
  return `x = ${invalid} is extraneous: it does not satisfy the original square-root equation after checking its domain.`;
}

function biologyStructureFunctionWarning(prompt: string, answer: string): string | null {
  if (!/\b(?:structure|structural|shape)\b[^.\n]{0,80}\bfunction\b|\bfunction\b[^.\n]{0,80}\b(?:structure|shape)\b/i.test(prompt)) return null;
  const namedStructure = /\b(?:membrane|active\s*site|enzyme|protein|phospholipid|organelle|xylem|phloem|chloroplast|mitochondri(?:on|a)|ribosome|cell\s+wall|DNA|RNA|tissue|vessel|microvilli)\b/i.test(answer);
  const functionalLink = /\b(?:because|allows?|enables?|prevents?|maintains?|increases?|reduces?|binds?|fits?|diffuses?|transports?|catalys|supports?|provides?|facilitates?|adapted|suited|so that)\w*\b/i.test(answer);
  return namedStructure && functionalLink ? null : "The structure/function conclusion needs a named biological feature linked to the function it enables or limits.";
}

function biologyPracticalEvidenceWarning(prompt: string, answer: string): string | null {
  if (!/\b(?:design|plan|propose|investigate|method|experiment|test whether|how would you)\b/i.test(prompt)) return null;
  const evidence = [
    /\bindependent\s+variable\b|\bIV\b/i.test(answer),
    /\bdependent\s+variable\b|\bDV\b/i.test(answer),
    /\bcontrol(?:led|s)?\b|\bconstant\b/i.test(answer),
    /\brepeat|replicat|sample\s+size|mean|uncertaint|error\s+bar/i.test(answer),
  ].filter(Boolean).length;
  return evidence >= 2 ? null : "A biological practical answer should identify variables/controls and replication or uncertainty evidence.";
}

function biologyAlternativeExplanationWarning(prompt: string, answer: string): string | null {
  if (!/\b(?:evaluate|conclude|does|whether|correlation|data|results?|assay|experiment|investigation)\b/i.test(prompt)) return null;
  if (/\b(?:alternative|confound|control|uncertain|uncertaint|replicat|sample\s+size|correlat|cannot\s+(?:prove|show)|limited|other\s+explanation)\b/i.test(answer)) return null;
  return "Interpretation of biological data should state uncertainty, controls or an alternative explanation before claiming a mechanism.";
}

function biologyEnzymeReasoningWarning(prompt: string, answer: string): string | null {
  if (!/\benzyme\b/i.test(prompt) || !/\b(?:temperature|pH|substrate|inhib|rate|optimum|denatur)\w*\b/i.test(prompt)) return null;
  if (/\b(?:active\s*site|denatur|collision|kinetic|substrate|catalys|tertiary|shape|enzyme[- ]substrate|rate)\w*\b/i.test(answer)) return null;
  return "The enzyme explanation should connect the changed condition to active-site structure, collisions or catalytic rate.";
}

function validateMathsPart(question: Question, part: QuestionPart, issues: SubjectAssessmentIssue[]): void {
  const text = partText(part);
  const advisoryChecksEnabled = !(question.source === "generated" && question.verification === "unverified");
  // The legacy generated depth migration pack has concrete setups but its
  // worked routes are deliberately provisional.  Deterministic validators
  // must not mistake those scaffold answers for authored mathematics (for
  // example, a generic distance result paired with unrelated generated
  // coordinates).  Structural/substantive gates still run, and authored
  // rows—including other unverified drafts—remain fully audited.
  const provisionalDepthDraft = isGeneratedDepthDraft(question);
  for (const [left, right] of equalityCandidates(text)) {
    const comparison = mathsEquivalent(left, right);
    if (comparison === "not-equivalent") {
      addIssue(issues, question, part, "maths-equivalence", "error", `Algebraic identity is not equivalent: ${left} = ${right}.`);
    }
  }

  const derivativeMismatch = monomialDerivativeMismatch(text);
  if (derivativeMismatch) addIssue(issues, question, part, "maths-calculus", "error", derivativeMismatch);
  const rootsMismatch = quadraticRootMismatch(part.prompt, part.modelAnswer);
  if (rootsMismatch) addIssue(issues, question, part, "maths-equivalence", "error", rootsMismatch);
  const linearMismatch = linearRootMismatch(part.prompt, part.modelAnswer);
  if (linearMismatch) addIssue(issues, question, part, "maths-equivalence", "error", linearMismatch);
  const integralMismatch = monomialIntegralMismatch(part.prompt, part.modelAnswer);
  if (integralMismatch) addIssue(issues, question, part, "maths-calculus", "error", integralMismatch);
  const transformMismatch = graphTransformationMismatch(part.prompt, part.modelAnswer);
  if (transformMismatch) addIssue(issues, question, part, "maths-equivalence", "error", transformMismatch);
  const vectorMismatch = vectorDotMismatch(part.prompt, part.modelAnswer);
  if (vectorMismatch) addIssue(issues, question, part, "maths-equivalence", "error", vectorMismatch);
  const probabilityMismatch = probabilityProductMismatch(part.prompt, part.modelAnswer);
  if (probabilityMismatch) addIssue(issues, question, part, "maths-equivalence", "error", probabilityMismatch);
  const suvatError = suvatMismatch(part.prompt, part.modelAnswer);
  if (suvatError) addIssue(issues, question, part, "maths-mechanics", "error", suvatError);
  const meanError = arithmeticMeanMismatch(part.prompt, part.modelAnswer);
  if (meanError) addIssue(issues, question, part, "maths-statistics", "error", meanError);
  const logError = logExponentialMismatch(part.prompt, part.modelAnswer);
  if (logError) addIssue(issues, question, part, "maths-equivalence", "error", logError);
  if (!provisionalDepthDraft) {
    const coordinateError = coordinateGeometryMismatch(part.prompt, part.modelAnswer);
    if (coordinateError) addIssue(issues, question, part, "maths-equivalence", "error", coordinateError);
  }
  const radicalError = radicalExtraneousMismatch(part.prompt, part.modelAnswer);
  if (radicalError) addIssue(issues, question, part, "maths-domain", "error", radicalError);
  if (/∫\s*1\s*\/\s*x\b/i.test(text) && /(?:=|equals?)\s*1\s*\/\s*x\s*(?:\^|²)?\s*2\b/i.test(text) && !/ln\s*\|?x\|?/i.test(text)) {
    addIssue(issues, question, part, "maths-calculus", "error", "The integral of 1/x must use ln|x| + c, not a power-rule result.");
  }
  if (/(?:sin|cos)\s*[²2]\s*x\s*\+\s*(?:cos|sin)\s*[²2]\s*x/i.test(text) &&
      /(?:=|equals?)\s*2\b/i.test(text) && !/(?:not|incorrect|wrong|reject|should be 1)/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "maths-equivalence", "error", "The Pythagorean identity sin²x + cos²x equals 1, not 2.");
  }
  if (/(?:1\s*[-−]\s*cos\s*[²2]\s*x|1\s*[-−]\s*sin\s*[²2]\s*x)/i.test(text) &&
      /(?:=|equals?)\s*2\b/i.test(text) && !/(?:not|incorrect|wrong|reject|should be)/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "maths-equivalence", "error", "The complementary squared trigonometric identity must equal the other squared function, not 2.");
  }
  if (/P\s*\(\s*A\s*\|\s*B\s*\)\s*=\s*P\s*\([^)]*∩[^)]*\)\s*\/\s*P\s*\(\s*A\s*\)/i.test(text) &&
      !/(?:not|incorrect|wrong|correct denominator|should be)/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "maths-equivalence", "error", "Conditional probability P(A|B) is divided by P(B), not P(A).");
  }
  if (/\bx\s*>\s*0\b/i.test(part.prompt) && /\bx\s*=\s*-\s*\d/i.test(part.modelAnswer) &&
      !/(?:reject|invalid|outside|not allowed|cannot)/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "maths-domain", "error", "The worked answer uses a root outside the stated x > 0 domain.");
  }

  if (advisoryChecksEnabled && /\b(?:ln|log|sqrt)\b|√/.test(text) && !/(?:domain|positive|x\s*[>≥]|argument|defined)/i.test(text)) {
    addIssue(issues, question, part, "maths-domain", "warning", "A logarithm or square root is used without an explicit domain condition.");
  }
  if (advisoryChecksEnabled && /\b(?:give|state|find|leave|write|express)\b[^.\n]{0,36}\bexact(?:\s+(?:answer|form|result|value))?\b/i.test(part.prompt) && /\b\d+\.\d+\b/.test(part.modelAnswer) && !/[√π]|fraction|surd/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "maths-exact-form", "warning", "The prompt requests an exact result but the worked answer appears decimal-only.");
  }
  if (advisoryChecksEnabled && /\b(?:differentiat|derivative|integrat|antiderivative|gradient)\w*\b/i.test(text) &&
      /\b(?:therefore|hence|so)\b/i.test(part.prompt) && !/[=→]/.test(part.modelAnswer)) {
    addIssue(issues, question, part, "maths-calculus", "warning", "A calculus conclusion has no explicit symbolic result to check.");
  }
}

function validateBiologyPart(question: Question, part: QuestionPart, issues: SubjectAssessmentIssue[]): void {
  const text = partText(part);
  const answer = part.modelAnswer;
  const advisoryChecksEnabled = !(question.source === "generated" && question.verification === "unverified");
  const suspiciousContradiction = text.split(/[.!?;\n]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .some((sentence) => {
      const hasIncrease = /\bincreas(?:e|es|ed|ing)\b/i.test(sentence);
      const hasDecrease = /\bdecreas(?:e|es|ed|ing)\b/i.test(sentence);
      // A causal or conditional chain can legitimately move up and then down
      // (feedback, denaturation, dose-response).  Treat a bare same-sentence
      // contradiction as an error and leave nuanced cases to the reviewer.
      const contrasted = /\b(?:whereas|while|respectively|depending|at\s+(?:high|low)|before|after|versus|vs\.?|but|then|because|therefore|so|reducing|towards|above|below|more|fewer|from|to)\b/i.test(sentence);
      return hasIncrease && hasDecrease && !contrasted;
    });
  if (suspiciousContradiction) {
    addIssue(issues, question, part, "biology-contradiction", "error", "The same biological claim contains both an increase and a decrease without a condition or comparison.");
  }

  // Deterministic red flags for high-frequency mechanism reversals. A
  // correction may quote the misconception, so only escalate when the answer
  // presents it as true rather than explicitly rejecting it.
  const correction = /\b(?:not|incorrect|wrong|correct(?:ly)?|instead|rather|cannot|does not|do not|reject|false|although)\b/i.test(answer);
  if (/water\s+(?:moves|flows)\s+from\s+(?:a\s+)?lower\s+water\s+potential\s+to\s+(?:a\s+)?higher\s+water\s+potential/i.test(answer) && !correction) {
    addIssue(issues, question, part, "biology-causal-chain", "error", "Water potential is reversed: net water movement is from higher to lower water potential.");
  }
  if (/diffusion[^.]{0,100}\blow(?:er)?\s+concentration[^.]{0,80}\bhigh(?:er)?\s+concentration/i.test(answer) && !/\b(?:active|ATP|energy|against)\b/i.test(answer)) {
    addIssue(issues, question, part, "biology-causal-chain", "error", "Passive diffusion cannot move a substance up its concentration gradient.");
  }
  if (/\bphotosynthesis\b[^.]{0,80}\bmitochondri(?:a|on)\b/i.test(answer) && !correction) {
    addIssue(issues, question, part, "biology-terminology", "error", "Photosynthesis occurs in chloroplasts; mitochondria are not the photosynthetic organelle.");
  }
  if (/\bxylem\b[^.]{0,80}\bsucrose\b/i.test(answer) && !correction) {
    addIssue(issues, question, part, "biology-terminology", "error", "Sucrose is translocated in phloem; xylem transports water and mineral ions.");
  }
  if (/\bDNA\b[^.]{0,60}\buracil\b/i.test(answer) && !correction) {
    addIssue(issues, question, part, "biology-terminology", "error", "Uracil is the RNA base; DNA uses thymine.");
  }
  if (/\bcorrelation\b[^.]{0,80}\b(?:proves?|therefore|shows?)\b[^.]{0,40}\b(?:cause|causation)\b/i.test(answer) && !correction) {
    addIssue(issues, question, part, "biology-data-interpretation", "error", "Correlation alone does not establish a causal mechanism.");
  }

  // A causal claim from a small practical/data prompt needs a comparison,
  // uncertainty or replication. “Proves”/“definitively caused” is a common
  // exam error and should never be accepted just because the answer names a
  // plausible mechanism.
  if (/\b(?:data|results?|experiment|investigation|assay|sample|graph|table)\b/i.test(part.prompt) &&
      /\b(?:proves?|definit(?:ive|ively)|caused?\s+by|definitive\s+evidence|certainly)\b/i.test(answer) &&
      !/\b(?:supports?|suggests?|uncertain|uncertaint|replicat|control|correlat|cannot\s+(?:prove|show)|alternative|limited|sample\s+size)\b/i.test(answer)) {
    addIssue(issues, question, part, "biology-data-interpretation", "error", "The data support a conclusion only with controls, uncertainty or alternative explanations; they do not prove causation outright.");
  }

  // A few high-frequency structure/function confusions are deterministic and
  // safe to flag. Nuanced responses that explicitly reject the claim are
  // preserved by the correction guard above.
  if (/\bribosome\b[^.]{0,80}\b(?:produces?|stores?|replicates?)\s+(?:ATP|DNA|lipid)/i.test(answer) && !correction) {
    addIssue(issues, question, part, "biology-terminology", "error", "Ribosomes translate mRNA into polypeptides; they do not produce ATP or replicate DNA.");
  }
  if (/\b(?:osmosis|water)\b[^.]{0,100}\b(?:requires?|uses?)\s+ATP/i.test(answer) && !correction) {
    addIssue(issues, question, part, "biology-causal-chain", "error", "Osmosis is passive movement of water down a water-potential gradient and does not directly require ATP.");
  }
  if (/\bchloroplasts?\b[^.]{0,80}\b(?:respiration|ATP\s+production)\b/i.test(answer) && !correction) {
    addIssue(issues, question, part, "biology-terminology", "error", "Aerobic respiration and most ATP production occur in mitochondria; chloroplasts carry out photosynthesis.");
  }

  const causalPrompt = /\b(?:explain|why|predict|evaluate|cause|mechanism|effect)\w*\b/i.test(part.prompt);
  const causalAnswer = /\b(?:because|therefore|so|leads?|caus|result|due to|which means|allows?)\w*\b/i.test(part.modelAnswer);
  if (advisoryChecksEnabled && causalPrompt && !causalAnswer) {
    addIssue(issues, question, part, "biology-causal-chain", "warning", "The answer describes an outcome without an explicit biological causal link.");
  }
  if (advisoryChecksEnabled) {
    const structureFunction = biologyStructureFunctionWarning(part.prompt, answer);
    if (structureFunction) addIssue(issues, question, part, "biology-terminology", "warning", structureFunction);
    const practicalWarning = biologyPracticalEvidenceWarning(part.prompt, answer);
    if (practicalWarning) addIssue(issues, question, part, "biology-practical-design", "warning", practicalWarning);
    const alternativeExplanation = biologyAlternativeExplanationWarning(part.prompt, answer);
    if (alternativeExplanation) addIssue(issues, question, part, "biology-data-interpretation", "warning", alternativeExplanation);
    const enzymeReasoning = biologyEnzymeReasoningWarning(part.prompt, answer);
    if (enzymeReasoning) addIssue(issues, question, part, "biology-causal-chain", "warning", enzymeReasoning);
  }

  // Only raise a practical-design warning when the prompt actually asks for
  // an experimental decision. Merely mentioning an investigation or a
  // measured value is not enough and created a noisy queue for ordinary
  // mechanism/application parts.
  const practicalPrompt = /\b(?:design|plan|experiment|control variable|independent variable|dependent variable|repeat(?:ed|s)?|replicat(?:e|ed|ion)|uncertaint(?:y|ies)|error bar|valid(?:ity)?)\b/i.test(part.prompt);
  const practicalEvidence = /\b(?:control|independent|dependent|variable|repeat|replicat|mean|uncertaint|error bar|axis|sample size|valid)\w*\b/i.test(part.modelAnswer);
  if (advisoryChecksEnabled && practicalPrompt && !practicalEvidence) {
    addIssue(issues, question, part, "biology-practical-design", "warning", "A practical or data claim has no visible control, measurement or uncertainty evidence.");
  }
  if (advisoryChecksEnabled && /\b(?:data|table|graph|percentage|rate|concentration|mass change)\b/i.test(part.prompt) && !/\d|trend|correlat|compar|mean|uncertaint|significant/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "biology-data-interpretation", "warning", "The answer does not cite a measurable trend or comparison for the supplied data demand.");
  }

  // Flag only an explicit terminology collision; ordinary synonyms remain
  // valid because the human reviewer owns final terminology approval.
  if (advisoryChecksEnabled && /\b(?:peptide|glycosidic|phosphodiester|hydrogen) bond\b/i.test(text) &&
      /\b(?:between|formed|joins?)\b/i.test(text) && /\bwrong|incorrect|confus/i.test(text)) {
    addIssue(issues, question, part, "biology-terminology", "warning", "Terminology is called out as a possible bond/structure confusion and needs subject review.");
  }
}

function equationCandidates(text: string): string[] {
  const out: string[] = [];
  // Include charge signs and superscript signs at the end of an ionic
  // species. The previous extractor stopped before a trailing “−”, which
  // meant a charge-imbalanced equation could silently bypass the validator.
  // Requiring each side to begin with a formula token also prevents prose
  // immediately before an arrow (for example “check Fe²⁺ …”) becoming part of
  // the equation passed to the balancer.
  const species = String.raw`(?:\d+\s*)?(?:[A-Z]|e)[A-Za-z0-9()[\]₀-₉⁺⁻+\-^]*`;
  const equation = new RegExp(`(${species}(?:\\s*\\+\\s*${species})*\\s*(?:->|→|⟶|==>)\\s*${species}(?:\\s*\\+\\s*${species})*)`, "g");
  for (const match of text.matchAll(equation)) {
    const value = match[1]?.trim();
    if (value) out.push(value);
  }
  return out;
}

interface IonicSpecies {
  coefficient: number;
  formula: string;
  charge: number;
}

function ionicSpecies(side: string): IonicSpecies[] | null {
  const tokens = side.replace(/\((?:aq|s|l|g)\)/gi, "")
    .replace(/[⁺]/g, "+")
    .replace(/[⁻]/g, "-")
    .split(/\s+\+\s+|\s+\+\s*(?=[A-Z])/)
    .map((token) => token.trim())
    .filter(Boolean);
  const out: IonicSpecies[] = [];
  for (const token of tokens) {
    const coefficientMatch = token.match(/^(\d+)\s*/);
    const coefficient = coefficientMatch ? Number(coefficientMatch[1]) : 1;
    const body = token.replace(/^\d+\s*/, "");
    // Neutral molecules (for example Cl₂ or H₂O) are valid participants in
    // an ionic equation and contribute zero charge. Charged species may use
    // either a bare sign (Cl−) or a magnitude (Fe2+).
    const chargeMatch = body.match(/(\d*)([+-])$/);
    const charge = chargeMatch
      ? (chargeMatch[1] ? Number(chargeMatch[1]) : 1) * (chargeMatch[2] === "+" ? 1 : -1)
      : 0;
    const formula = chargeMatch ? body.slice(0, body.length - chargeMatch[0].length).replace(/\^$/, "") : body;
    if (!formula) return null;
    out.push({ coefficient, formula, charge });
  }
  return out.length ? out : null;
}

/** Atom and charge check for simple ionic equations, including half-equations. */
function ionicEquationUnbalanced(equation: string): "atoms" | "charge" | null {
  const halves = equation.replace(/[⇌⟶]/g, "->").split(/->/);
  if (halves.length !== 2) return null;
  const left = ionicSpecies(halves[0]!);
  const right = ionicSpecies(halves[1]!);
  if (!left || !right) return null;
  // The normal balancer is deliberately conservative. Reconstruct each side
  // for atom counting, but always perform charge accounting independently.
  const cleanLeft = left.filter((item) => item.formula !== "e").map((item) => `${item.coefficient}${item.formula}`).join(" + ");
  const cleanRight = right.filter((item) => item.formula !== "e").map((item) => `${item.coefficient}${item.formula}`).join(" + ");
  if (cleanLeft && cleanRight) {
    const atoms = checkEquationBalance(`${cleanLeft} -> ${cleanRight}`);
    if (atoms && !atoms.ok) return "atoms";
  }
  const leftCharge = left.reduce((sum, item) => sum + item.coefficient * item.charge, 0);
  const rightCharge = right.reduce((sum, item) => sum + item.coefficient * item.charge, 0);
  if (leftCharge !== rightCharge) return "charge";
  return null;
}

/** Compare a plainly stated two-reactant mole ratio with equation coefficients. */
function stoichiometricRatioMismatch(prompt: string, answer: string): string | null {
  if (!/\b(?:ratio|coefficient|stoichiometr)\w*\b/i.test(prompt)) return null;
  const equation = prompt.match(/\b(\d+\s*)?([A-Z][A-Za-z0-9()[\]₀-₉⁺⁻+-]*)\s*\+\s*(\d+\s*)?([A-Z][A-Za-z0-9()[\]₀-₉⁺⁻+-]*)\s*(?:->|→|⟶|⇌)\s*(?:\d+\s*)?[A-Z][A-Za-z0-9()[\]₀-₉⁺⁻+-]*/);
  if (!equation) return null;
  const expectedLeft = Number((equation[1] ?? "1").trim() || 1);
  const expectedRight = Number((equation[3] ?? "1").trim() || 1);
  if (!Number.isFinite(expectedLeft) || !Number.isFinite(expectedRight)) return null;
  const ratio = answer.match(/\b(?:mole\s+)?ratio\b[^.\n]*?(\d+)\s*:\s*(\d+)/i);
  if (!ratio) return null;
  const actualLeft = Number(ratio[1]);
  const actualRight = Number(ratio[2]);
  if (actualLeft * expectedRight === actualRight * expectedLeft) return null;
  if (/(?:not|incorrect|wrong|correct|should be|reject)/i.test(answer)) return null;
  return `The stated mole ratio is ${actualLeft}:${actualRight}, but the equation requires ${expectedLeft}:${expectedRight}.`;
}

/** Check powers in a simple Kc expression against a balanced equation. */
function equilibriumExponentMismatch(prompt: string, answer: string): string | null {
  if (!/\bKc\b/i.test(answer)) return null;
  const equation = prompt.match(/\b(\d+\s*)?([A-Z][A-Za-z0-9]*)\s*\+\s*(\d+\s*)?([A-Z][A-Za-z0-9]*)\s*(?:⇌|->|→)\s*(\d+\s*)?([A-Z][A-Za-z0-9]*)/);
  if (!equation) return null;
  const reactantA = equation[2]!;
  const reactantB = equation[4]!;
  const product = equation[6]!;
  const coefficientA = Number((equation[1] ?? "1").trim() || 1);
  const coefficientB = Number((equation[3] ?? "1").trim() || 1);
  const coefficientProduct = Number((equation[5] ?? "1").trim() || 1);
  const expression = answer.match(/\bKc\s*=\s*([^.;]+)/i)?.[1] ?? "";
  if (!new RegExp(`\\[${product}\\]`, "i").test(expression)) return null;
  const power = (species: string): number => {
    const escaped = species.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = expression.match(new RegExp(`\\[${escaped}\\](?:\\s*(?:\\^|²)\\s*(\\d+))?`, "i"));
    return Number(match?.[1] ?? 1);
  };
  const expected = new Map([[reactantA, coefficientA], [reactantB, coefficientB], [product, coefficientProduct]]);
  for (const [species, exponent] of expected) {
    if (exponent <= 1 || power(species) === exponent) continue;
    if (/(?:not|incorrect|wrong|correct|should be|reject)/i.test(answer)) return null;
    return `The Kc expression must raise [${species}] to power ${exponent}, matching its balanced-equation coefficient.`;
  }
  return null;
}

function normaliseChemicalToken(value: string): string {
  return value
    .replace(/[₀-₉]/g, (digit) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(digit)))
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** Check that a simple Kc numerator/denominator follows the reaction arrow. */
function equilibriumExpressionMismatch(prompt: string, answer: string): string | null {
  if (!/\bKc\b/i.test(answer)) return null;
  const equation = prompt.match(/\b(?:\d+\s*)?([A-Z][A-Za-z0-9₀-₉]*)\s*(?:\+\s*(?:\d+\s*)?([A-Z][A-Za-z0-9₀-₉]*))?\s*(?:⇌|->|→)\s*(?:\d+\s*)?([A-Z][A-Za-z0-9₀-₉]*)/);
  if (!equation) return null;
  const reactants = [equation[1], equation[2]].filter((species): species is string => Boolean(species)).map(normaliseChemicalToken);
  const product = normaliseChemicalToken(equation[3]!);
  const expression = answer.match(/\bKc\s*=\s*([^.;]+)/i)?.[1];
  if (!expression || !expression.includes("/")) return null;
  const [numerator, ...denominatorParts] = expression.split("/");
  const denominator = denominatorParts.join("/");
  const n = normaliseChemicalToken(numerator ?? "");
  const d = normaliseChemicalToken(denominator);
  if (n.includes(product) && reactants.every((species) => d.includes(species))) return null;
  if (/(?:not|incorrect|wrong|correct|should be|reject|reverse)/i.test(answer)) return null;
  return "Kc must place product concentrations in the numerator and reactant concentrations in the denominator, with powers matching the balanced equation.";
}

/** Check charge/electron conservation for a plainly written half-equation. */
function electronBalanceMismatch(answer: string): string | null {
  if (!/(?:e\s*[⁻-]|electron|half[- ]equation)/i.test(answer) || !/(?:->|→|⟶)/.test(answer)) return null;
  const candidate = equationCandidates(answer).find((equation) => /e\s*[⁻-]/i.test(equation));
  if (!candidate) return null;
  const failure = ionicEquationUnbalanced(candidate);
  if (failure !== "charge") return null;
  if (/(?:not|incorrect|wrong|correct|should be|reject)/i.test(answer)) return null;
  return `The half-equation ${candidate} does not conserve charge; add or remove electrons on the side required by the oxidation/reduction change.`;
}

function parseSimpleFormula(value: string): Map<string, number> | null {
  const clean = value.replace(/[⁺⁻+-].*$/, "");
  const matches = [...clean.matchAll(/([A-Z][a-z]?)(\d*)/g)];
  if (!matches.length || matches.map((match) => match[0]).join("") !== clean) return null;
  const counts = new Map<string, number>();
  for (const match of matches) counts.set(match[1]!, (counts.get(match[1]!) ?? 0) + Number(match[2] || 1));
  return counts;
}

/** Recompute a simple C/H/O empirical formula from supplied masses. */
function empiricalFormulaMismatch(prompt: string, answer: string): string | null {
  if (!/\bempirical\s+formula\b/i.test(prompt)) return null;
  const atomicMass: Record<string, number> = { C: 12.011, H: 1.008, O: 15.999, N: 14.007, S: 32.06, Cl: 35.45 };
  const aliases: Record<string, string> = { carbon: "C", hydrogen: "H", oxygen: "O", nitrogen: "N", sulfur: "S", sulphur: "S", chlorine: "Cl" };
  const supplied = new Map<string, number>();
  const addComposition = (label: string, rawMass: string): void => {
    const symbol = aliases[label.toLowerCase()] ?? (label.length <= 2 ? label[0]!.toUpperCase() + label.slice(1).toLowerCase() : label);
    const mass = Number(rawMass);
    if (atomicMass[symbol] && Number.isFinite(mass)) supplied.set(symbol, mass);
  };
  // Authors use both “carbon 24.0 g” and the more common “24.0 g carbon”.
  for (const match of prompt.matchAll(/\b(carbon|hydrogen|oxygen|nitrogen|sul(?:f|ph)ur|chlorine|C|H|O|N|S|Cl)\b[^\d\n]{0,12}([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:g|%)?/gi)) {
    addComposition(match[1]!, match[2]!);
  }
  for (const match of prompt.matchAll(/([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:g|%)?\s*\b(carbon|hydrogen|oxygen|nitrogen|sul(?:f|ph)ur|chlorine|C|H|O|N|S|Cl)\b/gi)) {
    addComposition(match[2]!, match[1]!);
  }
  if (supplied.size < 2) return null;
  const moles = [...supplied.entries()].map(([symbol, mass]) => [symbol, mass / atomicMass[symbol]!] as const);
  const smallest = Math.min(...moles.map(([, amount]) => amount));
  if (!Number.isFinite(smallest) || smallest <= 0) return null;
  const expected = new Map(moles.map(([symbol, amount]) => [symbol, Math.max(1, Math.round(amount / smallest))] as const));
  const formulaMatch = answer.match(/\b(?:empirical\s+formula\s*(?:is|=)?\s*)?([A-Z][A-Za-z]?\d*(?:[A-Z][A-Za-z]?\d*)+)\b/);
  if (!formulaMatch) return null;
  const actual = parseSimpleFormula(formulaMatch[1]!);
  if (!actual) return null;
  const expectedRatios = [...expected.values()];
  const baseExpected = expectedRatios[0] ?? 1;
  const baseActual = actual.get([...expected.keys()][0]!) ?? 0;
  if (baseActual <= 0) return null;
  const proportional = [...expected.entries()].every(([symbol, count]) => Math.abs((actual.get(symbol) ?? 0) / baseActual - count / baseExpected) < 1e-9);
  if (proportional || /(?:not|incorrect|wrong|reject|should be)/i.test(answer)) return null;
  const expectedFormula = [...expected.entries()].map(([symbol, count]) => `${symbol}${count === 1 ? "" : count}`).join("");
  return `The supplied composition gives empirical formula ${expectedFormula}, not ${formulaMatch[1]}.`;
}

function formulaElementCounts(formula: string): Map<string, number> | null {
  const clean = formula.replace(/[⁺⁻+\-](?:\d+)?$/, "").replace(/\^(?:\d+)?[+-]$/, "").replace(/[₀-₉]/g, (digit) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(digit)));
  if (!clean || /[()·.]/.test(clean)) return null;
  const counts = new Map<string, number>();
  let consumed = "";
  for (const match of clean.matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    consumed += match[0];
    counts.set(match[1]!, (counts.get(match[1]!) ?? 0) + Number(match[2] || 1));
  }
  return consumed === clean ? counts : null;
}

/** Solve a simple oxidation-state question from charge balance and common ions. */
function oxidationStateMismatch(prompt: string, answer: string): string | null {
  const target = prompt.match(/\b(?:oxidation state|oxidation number)\s+of\s+([A-Z][a-z]?|oxygen|hydrogen|chlorine|bromine|iodine)\s+in\s+([A-Z][A-Za-z0-9₀-₉⁺⁻+\-^]*)/i);
  if (!target) return null;
  const symbol = ({ oxygen: "O", hydrogen: "H", chlorine: "Cl", bromine: "Br", iodine: "I" } as Record<string, string>)[target[1]!.toLowerCase()] ?? target[1]!;
  const counts = formulaElementCounts(target[2]!);
  if (!counts || !counts.has(symbol)) return null;
  const reported = answer.match(/(?:oxidation state|oxidation number)[^+\-\d]{0,30}([+-]?\d+)/i);
  if (!reported) return null;
  const actual = Number(reported[1]);
  if (!Number.isFinite(actual) || /(?:not|incorrect|wrong|correct|should be)/i.test(answer)) return null;
  const known: Record<string, number> = { H: 1, O: -2, F: -1, Cl: -1, Br: -1, I: -1, Li: 1, Na: 1, K: 1, Mg: 2, Ca: 2, Al: 3 };
  const formulaChargeMatch = target[2]!.match(/(?:\^(\d*)|)([+-])$/);
  const totalCharge = formulaChargeMatch ? (Number(formulaChargeMatch[1] || 1) * (formulaChargeMatch[2] === "+" ? 1 : -1)) : 0;
  let knownTotal = 0;
  for (const [element, count] of counts) {
    if (element === symbol) continue;
    const value = known[element];
    if (value === undefined) return null;
    knownTotal += value * count;
  }
  const expected = (totalCharge - knownTotal) / (counts.get(symbol) ?? 1);
  if (!Number.isFinite(expected) || Math.abs(actual - expected) < 1e-9) return null;
  return `${symbol} in ${target[2]} should have oxidation state ${expected > 0 ? "+" : ""}${expected}.`;
}

function significantFigures(value: string): number {
  const clean = value.replace(/[+\-]/g, "").replace(/^0+(?=\d)/, "");
  const [mantissa] = clean.split(/[eE]/);
  const digits = mantissa!.replace(/\./g, "").replace(/^0+/, "");
  return digits.length;
}

function chemistryPrecisionWarning(prompt: string, answer: string): string | null {
  const request = prompt.match(/\b(?:to|give|state)(?:\s+it)?\s+(\d+)\s+significant\s+figures?\b/i);
  if (!request) return null;
  const target = Number(request[1]);
  const values = [...answer.matchAll(/\b[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\b/g)].map((match) => match[0]);
  const final = values.sort((left, right) => significantFigures(right) - significantFigures(left))[0];
  if (!final || significantFigures(final) <= target) return null;
  return `The reported value ${final} has more than ${target} significant figures; round the final result only after the calculation.`;
}

function acidBasePHMismatch(prompt: string, answer: string): string | null {
  if (!/\bpH\b/i.test(prompt) || !/(?:\[H\+\]|hydrogen\s+ion|strong\s+acid)/i.test(prompt)) return null;
  const concentration = prompt.match(/(?:\[H\+\]|concentration)[^=]*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*[×x]\s*10\s*(?:\^|\*\*)\s*[+-]?\d+)?)/i);
  const answerValue = answer.match(/\bpH\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
  if (!concentration || !answerValue) return null;
  const raw = concentration[1]!.replace(/\s+/g, "");
  const tenPower = raw.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:[×x]10(?:\^|\*\*)([+-]?\d+))?$/i);
  if (!tenPower) return null;
  const c = Number(tenPower[1]) * 10 ** Number(tenPower[2] ?? 0);
  const expected = -Math.log10(c);
  const actual = Number(answerValue[1]);
  if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(actual) || Math.abs(actual - expected) < 0.02 || /(?:not|incorrect|wrong|correct|should be)/i.test(answer)) return null;
  return `For [H⁺] = ${c}, pH should be approximately ${expected.toFixed(2)}.`;
}

/** Recompute n = cV for a plainly stated solution aliquot/titration. */
function solutionAmountMismatch(prompt: string, answer: string): string | null {
  if (!/\b(?:calculate|find|determine|amount|moles?)\b/i.test(prompt) || !/\bn\b/i.test(answer)) return null;
  const concentration = prompt.match(/\b([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*mol\s*dm\s*(?:\^?[-⁻]?3|[-⁻]³)/i);
  const volume = prompt.match(/\b([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*cm\s*(?:\^?3|³)/i);
  if (!concentration || !volume) return null;
  const c = Number(concentration[1]);
  const v = Number(volume[1]);
  const reportedValues = [...answer.matchAll(/\bn\s*=\s*[^=;\n]*?(?:=\s*)?([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*[×x]\s*10\s*(?:\^|\*\*)?\s*[+-]?\d+)?)\s*mol\b/gi)]
    .map((match) => match[1]!.replace(/\s+/g, ""))
    .map((raw) => {
      const power = raw.match(/(?:×|x)10(?:\^|\*\*)([+-]?\d+)$/i);
      return Number(raw.replace(/(?:×|x)10(?:\^|\*\*)[+-]?\d+$/i, "")) * 10 ** Number(power?.[1] ?? 0);
    });
  const actual = reportedValues.at(-1);
  if (!Number.isFinite(c) || !Number.isFinite(v) || actual === undefined) return null;
  const expected = c * v / 1000;
  const tolerance = Math.max(1e-9, Math.abs(expected) * 0.005);
  if (Math.abs(actual - expected) <= tolerance || /(?:not|incorrect|wrong|correct|should be|reject)/i.test(answer)) return null;
  return `Using n = cV with ${v} cm³ = ${(v / 1000).toFixed(5)} dm³, the amount should be ${expected} mol, not ${actual} mol.`;
}

function validateChemistryPart(question: Question, part: QuestionPart, issues: SubjectAssessmentIssue[]): void {
  const text = partText(part);
  const answer = part.modelAnswer;
  const advisoryChecksEnabled = !(question.source === "generated" && question.verification === "unverified");
  const equations = [...new Set([...equationCandidates(text), ...findUnbalancedEquations(text)])];
  for (const equation of equations) {
    const result = checkEquationBalance(equation);
    if (result && !result.ok) {
      addIssue(issues, question, part, "chemistry-equation-balance", "error", `Equation is not atom-balanced: ${equation}.`);
    }
    const ionicFailure = /[⁺⁻]|(?:[A-Za-z0-9)]\s*\^?\s*\d*[+-])(?:\s|$)/.test(equation) ? ionicEquationUnbalanced(equation) : null;
    if (ionicFailure) {
      addIssue(issues, question, part, "chemistry-equation-balance", "error", `Ionic equation is not ${ionicFailure === "charge" ? "charge" : "atom"}-balanced: ${equation}.`);
    }
  }
  const oxidationWater = answer.match(/\b(?:oxidation state|oxidation number)\b[^.\n]*\b(?:O|oxygen)\b[^.\n]*?([+-]?\d+)\b/i)
    ?? answer.match(/\b(?:O|oxygen)\b[^.\n]*\b(?:oxidation state|oxidation number)\b[^.\n]*?([+-]?\d+)\b/i);
  if (oxidationWater && /H2O/i.test(answer) && Number(oxidationWater[1]) !== -2 && !/(?:not|incorrect|wrong|correct|should be)/i.test(answer)) {
    addIssue(issues, question, part, "chemistry-oxidation-state", "error", "Oxygen in neutral H₂O has oxidation state −2.");
  }
  const oxidationMismatch = oxidationStateMismatch(part.prompt, answer);
  if (oxidationMismatch) addIssue(issues, question, part, "chemistry-oxidation-state", "error", oxidationMismatch);
  const ratioMismatch = stoichiometricRatioMismatch(part.prompt, answer);
  if (ratioMismatch) addIssue(issues, question, part, "chemistry-stoichiometry", "error", ratioMismatch);
  if (/\bKc\s*=\s*\[[A-Z]\]\s*\[[A-Z]\]\s*\/\s*\[[A-Z]\]/i.test(answer) && /(?:⇌|->|→)/.test(text) &&
      /\b(?:reactants?|A)\s*\+\s*(?:B)\b/i.test(text) && !/(?:reverse|incorrect|wrong|correct)/i.test(answer)) {
    // A simple two-reactant/one-product expression is a common place for a
    // numerator/denominator reversal. Leave more complex powers to review.
    const expression = answer.match(/Kc\s*=\s*([^.;]+)/i)?.[1] ?? "";
    if (/\[[A-Z]\]\s*\[[A-Z]\]\s*\/\s*\[[A-Z]\]/i.test(expression)) {
      addIssue(issues, question, part, "chemistry-equilibrium", "error", "Kc places product concentrations in the numerator and reactants in the denominator.");
    }
  }
  const exponentMismatch = equilibriumExponentMismatch(part.prompt, answer);
  if (exponentMismatch) addIssue(issues, question, part, "chemistry-equilibrium", "error", exponentMismatch);
  const expressionMismatch = equilibriumExpressionMismatch(part.prompt, answer);
  if (expressionMismatch) addIssue(issues, question, part, "chemistry-equilibrium", "error", expressionMismatch);
  const phMismatch = acidBasePHMismatch(part.prompt, answer);
  if (phMismatch) addIssue(issues, question, part, "chemistry-acid-base", "error", phMismatch);
  const amountMismatch = solutionAmountMismatch(part.prompt, answer);
  if (amountMismatch) addIssue(issues, question, part, "chemistry-stoichiometry", "error", amountMismatch);
  const electronError = electronBalanceMismatch(answer);
  if (electronError) addIssue(issues, question, part, "chemistry-stoichiometry", "error", electronError);
  const empiricalError = empiricalFormulaMismatch(part.prompt, answer);
  if (empiricalError) addIssue(issues, question, part, "chemistry-stoichiometry", "error", empiricalError);
  const precisionWarning = chemistryPrecisionWarning(part.prompt, answer);
  if (advisoryChecksEnabled && precisionWarning) addIssue(issues, question, part, "chemistry-precision", "warning", precisionWarning);
  if (/\bcm\s*(?:³|3)(?!\w)/i.test(part.prompt) && /\bmol\s*dm\s*(?:[-⁻]?3|⁻³)(?!\w)/i.test(part.prompt) &&
      /\bn\s*=\s*c\s*[×*]\s*\d+(?:\.\d+)?\b/i.test(answer) && !/(?:\/\s*1000|0\.0\d|dm\s*³)/i.test(answer)) {
    addIssue(issues, question, part, "chemistry-unit", "error", "A cm³ volume must be converted to dm³ before using n = cV.");
  }
  if (advisoryChecksEnabled && /\b(?:stoichiometr|mole ratio|coefficient)\w*\b/i.test(part.prompt) &&
      !/\b(?:ratio|coefficient|mole|mol|balanced|electron)\w*\b/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "chemistry-stoichiometry", "warning", "The stoichiometric conclusion is not supported by a visible mole ratio or balanced relationship.");
  }
  if (advisoryChecksEnabled && /\b(?:oxidation state|oxidation number|redox|electron transfer)\b/i.test(part.prompt) &&
      !/\b(?:oxid|reduc|electron|charge|state|half-equation)\w*\b/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "chemistry-oxidation-state", "warning", "The answer does not show an oxidation-state or electron-balance justification.");
  }
  if (advisoryChecksEnabled && /\b(?:calculate|concentration|amount|energy|volume|pressure|rate)\w*\b/i.test(part.prompt) &&
      /\b(?:mol|dm|cm|kJ|J|Pa|K|g|s|m)\b/i.test(part.prompt) &&
      !/\b(?:mol|dm|cm|kJ|J|Pa|K|g|s|m)\b/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "chemistry-unit", "warning", "A numerical chemistry answer has no visible unit.");
  }
  const equilibriumTask = /\bK[cp]\b/i.test(part.prompt) ||
    (/(?:⇌|->|→)/.test(part.prompt) && /\b(?:equilibrium|concentration|partial pressure|quotient)\b/i.test(part.prompt));
  if (advisoryChecksEnabled && equilibriumTask && !/(?:\[|partial pressure|concentration|equilibrium|Q[cp])/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "chemistry-equilibrium", "warning", "The equilibrium answer does not expose the concentration or partial-pressure relationship.");
  }
}

function summariseCorrectness(issues: readonly SubjectAssessmentIssue[]): SubjectCorrectnessSummary {
  const byKind: Partial<Record<SubjectAssessmentIssueKind, number>> = {};
  for (const issue of issues) byKind[issue.kind] = (byKind[issue.kind] ?? 0) + 1;
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  return { issueCount: issues.length, errors, warnings, unresolved: warnings, byKind };
}

function buildRepairQueue(
  subjectId: WjecFlagshipSubjectId | Id,
  questions: readonly Question[],
  depth: PhysicsAssessmentQualityAudit,
  subjectIssues: readonly SubjectAssessmentIssue[],
): SubjectRepairQueueItem[] {
  const queue = new Map<string, SubjectRepairQueueItem>();
  const issueByPart = new Map<string, SubjectAssessmentIssue[]>();
  for (const issue of subjectIssues) {
    const key = `${issue.questionId}::${issue.partId}`;
    const rows = issueByPart.get(key) ?? [];
    rows.push(issue);
    issueByPart.set(key, rows);
  }

  const priorityRank: Record<SubjectRepairPriority, number> = {
    "missing-authored-demand": 0,
    "not-self-contained": 1,
    "weak-worked-solution": 2,
    "duplicate-reasoning": 3,
    "correctness-warning": 4,
  };

  const put = (item: SubjectRepairQueueItem): void => {
    const key = `${item.specPointId ?? "?"}:${item.capabilityId ?? "?"}:${item.demand ?? "?"}:${item.partId ?? item.questionId ?? "cell"}`;
    const prior = queue.get(key);
    if (!prior) {
      queue.set(key, item);
      return;
    }
    prior.reasons = [...new Set([...prior.reasons, ...item.reasons])];
    if (item.severity === "error") prior.severity = "error";
    if (priorityRank[item.priority] < priorityRank[prior.priority]) prior.priority = item.priority;
  };

  const priorityForSubjectIssue = (issue: SubjectAssessmentIssue): SubjectRepairPriority => {
    if (issue.kind === "not-self-contained") return "not-self-contained";
    if (issue.kind === "solution-substance") return "weak-worked-solution";
    if (issue.kind !== "generic-fallback" && issue.kind !== "demand-evidence") return "correctness-warning";
    if (issue.severity === "warning") return "correctness-warning";
    return "missing-authored-demand";
  };

  const priorityForStructuralIssue = (kind: PhysicsQualityIssueKind): SubjectRepairPriority => {
    if (kind === "cosmetic-reskin" || kind === "surface-rewording") return "duplicate-reasoning";
    if (kind === "incomplete-mark-scheme") return "weak-worked-solution";
    return "missing-authored-demand";
  };

  // One item for every incomplete statement/capability/demand cell, even
  // when no question exists yet. This keeps the authoring queue honest.
  for (const coverage of depth.capabilityCoverageByCapability) {
    for (const demand of coverage.demands) {
      if (demand.complete && demand.distinct) continue;
      const rows = questions.flatMap((question) => question.parts
        .filter((part) => part.specPointIds?.includes(coverage.specPointId) &&
          part.capabilityIds?.length === 1 && part.capabilityIds[0] === coverage.capabilityId &&
          part.learning?.demand === demand.demand)
        .map((part) => ({ question, part })));
      const representative = rows[0];
      put({
        subjectId,
        specPointId: coverage.specPointId,
        capabilityId: coverage.capabilityId,
        demand: demand.demand,
        ...(representative ? { questionId: representative.question.id, partId: representative.part.id } : {}),
        severity: "error",
        priority: "missing-authored-demand",
        reasons: [demand.complete ? "Demand has insufficiently distinct families, contexts or reasoning paths." : "Demand needs at least two substantive families."],
      });
    }
  }

  // Preserve the exact textual reason for every rejected part. These entries
  // complement the cell-level gaps above and make repair/re-review actionable.
  for (const [partKey, issues] of issueByPart) {
    const separator = partKey.indexOf("::");
    if (separator < 0) continue;
    const questionId = partKey.slice(0, separator);
    const partId = partKey.slice(separator + 2);
    const question = questions.find((row) => row.id === questionId);
    const part = question?.parts.find((row) => row.id === partId);
    if (!question || !part) continue;
    const meta = part.learning;
    put({
      subjectId,
      ...(part.specPointIds?.length === 1 ? { specPointId: part.specPointIds[0] } : {}),
      ...(part.capabilityIds?.length === 1 ? { capabilityId: part.capabilityIds[0] } : {}),
      ...(meta?.demand ? { demand: meta.demand } : {}),
      questionId,
      partId,
      severity: issues.some((issue) => issue.severity === "error") ? "error" : "warning",
      priority: issues.map(priorityForSubjectIssue).sort((a, b) => priorityRank[a] - priorityRank[b])[0] ?? "missing-authored-demand",
      reasons: issues.map((issue) => `${issue.kind}: ${issue.detail}`),
    });
  }
  // Structural duplicate/mapping/rubric issues are part of the same repair
  // queue even though they live in the shared Physics audit type. Exclude
  // unreviewed-only entries: review approval is a separate trust workflow,
  // while this queue is about cells that cannot count as deep authored work.
  for (const issue of depth.issues) {
    if (!issue.partId || issue.kind === "unreviewed") continue;
    const question = questions.find((row) => row.id === issue.questionId);
    const part = question?.parts.find((row) => row.id === issue.partId);
    if (!question || !part) continue;
    put({
      subjectId,
      ...(issue.specPointId ? { specPointId: issue.specPointId } : {}),
      ...(issue.capabilityId ? { capabilityId: issue.capabilityId } : {}),
      ...(part.learning?.demand ? { demand: part.learning.demand } : {}),
      questionId: issue.questionId,
      partId: issue.partId,
      severity: "error",
      priority: priorityForStructuralIssue(issue.kind),
      reasons: [`${issue.kind}: ${issue.detail}`],
    });
  }
  return [...queue.values()].sort((a, b) => {
    if (priorityRank[a.priority] !== priorityRank[b.priority]) return priorityRank[a.priority] - priorityRank[b.priority];
    if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
    return `${a.specPointId ?? ""}:${a.demand ?? ""}:${a.questionId ?? ""}:${a.partId ?? ""}`
      .localeCompare(`${b.specPointId ?? ""}:${b.demand ?? ""}:${b.questionId ?? ""}:${b.partId ?? ""}`);
  });
}

/** Run the shared seven-demand audit plus conservative subject checks. */
export function auditFlagshipSubject(input: {
  subjectId: WjecFlagshipSubjectId | Id;
  topics: readonly Topic[];
  questions: readonly Question[];
  nodes: readonly CapabilityNode[];
  trustedQuestion?: (question: Question) => boolean;
  markingDisagreements?: number;
}): FlagshipSubjectAssessmentAudit {
  const subjectIssues: SubjectAssessmentIssue[] = [];
  const invalidParts = new Set<string>();
  const subjectQuestions = input.questions.filter((row) => row.subjectId === input.subjectId);
  // Run the shared mapping/authoring audit once before counting strict cells.
  // Its issues are deliberately kept in the structural audit surface, but a
  // non-Physics part with a missing/unknown mapping, incomplete rubric or
  // duplicate route must not still inflate deepComplete through the broad
  // statement-level rows.
  if (input.subjectId !== "wjec-alevel-physics") {
    const structural = auditPhysicsAssessmentQuality({
      ...input,
      subjectId: input.subjectId,
      strictSubstantive: false,
    });
    for (const issue of structural.issues) {
      if (issue.partId && issue.kind !== "unreviewed") invalidParts.add(`${issue.questionId}:${issue.partId}`);
    }
  }
  for (const question of subjectQuestions) {
    for (const part of question.parts) {
      // Physics already has a mature, reviewed depth bank and retains its
      // legacy 108/108 contract. The substantive gate is applied to the three
      // first-wave flagship packs only.
      if (input.subjectId !== "wjec-alevel-physics") {
        for (const failure of validateSubstantivePart(input.subjectId, question, part)) {
          addIssue(subjectIssues, question, part, failure.kind, "error", failure.detail);
          invalidParts.add(`${question.id}:${part.id}`);
        }
      }
      const issueStart = subjectIssues.length;
      if (input.subjectId === "wjec-alevel-maths") validateMathsPart(question, part, subjectIssues);
      else if (input.subjectId === "wjec-alevel-biology") validateBiologyPart(question, part, subjectIssues);
      else if (input.subjectId === "wjec-alevel-chemistry") validateChemistryPart(question, part, subjectIssues);
      // A deterministic correctness error is a content defect as well as a
      // reportable issue. Exclude that part from deep completion until an
      // author repairs and re-reviews it; warnings remain conservative manual
      // review items and do not silently erase otherwise useful coverage.
      if (subjectIssues.slice(issueStart).some((issue) => issue.severity === "error")) {
        invalidParts.add(`${question.id}:${part.id}`);
      }
    }
  }
  const depth = auditPhysicsAssessmentQuality({
    ...input,
    strictSubstantive: input.subjectId !== "wjec-alevel-physics",
    substantivePart: (question, part) => !invalidParts.has(`${question.id}:${part.id}`),
  });
  const repairQueue = buildRepairQueue(input.subjectId, subjectQuestions, depth, subjectIssues);
  return {
    ...depth,
    subjectIssues,
    correctness: summariseCorrectness(subjectIssues),
    markingDisagreements: Math.max(0, input.markingDisagreements ?? 0),
    repairQueue,
  };
}

export interface FlagshipDepthDashboardRow {
  subjectId: WjecFlagshipSubjectId | Id;
  statements: number;
  deepComplete: number;
  incomplete: number;
  questions: number;
  questionsPerStatement: number;
  demandCompletion: Record<LearningDemand, number>;
  approvedQuestions: number;
  draftQuestions: number;
  structuralIssues: number;
  subjectCorrectness: SubjectCorrectnessSummary;
  repairQueue: number;
  markingDisagreements: number;
  releaseReady: boolean;
}

export interface FlagshipDepthDashboard {
  subjects: FlagshipDepthDashboardRow[];
  balancedAtTwenty: boolean;
  /** No student-facing data: this is an authoring/release QA surface. */
  generatedQuestionCount: number;
  totalQuestions: number;
}

export interface FlagshipDepthDashboardInput {
  curricula: ReadonlyArray<{ subject: { id: Id }; topics: readonly Topic[] }>;
  questions: readonly Question[];
  nodes: readonly CapabilityNode[];
  trustedQuestion?: (question: Question) => boolean;
  markingDisagreementsBySubject?: Partial<Record<Id, number>>;
}

/** Build one compact internal row per WJEC subject for balanced authoring. */
export function buildFlagshipDepthDashboard(input: FlagshipDepthDashboardInput): FlagshipDepthDashboard {
  const rows = input.curricula.map(({ subject, topics }): FlagshipDepthDashboardRow => {
    const subjectQuestions = input.questions.filter((question) => question.subjectId === subject.id);
    const audit = auditFlagshipSubject({
      subjectId: subject.id,
      topics,
      questions: subjectQuestions,
      nodes: input.nodes,
      trustedQuestion: input.trustedQuestion,
      markingDisagreements: input.markingDisagreementsBySubject?.[subject.id],
    });
    const demandCompletion = Object.fromEntries(
      PHYSICS_ASSESSMENT_DEMANDS.map((demand) => [demand, 0]),
    ) as Record<LearningDemand, number>;
    for (const demand of audit.capabilityCoverage.flatMap((coverage) => coverage.demands)) {
      if (demand.complete && demand.distinct) demandCompletion[demand.demand] = (demandCompletion[demand.demand] ?? 0) + 1;
    }
    return {
      subjectId: subject.id,
      statements: audit.statements,
      deepComplete: audit.completeStatements,
      incomplete: Math.max(0, audit.statements - audit.completeStatements),
      questions: subjectQuestions.length,
      questionsPerStatement: audit.statements ? Number((subjectQuestions.length / audit.statements).toFixed(2)) : 0,
      demandCompletion,
      approvedQuestions: audit.approvedQuestions,
      draftQuestions: audit.unreviewedQuestions,
      structuralIssues: audit.issues.filter((issue: PhysicsQualityIssue) => issue.kind !== "unreviewed").length,
      subjectCorrectness: audit.correctness,
      repairQueue: audit.repairQueue.length,
      markingDisagreements: audit.markingDisagreements,
      // A warning is an unresolved reviewer action, so it cannot be promoted
      // to a trusted release even though it may leave substantive practice
      // coverage usable for authoring.
      releaseReady: audit.releaseReady && audit.correctness.errors === 0 && audit.correctness.unresolved === 0,
    };
  });
  return {
    subjects: rows,
    balancedAtTwenty: rows.filter((row) => WJEC_FLAGSHIP_SUBJECT_IDS.includes(row.subjectId as WjecFlagshipSubjectId)).every((row) => row.deepComplete >= 20),
    generatedQuestionCount: input.questions.filter((question) => question.source === "generated").length,
    totalQuestions: input.questions.length,
  };
}

/** Descriptive aliases for callers that do not need to know the legacy Physics audit name. */
export const auditWjecSubjectAssessment = auditFlagshipSubject;
export const buildWjecFlagshipDepthDashboard = buildFlagshipDepthDashboard;
