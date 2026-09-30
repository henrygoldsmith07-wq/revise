

import {
  answerLeakageDetail,
  capabilityNotRequiredReason,
  capabilityStructureContract,
  hasSynopticAttribution,
  transferNoveltyClasses,
  validateCapabilityEvidence,
  validateProvenance,
} from "./subject-assessment-semantic";
import {
  compareTransferStructures as compareTransferReasoningGraphs,
  isMappedCapabilityId,
  validateSynopticStructure,
} from "./reasoning-graph";
import {
  validateSynopticSecondaryReal,
  validateTransferAnswerability,
  validateWorkedCompleteness,
} from "./transfer-trust";
import { promptOverload } from "./physics-assessment-quality";
import type { Id, LearningDemand, Question, QuestionPart } from "./types";
import type { SubjectAssessmentIssue, SubjectAssessmentIssueKind, WjecFlagshipSubjectId } from "./subject-assessment-audit";

/** The issue shape the subject validators append to (mirrors the audit issue). */
export type { SubjectAssessmentIssue, SubjectAssessmentIssueKind, WjecFlagshipSubjectId };

type WjecSubjectId = WjecFlagshipSubjectId | Id;

export function partText(part: QuestionPart): string {
  return [part.prompt, ...(part.markScheme ?? []), part.modelAnswer].filter(Boolean).join("\n");
}

export function addIssue(
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
  return /\d|[=→⟶<>≤≥√∫]|\b(?:figure|equation|formula|function|probabil(?:ity|ities)|vector|derivative|integral|antiderivative|gradient|root|domain|inequalit(?:y|ies)|surd|quadratic|polynomial|transformation|tangent|normal|trigonometric|triangle|logarithm|exponential|organism|cell|tissue|sample|species|compound|reaction|solution|concentration|mass|volume|force|graph|table|dataset|scale|magnification|resolution|sequence|codon|protein|carbohydrate|lipid|hydrolysis|enzyme|substrate|membrane|osmosis|water potential|solute|organelle|micrograph|fraction|pellet|DNA|RNA|bond|electron|molecule|mole|acid|base|ion|atom|isotope|configuration|spectrum|dipole|lattice|intermolecular|gas|pH|Kc|Kp|ATP)\b/i.test(text);
}

function hasResultEvidence(text: string): boolean {
  return /[=→⟶]|\b(?:therefore|thus|hence|gives?|giving|equals?|is|are|was|were|increases?|decreases?|changes?|predicts?|conclude|so that|result(?:s|ing)?|because|leads?|causes?|follows?|obtain|obtains|yield|amount|concentration|purity|probability|value|volume|mass|approximately|about|would|could|supports?|requires?|twice|half|outside|infeasible|impossible|rejected|valid|invalid|root|solution|test|suggest|explains?|explain|compare|difference|different|higher|lower)\b/i.test(text);
}

function hasConcreteResultEvidence(text: string, subjectId?: WjecSubjectId): boolean {
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
    .map((match) => match[0]!.replace(/\s+/g, "").replace(/\.$/, "").toLowerCase());
}

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

function hasConcreteMarkScheme(scheme: readonly string[], subjectId: WjecSubjectId): boolean {
  const text = scheme.map((point) => point.trim()).filter(Boolean).join("\n");
  if (!text || text.length < 8) return false;
  if (GENERIC_FALLBACK_PHRASES.some((phrase) => phrase.test(text))) return false;
  return hasConcreteStructure(text) || hasCausalChain(text, subjectId);
}

function hasCausalChain(text: string, subjectId?: WjecSubjectId): boolean {
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

function hasSubjectSpecificEvidence(text: string, subjectId: WjecSubjectId): boolean {
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

function hasConcreteApplicationContext(prompt: string, subjectId: WjecSubjectId): boolean {
  if (hasInlineQuantityOrRepresentation(prompt)) return true;
  // A qualitative application can still be self-contained when it names a
  // real specimen/setup and changed condition. Do not accept generic “apply
  // the method” prose: both a subject entity and an operation/condition must
  // be visible in the prompt.
  const condition = /\b(?:before|after|initially|while|without|with|same|different|constant|fixed|matched|dilut(?:e|ed|ing)|vary|control|weigh|blot|place|heat|cool|treat|compare|contains?|permits?|cross(?:es|ing)?|held|excess|limiting|concentrated|buffered|pH|temperature|pressure|length|volume|assay|mixture|sample|solution|stock|gradient|rate)\b/i.test(prompt);
  if (!condition) return false;
  if (subjectId === "wjec-alevel-biology") {
    // Nucleic-acid specimens (sequences, codons, strands) are concrete setups
    // too; the earlier list named only cell/membrane vocabulary and so could
    // never recognise a genetics application context.
    return /\b(?:enzyme|substrate|buffer|pH|potato|sucrose|tissue|sample|assay|cell|membrane|solute|water|mass|protein|reaction|pigment|temperature|organism|concentration|dna|rna|gene|allele|codon|ribosome|mutation|strand|sequence|base)\b/i.test(prompt);
  }
  if (subjectId === "wjec-alevel-chemistry") {
    // Bonding/atomic specimens (molecules, lattices, spectra) are concrete
    // setups too; the earlier list omitted that vocabulary entirely.
    return /\b(?:solution|acid|base|mole|mol|reaction|compound|ion|electron|equilibrium|gas|titration|concentration|temperature|pressure|volume|mass|catalyst|mixture|molecule|structure|dipole|bond|lattice|spectrum|fragment|isotope|configuration|shell)\b/i.test(prompt);
  }
  return hasSubjectSpecificEvidence(prompt, subjectId);
}

export function isGeneratedDepthDraft(question: Question): boolean {
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

function undefinedVariableReference(prompt: string, subjectId: WjecSubjectId): string | null {
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

function fallbackPhraseIsInstantiated(phrase: RegExp, prompt: string, fullText: string, subjectId: WjecSubjectId): boolean {
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

function hasRepairEvidence(answer: string, subjectId: WjecSubjectId): boolean {
  const correction = /\b(?:not|incorrect|wrong|instead|rather|correct(?:ly)?|reject(?:ed)?|false|should|must|cannot|does not|do not|first invalid|invalid|error|repair|because|infeasible|extraneous|outside|lose|lost|signs?|magnitude|factor|domain|zero|opposite|reversed|reverse|halve|twice|unsafe|omitted|omit|excludes?|leaves?|assumes?|assumption|claim|condition|different|greater|higher|lower|move|moves?)\b/i.test(answer);
  return correction && hasSubjectSpecificEvidence(answer, subjectId);
}

function hasTransferAdaptation(prompt: string, answer: string, subjectId: WjecSubjectId): boolean {
  const representationCue = /\b(?:unfamiliar|new|novel|different|unknown|unseen|alternative|without assuming|external|hidden|selected|observed|given|condition|candidate|protocol|representation|diagram|spectrum|isomer|mixture|assay|variant|inferred|tangent|contact|integer|continuous|operator|reported|reporting|back titration|residual|inert|unusual|second|another|without replacement|at least one|posterior|source|reporting rule|contact point|matched|fresh|initially|over time|side\s+[A-Z]|artificial|same|fixed|permeat|hypertonic|slow(?:ly)?|long[- ]term|two\s+\w+|one\s+.*\bother\b)\b/i.test(prompt);
  const adaptationCue = /\b(?:rearrang|convert|translate|map|interpret|adapt|reconstruct|derive|infer|compare|preserv|invariant|constraint|domain|units?|structure|gradient|ratio|charge|stoichiometr|control|evidence|because|therefore|instead|rather|different(?:ly)?|new case|under these conditions|setting|contact|tangent|candidate|admissible|continuous|integer|condition|protocol|initial|posterior|conditional|given|remaining|order|route|path|representation|supports?|suggests?|predicts?|depends?|over time|final|long[- ]term|balance|total|cannot|need(?:s)?|limiting|re-enter|rescue|fresh|permeat|cross(?:es|ing)?)\w*\b/i.test(answer);
  return representationCue && adaptationCue && hasSubjectSpecificEvidence(answer, subjectId);
}

function hasSynopticJoin(prompt: string, answer: string, subjectId: WjecSubjectId): boolean {
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

/**
 * Require the two synoptic capabilities to appear in attributable solution
 * steps.  Naming two topics in a stem is insufficient if the worked answer
 * uses only one of them; at least two checkable scheme/answer steps must carry
 * distinct subject operations.
 */
export interface SubstantiveGateFailure {
  kind: Extract<SubjectAssessmentIssueKind, "generic-fallback" | "not-self-contained" | "solution-substance" | "demand-evidence" | "answer-leakage" | "capability-evidence" | "capability-not-required" | "provenance" | "transfer-novelty" | "transfer-not-novel" | "duplicate-reasoning-graph" | "duplicate-derived-reasoning" | "secondary-capability-not-required" | "missing-secondary-contract" | "missing-transfer-data" | "stale-transfer-baseline-fingerprint" | "stale-transfer-fingerprint" | "stale-reasoning-graph" | "worked-solution-incomplete" | "invalid-transfer-baseline" | "route-superset" | "synoptic-evidence">;
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
  const meta = part.learning ?? question.learning;
  const text = partText(part);
  const prompt = part.prompt.trim();
  const answer = part.modelAnswer.trim();
  const demand = meta?.demand;
  const provisionalDepthDraft = isGeneratedDepthDraft(question);
  // Generated flagship transfer cells no longer skip validation through a
  // provisional draft. Only cells explicitly marked `scaffold` retain the
  // temporary bypass; a generated `substantive` transfer must pass the exact
  // same structural novelty gate as authored content.
  const scaffoldBypass = provisionalDepthDraft && meta?.quality === "scaffold";
  // WJEC command words are often embedded after a short context sentence
  // (for example “Use the supplied data…” or “Build a causal chain…”).
  // Keep this list explicit rather than treating any imperative as a pass:
  // substantive cells still have to satisfy the demand/result gates below.
  const hasCommandWord = /\b(?:state|define|describe|explain|calculate|recalculate|find|determine|predict|compare|evaluate|identify|correct|show|derive|write|give|classify|suggest|justify|use|deduce|sketch|solve|estimate|outline|apply|process|summari[sz]e|choose|decide|locate|interpret|carry|reconstruct|combine|check|convert|minimi[sz]e|maximi[sz]e|optimise|optimize|select|repair|test|reject|name|list|construct|formulate|balance|draw|infer|read|plot|measure|obtain|verify|confirm|discuss|assess|analyse|analyze|track|follow|build|relate|separate|map|translate|recover|weight|rank|distinguish|match|move|sum|treat|report|differentiate|simplify|rationalise|rationalize|integrate|factor|substitute|rearrange|prove)\b/i.test(prompt);

  if (meta?.quality !== "substantive") {
    failures.push({ kind: "generic-fallback", detail: "Mark this cell substantive only after replacing fallback/scaffold prose with a reviewed, answerable task." });
  }
  if (question.source === "generated" && meta?.quality === "substantive") {
    const capabilityId = part.capabilityIds?.length === 1 ? part.capabilityIds[0] : undefined;
    const contract = capabilityId ? capabilityStructureContract(subjectId, capabilityId) : undefined;
    if (!meta.capabilityEvidence?.structuralContract || !contract) {
      failures.push({ kind: "capability-evidence", detail: "Generated substantive content needs a capability-specific structural contract; unsupported capabilities remain scaffold/incomplete." });
    }
  }
  if (!hasConcreteMarkScheme(part.markScheme, subjectId)) {
    failures.push({ kind: "generic-fallback", detail: "The mark scheme does not contain concrete, independently awardable subject evidence." });
  }
  if (!hasCommandWord) {
    failures.push({ kind: "demand-evidence", detail: "A substantive cell needs an explicit subject command such as calculate, explain, compare or define." });
  }

  // Expected results must stay out of learner prompts: leakage is a hard error.
  const target = meta?.promptTarget?.trim();
  const workedAnswer = `${part.markScheme.join("\n")}\n${answer}`;
  const leakage = answerLeakageDetail(prompt, workedAnswer, meta?.expectedResult);
  if (leakage) failures.push({ kind: "answer-leakage", detail: leakage });

  // Generated substantive cells must retain the target/result authoring trace.
  const requiresAuthoringTrace = question.source === "generated" && meta?.quality === "substantive";
  if (requiresAuthoringTrace) {
    const missing: string[] = [];
    if (!target) missing.push("promptTarget");
    if (!meta?.expectedResult?.trim()) missing.push("expectedResult");
    if (!meta?.derivation?.some((step) => step.trim())) missing.push("derivation");
    if (!meta?.evidenceSources?.some((source) => source.trim())) missing.push("evidenceSources");
    if (missing.length) failures.push({ kind: "provenance", detail: `Substantive generated content is missing the target/result trace: ${missing.join(", ")}.` });
    if (target && !prompt.toLowerCase().includes(target.toLowerCase())) {
      failures.push({ kind: "provenance", detail: "The authored promptTarget is not represented in the rendered prompt." });
    }
  }

  for (const detail of validateCapabilityEvidence(meta?.capabilityEvidence, part, text)) {
    failures.push({ kind: "capability-evidence", detail });
  }
  const capabilityNecessity = capabilityNotRequiredReason(meta?.capabilityEvidence, part);
  if (capabilityNecessity) failures.push({ kind: "capability-not-required", detail: capabilityNecessity });
  const traceProvenance = meta?.provenance ?? (meta?.expectedResult ? {
    sourceEvidence: meta.evidenceSources ?? [],
    operation: meta.derivation?.[0] ?? "derive",
    intermediateResults: meta.derivation?.slice(1) ?? [],
    finalResult: meta.expectedResult,
  } : undefined);
  for (const detail of validateProvenance(traceProvenance, prompt, part.markScheme, answer, subjectId)) {
    failures.push({ kind: detail.includes("answer leakage") ? "answer-leakage" : "provenance", detail });
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

  // Treat apparatus/circuit as data references only when a measurement cue is
  // attached; a biological apparatus name is not an absent artefact.
  const refersToDataArtifact = /\b(?:graph|table|dataset|data\s+set|diagram|figure|spectrum|micrograph|chromatogram)\b|\b(?:apparatus|circuit)\b[^.!?]{0,60}\b(?:reading|measure|measurement|voltage|current|resistance|time|data|result|value)\b|\b(?:the|stated|displayed|supplied)\s+data\b/i.test(prompt) ||
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
  if (!scaffoldBypass && repeatsReasoningMetadata(part, answer)) {
    failures.push({ kind: "solution-substance", detail: "The worked answer repeats the reasoning metadata instead of carrying out the authored operation." });
  }
  if (/(?:^|\b)(?:use|apply|choose|trace|check|consider|identify)\b[^.]*\b(?:method|approach|rule|formula|relationship|concept)\b[^.]*$/i.test(answer) && !hasWorkedEvidence(answer)) {
    failures.push({ kind: "solution-substance", detail: "The worked answer describes a method but does not carry it out." });
  }
  if (!scaffoldBypass && !solutionUsesPromptEvidence(prompt, answer, demand)) {
    failures.push({ kind: "solution-substance", detail: "The worked answer introduces numerical values without using the quantities supplied by the prompt." });
  }
  const resultRequired = demand && ["application", "calculation", "transfer", "synoptic"].includes(demand);
  const hasDemandResult = scaffoldBypass
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
  if (!scaffoldBypass && multiStepCommand && equationSteps < 2 && !hasWorkingConnector && !hasExplicitConclusion && !hasCalculationNarrative(answer)) {
    failures.push({ kind: "solution-substance", detail: "The multi-step task has no checkable intermediate working or first-step reasoning." });
  }

  if (!demand) {
    failures.push({ kind: "demand-evidence", detail: "Assign one of the seven learning demands before counting this cell." });
  } else if (demand === "recall") {
    if (scaffoldBypass) return failures;
    if (answer.length < 12 || !hasSubjectSpecificEvidence(answer, subjectId) || !/(?:\b(?:is|are|has|have|means?|defined|rule|law|because|when|if|contains?|consists?|equals?|gives?|requires?|allows?|changes?|from|to|between|same|different|multiply|divide|conditioning|probability)\b|\bP\s*\(|=|→|⟶)/i.test(answer)) {
      failures.push({ kind: "demand-evidence", detail: "Recall must state a precise subject fact or definition." });
    }
  } else if (demand === "explanation") {
    if (scaffoldBypass) return failures;
    // The causal chain must be present in the worked answer itself. Looking at
    // prompt + scheme alone lets an answer pass by repeating the question's
    // nouns and a causal keyword without explaining the mechanism.
    if (!hasCausalChain(answer, subjectId)) {
      failures.push({ kind: "demand-evidence", detail: "Explanation must show a subject-specific causal or logical chain." });
    }
    if (meta?.quality === "substantive" && (meta?.familyId ?? "").includes("-depth:")) {
      for (const detail of validateWorkedCompleteness(part, subjectId)) {
        failures.push({ kind: "worked-solution-incomplete", detail });
      }
    }
  } else if (demand === "application") {
    if (scaffoldBypass) return failures;
    if (!hasConcreteApplicationContext(prompt, subjectId) || !hasResultEvidence(answer) || !hasSubjectSpecificEvidence(answer, subjectId)) {
      failures.push({ kind: "demand-evidence", detail: "Application must change a concrete context and reach a stated consequence." });
    }
  } else if (demand === "misconception") {
    if (scaffoldBypass) return failures;
    if (!hasMisconceptionClaim(prompt) || !hasRepairEvidence(answer, subjectId)) {
      failures.push({ kind: "demand-evidence", detail: "Misconception work must identify an incorrect claim and explicitly repair it." });
    }
  } else if (demand === "calculation") {
    if (scaffoldBypass) return failures;
    if (!hasInlineQuantityOrRepresentation(prompt) || !hasWorkedEvidence(answer) || !hasSubjectSpecificEvidence(answer, subjectId)) {
      failures.push({ kind: "demand-evidence", detail: "Calculation/data work needs supplied quantities or a data representation and checkable working." });
    }
    if (meta?.quality === "substantive" && (meta?.familyId ?? "").includes("-depth:")) {
      for (const detail of validateWorkedCompleteness(part, subjectId)) {
        failures.push({ kind: "worked-solution-incomplete", detail });
      }
    }
  } else if (demand === "transfer") {
    if (scaffoldBypass) return failures;
    const noveltyClasses = transferNoveltyClasses(prompt);
    if (!hasTransferAdaptation(prompt, answer, subjectId) || noveltyClasses.length === 0) {
      failures.push({ kind: "demand-evidence", detail: "Transfer must use a genuinely new representation or context and reach a conclusion." });
      if (noveltyClasses.length === 0) {
        failures.push({ kind: "transfer-novelty", detail: "Transfer prompt changes no observable representation, information structure, hidden state, constraint, data form or concept combination." });
      }
    }
    // Trust gap: the new representation must be independently answerable
    // before novelty is even considered. A graph/table/hidden entry without
    // usable data fails here regardless of how novel it looks. Scoped to the
    // generated depth pack that this trust contract governs.
    if (meta?.quality === "substantive" && (meta?.familyId ?? "").includes("-depth:")) {
      for (const detail of validateTransferAnswerability(part)) {
        failures.push({ kind: "missing-transfer-data", detail });
      }
      for (const detail of validateWorkedCompleteness(part, subjectId)) {
        failures.push({ kind: "worked-solution-incomplete", detail });
      }
    }
    // Layer C — structural transfer: explicit baseline plus fingerprint and
    // reasoning-graph novelty. Number swaps, renamed contexts, different
    // nouns and "unfamiliar"/"new representation" contribute nothing because
    // the fingerprint and graph builders strip them before comparison.
    // Depth cells carry an explicit stored link; authored quality cells are
    // validated against their real baselines in the cross-part gate below.
    if (meta?.quality === "substantive") {
      const link = meta?.transferLink;
      const isDepthCell = (meta?.familyId ?? "").includes("-depth:");
      if (link?.baselinePartId?.trim()) {
        const comparison = compareTransferReasoningGraphs(
          link.baselineSetupFingerprint,
          link.transferSetupFingerprint,
          link.baselineReasoningGraph,
          link.transferReasoningGraph,
        );
        if (!comparison.isNovel) {
          failures.push({ kind: "transfer-not-novel", detail: `Transfer has no structural novelty against its baseline (structural: ${comparison.structuralChanges.join(", ") || "none"}; reasoning: ${comparison.reasoningChanges.join(", ") || "none"}) (transfer-not-novel).` });
        }
      } else if (isDepthCell) {
        failures.push({ kind: "transfer-not-novel", detail: "Transfer cell lacks an explicit baselinePartId from the same capability (transfer-not-novel)." });
      }
    }
  } else if (demand === "synoptic") {
    if (scaffoldBypass) return failures;
    const claims = part.learningClaims ?? [];
    const distinctClaims = claims.length >= 2 && promptOverload(claims[0]!, claims[1]!) < 0.85;
    const joined = hasSynopticJoin(prompt, answer, subjectId);
    const attributed = hasSynopticAttribution(part, subjectId);
    const explicitSecondary = Boolean(meta?.capabilityEvidence?.secondaryCapability ?? meta?.capabilityEvidence?.secondaryCapabilityId ?? meta?.synopticLink?.secondaryCapabilityId);
    if (!distinctClaims || !joined || !attributed || !explicitSecondary) {
      failures.push({ kind: "synoptic-evidence", detail: "Synoptic work must name primary and secondary capabilities and attribute a necessary solution step to each." });
    }
    // Layer C — synoptic validity with real capability ids and independent
    // contracts. Depth cells must carry mapped ids; authored quality cells
    // keep their display label but still need two attributable strands.
    if (meta?.quality === "substantive") {
      const isDepthCell = (meta?.familyId ?? "").includes("-depth:");
      const secondaryId = meta?.synopticLink?.secondaryCapabilityId ?? meta?.capabilityEvidence?.secondaryCapabilityId ?? meta?.capabilityEvidence?.secondaryCapability ?? "";
      if (isDepthCell && (!secondaryId.trim() || !isMappedCapabilityId(secondaryId.trim()))) {
        failures.push({ kind: "missing-secondary-contract", detail: `Synoptic secondary skill lacks a mapped capability id (found: ${secondaryId || "none"}) (missing-secondary-contract).` });
      } else if (isDepthCell) {
        for (const detail of validateSynopticStructure(part, subjectId)) {
          if (/missing-secondary-contract/i.test(detail)) {
            failures.push({ kind: "missing-secondary-contract", detail: `${detail} (missing-secondary-contract).` });
          } else if (/secondary-capability-not-required|unused|does not depend|removing/i.test(detail)) {
            failures.push({ kind: "secondary-capability-not-required", detail: `${detail} (secondary-capability-not-required).` });
          } else {
            failures.push({ kind: "synoptic-evidence", detail });
          }
        }
        // Trust gap: the stored secondary contract must agree with the
        // canonical contract recomputed from current content.
        for (const detail of validateSynopticSecondaryReal(part, subjectId)) {
          if (/missing-secondary-contract/i.test(detail)) {
            failures.push({ kind: "missing-secondary-contract", detail });
          } else {
            failures.push({ kind: "secondary-capability-not-required", detail });
          }
        }
      }
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
