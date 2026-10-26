/**
 * A seeded random stream in [0, 1) (mulberry32). Small and well mixed in
 * every bit, so neighbouring seeds give unrelated streams.
 */
export function seededRandom(seed: number): () => number {
  let state = Math.floor(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic shuffle. Every mode that randomises needs the same seed to
 * produce the same order — otherwise a re-render reshuffles the board under
 * the student's finger, and tests cannot assert anything.
 *
 * Fisher–Yates over seededRandom. The previous generator took `state % n`
 * from a power-of-two LCG, whose low bits cycle, so a four-option question put
 * its answer first a third of the time and second only a sixth.
 */
export function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  const out = [...items];
  const random = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
