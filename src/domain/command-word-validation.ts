import { commandOf } from "./assessment";
import type { CommandWord, Question, QuestionPart } from "./types";

export type CommandWordValidationStatus = "empty" | "aligned" | "needs-attention" | "not-applicable";

export interface CommandWordValidation {
  command: CommandWord;
  label: string;
  status: CommandWordValidationStatus;
  message: string;
  guidance: string;
  evidence: string[];
}

type SupportedCommandWord = Exclude<CommandWord, "other">;
type Signal = { label: string; pattern: RegExp };

interface CommandProfile {
  guidance: string;
  signals: Signal[];
  requiredSignals: number;
}

const PROFILES: Record<SupportedCommandWord, CommandProfile> = {
  state: {
    guidance: "Give the exact fact, value or definition requested, without an unnecessary essay.",
    signals: [],
    requiredSignals: 0,
  },
  describe: {
    guidance: "Give precise observations or features. Say what happens, not why it happens.",
    signals: [
      { label: "observation", pattern: /\b(is|are|has|have|contains|consists|increases|decreases|rises|falls|shows|observed)\b/i },
    ],
    requiredSignals: 1,
  },
  explain: {
    guidance: "Make the reason explicit with a link such as because, due to or therefore.",
    signals: [{ label: "reason link", pattern: /\b(because|therefore|since|due to|so that|as a result)\b/i }],
    requiredSignals: 1,
  },
  calculate: {
    guidance: "Show the method and give a numerical result, with units where they apply.",
    signals: [
      { label: "calculation", pattern: /\d|=|[×÷+\-*/^]/i },
      { label: "unit", pattern: /\b(kg|g|mg|m|cm|s|ms|min|mol|pa|j|kj|n|w|v|a|hz|m\s*s-?1|mol\s*dm-?3)\b/i },
    ],
    requiredSignals: 1,
  },
  "show that": {
    guidance: "Show the working that leads to the stated result, then make the result clear.",
    signals: [
      { label: "working or result", pattern: /\d|=|[×÷+\-*/^]/i },
      { label: "conclusion", pattern: /\b(therefore|hence|so|thus|which shows|as required)\b/i },
    ],
    requiredSignals: 1,
  },
  suggest: {
    guidance: "Offer a practical, plausible suggestion rather than only repeating the observation.",
    signals: [
      { label: "suggestion", pattern: /\b(could|would|may|might|one way|recommend|increase|decrease|use|measure|repeat|control|change|test|record|investigate|improve|reduce)\b/i },
    ],
    requiredSignals: 1,
  },
  compare: {
    guidance: "Refer to both things and make the relationship explicit with a comparison.",
    signals: [
      { label: "comparison", pattern: /\b(both|whereas|while|similar|different|higher|lower|greater|less|more|fewer|same|than|compared)\b/i },
    ],
    requiredSignals: 1,
  },
  evaluate: {
    guidance: "Balance evidence or limitations, then reach a clear overall judgement.",
    signals: [
      { label: "balance", pattern: /\b(however|although|whereas|advantage|disadvantage|strength|limitation|benefit|drawback)\b/i },
      { label: "judgement", pattern: /\b(overall|conclusion|effective|valid|reliable|best|strong|weak|worth)\b/i },
    ],
    requiredSignals: 2,
  },
  discuss: {
    guidance: "Cover more than one side of the issue and finish with a reasoned view.",
    signals: [
      { label: "balance", pattern: /\b(however|although|whereas|on the other hand|advantage|disadvantage|benefit|drawback)\b/i },
      { label: "conclusion", pattern: /\b(overall|conclusion|therefore|most important|depends|likely)\b/i },
    ],
    requiredSignals: 2,
  },
  justify: {
    guidance: "State the choice or claim, then support it with an explicit reason.",
    signals: [{ label: "reason", pattern: /\b(because|therefore|since|due to|so that|as a result)\b/i }],
    requiredSignals: 1,
  },
  deduce: {
    guidance: "Link the evidence to the conclusion with an inference such as hence or therefore.",
    signals: [{ label: "inference", pattern: /\b(therefore|hence|thus|it follows|so|we can deduce|which means)\b/i }],
    requiredSignals: 1,
  },
  predict: {
    guidance: "State what is expected to happen and make the direction or outcome clear.",
    signals: [{ label: "prediction", pattern: /\b(will|would|likely|unlikely|expected|remain|stay|increase|decrease|rise|fall)\b/i }],
    requiredSignals: 1,
  },
  outline: {
    guidance: "Give the main stages or features in a clear sequence, without unnecessary detail.",
    signals: [{ label: "sequence", pattern: /\b(first|initially|then|next|finally|stage|step|followed by)\b|\n|;/i }],
    requiredSignals: 1,
  },
};

export function commandWordLabel(command: CommandWord): string {
  return command === "other" ? "Command word" : command.charAt(0).toUpperCase() + command.slice(1);
}

/** Resolve a part's verb, falling back to the question stem for shared prompts. */
export function commandWordForPart(
  question: Pick<Question, "stem">,
  part: Pick<QuestionPart, "prompt">,
): CommandWord {
  const partCommand = commandOf(part.prompt);
  return partCommand === "other" ? commandOf(question.stem) : partCommand;
}

function wordCount(answer: string): number {
  return answer.trim() ? answer.trim().split(/\s+/).length : 0;
}

/**
 * Check response shape only. This deliberately does not affect the mark: a
 * valid answer can use different wording, and a matching signal can still be
 * scientifically wrong.
 */
export function validateCommandWord(
  question: Pick<Question, "stem">,
  part: Pick<QuestionPart, "prompt">,
  answer: string,
): CommandWordValidation {
  const command = commandWordForPart(question, part);
  const label = commandWordLabel(command);
  if (command === "other") {
    return {
      command,
      label,
      status: "not-applicable",
      message: "No standard command word was detected, so there is no form check to run.",
      guidance: "Answer the question directly and use the mark scheme after marking.",
      evidence: [],
    };
  }

  const profile = PROFILES[command];
  const trimmed = answer.trim();
  if (!trimmed) {
    return {
      command,
      label,
      status: "empty",
      message: profile.guidance,
      guidance: profile.guidance,
      evidence: [],
    };
  }

  if (command === "state") {
    const concise = wordCount(trimmed) <= 20;
    return {
      command,
      label,
      status: concise ? "aligned" : "needs-attention",
      message: concise ? "Concise response shape detected — check that it gives the exact fact requested." : profile.guidance,
      guidance: profile.guidance,
      evidence: concise ? ["direct answer"] : [],
    };
  }

  const evidence = profile.signals.filter((signal) => signal.pattern.test(trimmed)).map((signal) => signal.label);
  const aligned = evidence.length >= profile.requiredSignals;
  return {
    command,
    label,
    status: aligned ? "aligned" : "needs-attention",
    message: aligned
      ? `Response shape includes ${evidence.join(" and ")}. Check the content against the mark scheme.`
      : profile.guidance,
    guidance: profile.guidance,
    evidence,
  };
}

