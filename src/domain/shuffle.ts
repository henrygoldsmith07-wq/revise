/**
 * Deterministic shuffle. Every mode that randomises needs the same seed to
 * produce the same order — otherwise a re-render reshuffles the board under
 * the student's finger, and tests cannot assert anything.
 */
export function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = Math.abs(Math.floor(seed)) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
