// Pure presentation rules for a question's text.

const normalise = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * A single-part question whose only prompt repeats the stem word for word.
 * The stem is then shown once (the part keeps the marks and answer box);
 * printing both made the first diagnostic question appear twice.
 */
export function stemRepeatsOnlyPart(question: { stem: string; parts: readonly { prompt: string }[] }): boolean {
  return question.parts.length === 1 && normalise(question.stem) !== "" && normalise(question.stem) === normalise(question.parts[0]!.prompt);
}
