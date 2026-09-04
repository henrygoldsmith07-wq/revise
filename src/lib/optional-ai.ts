/**
 * Route-level AI imports. Keeping the provider client behind these functions
 * means the normal revision route does not load OCR/LLM adapters just because
 * a photo or generation feature exists elsewhere in the app.
 */

export async function aiOcr(...args: Parameters<(typeof import("@/ai/client"))["aiOcr"]>) {
  const { aiOcr: run } = await import("@/ai/client");
  return run(...args);
}

export async function aiCardsFromNotes(...args: Parameters<(typeof import("@/ai/client"))["aiCardsFromNotes"]>) {
  const { aiCardsFromNotes: run } = await import("@/ai/client");
  return run(...args);
}

export async function aiExtractQuestions(...args: Parameters<(typeof import("@/ai/client"))["aiExtractQuestions"]>) {
  const { aiExtractQuestions: run } = await import("@/ai/client");
  return run(...args);
}

export async function aiGenerateQuestions(...args: Parameters<(typeof import("@/ai/client"))["aiGenerateQuestions"]>) {
  const { aiGenerateQuestions: run } = await import("@/ai/client");
  return run(...args);
}

export async function aiMark(...args: Parameters<(typeof import("@/ai/client"))["aiMark"]>) {
  const { aiMark: run } = await import("@/ai/client");
  return run(...args);
}

export async function aiExplain(...args: Parameters<(typeof import("@/ai/client"))["aiExplain"]>) {
  const { aiExplain: run } = await import("@/ai/client");
  return run(...args);
}

export async function aiGenerateCards(...args: Parameters<(typeof import("@/ai/client"))["aiGenerateCards"]>) {
  const { aiGenerateCards: run } = await import("@/ai/client");
  return run(...args);
}

export async function aiSummarise(...args: Parameters<(typeof import("@/ai/client"))["aiSummarise"]>) {
  const { aiSummarise: run } = await import("@/ai/client");
  return run(...args);
}

export async function aiDiagnose(...args: Parameters<(typeof import("@/ai/client"))["aiDiagnose"]>) {
  const { aiDiagnose: run } = await import("@/ai/client");
  return run(...args);
}

export async function aiSocratic(...args: Parameters<(typeof import("@/ai/client"))["aiSocratic"]>) {
  const { aiSocratic: run } = await import("@/ai/client");
  return run(...args);
}

export async function aiVideoLesson(...args: Parameters<(typeof import("@/ai/client"))["aiVideoLesson"]>) {
  const { aiVideoLesson: run } = await import("@/ai/client");
  return run(...args);
}

export async function aiStatus(...args: Parameters<(typeof import("@/ai/client"))["aiStatus"]>) {
  const { aiStatus: run } = await import("@/ai/client");
  return run(...args);
}
