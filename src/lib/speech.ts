"use client";

// Audio pronunciation, via the browser's own speech synthesis.
//
// No API call, no audio files, no network — which matters because the two
// things students most want spoken (a term they cannot pronounce, a definition
// to hear while walking) are exactly the moments they are offline. Cards that
// carry a recorded clip use that instead; this is the fallback for the other
// 99% of cards, and it costs nothing.

export function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export interface SpeakOptions {
  /** BCP-47. Subject content is English here, but the field keeps it open. */
  lang?: string;
  rate?: number;
  onEnd?: () => void;
}

/**
 * Strip the things that are written for the eye and unbearable in speech:
 * LaTeX, markdown syntax, cloze brackets and image/audio embeds.
 */
export function toSpokenText(text: string): string {
  return text
    .replace(/@\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\$\$([^$]+)\$\$/g, (_, expr: string) => speakMaths(expr))
    .replace(/\$([^$\n]+)\$/g, (_, expr: string) => speakMaths(expr))
    .replace(/\[…\]|\[\.\.\.\]/g, ", blank, ")
    .replace(/[*_`#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A small LaTeX-to-speech pass. Not complete — just the common operators. */
function speakMaths(expression: string): string {
  return expression
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, " $1 over $2 ")
    .replace(/\\sqrt\{([^}]*)\}/g, " square root of $1 ")
    .replace(/\^2/g, " squared ")
    .replace(/\^3/g, " cubed ")
    .replace(/\^\{?(-?\d+)\}?/g, " to the power $1 ")
    .replace(/_\{?(\w+)\}?/g, " sub $1 ")
    .replace(/\\times/g, " times ")
    .replace(/\\pm/g, " plus or minus ")
    .replace(/\\Delta/g, " delta ")
    .replace(/\\pi/g, " pi ")
    .replace(/[\\{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function speak(text: string, options: SpeakOptions = {}): void {
  if (!speechAvailable()) return;
  const spoken = toSpokenText(text);
  if (!spoken) return;

  // Cancel first: queued utterances otherwise pile up when a student taps
  // through cards quickly, and the audio runs minutes behind the screen.
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(spoken);
  utterance.lang = options.lang ?? "en-GB";
  utterance.rate = options.rate ?? 1;
  if (options.onEnd) utterance.onend = options.onEnd;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (speechAvailable()) window.speechSynthesis.cancel();
}
