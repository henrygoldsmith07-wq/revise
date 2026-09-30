

import type { Question, QuestionPart } from "./types";
import type { SubjectAssessmentIssue } from "./subject-assessment-audit";

import { partText, addIssue } from "./subject-substantive";
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

export function validateBiologyPart(question: Question, part: QuestionPart, issues: SubjectAssessmentIssue[]): void {
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
